import json
import re
import shlex
import sys
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, TypedDict, Union, cast

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from shared_config import CONFIG_SCHEMA_DEF, ConfigFieldType, get_defaults
from .config_schema_generated import ConfigurationData, get_script_parsing_logic


@dataclass
class ConfigField:
    name: str
    field_type: ConfigFieldType
    default: Union[bool, int, float, str]
    description: str


CONFIG_SCHEMA: Dict[str, ConfigField] = {
    name: ConfigField(
        name=definition["name"],
        field_type=ConfigFieldType(definition["fieldType"]),
        default=definition["default"],
        description=definition["description"],
    )
    for name, definition in CONFIG_SCHEMA_DEF.items()
}

SCRIPT_ONLY_FIELDS = {
    name
    for name, definition in CONFIG_SCHEMA_DEF.items()
    if definition["location"] == "script"
}
DEFAULT_PROFILE_NAME = "decky-lsfg-vk"


class ProfileData(TypedDict):
    current_profile: str
    profiles: Dict[str, Dict[str, Any]]
    global_config: Dict[str, Any]


def _toml_value(value: Any) -> str:
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, str):
        return json.dumps(value)
    if isinstance(value, list):
        return "[ " + ", ".join(_toml_value(item) for item in value) + " ]"
    return str(value)


class ConfigurationManager:
    @staticmethod
    def get_defaults() -> ConfigurationData:
        return cast(ConfigurationData, dict(get_defaults()))

    @staticmethod
    def get_defaults_with_dll_detection(dll_detection_service=None) -> ConfigurationData:
        defaults = ConfigurationManager.get_defaults()
        if dll_detection_service is not None:
            result = dll_detection_service.check_lossless_scaling_dll()
            if result.get("detected") and result.get("path"):
                defaults["dll"] = result["path"]
        return defaults

    @staticmethod
    def get_field_names() -> list[str]:
        return list(CONFIG_SCHEMA)

    @staticmethod
    def get_field_types() -> Dict[str, ConfigFieldType]:
        return {name: field.field_type for name, field in CONFIG_SCHEMA.items()}

    @staticmethod
    def validate_config(config: Dict[str, Any]) -> ConfigurationData:
        validated: Dict[str, Any] = {}
        for name, field in CONFIG_SCHEMA.items():
            value = config.get(name, field.default)
            if field.field_type == ConfigFieldType.BOOLEAN:
                value = value.lower() in {"true", "1", "yes", "on"} if isinstance(value, str) else bool(value)
            elif field.field_type == ConfigFieldType.INTEGER:
                value = int(value)
            elif field.field_type == ConfigFieldType.FLOAT:
                value = float(value)
            else:
                value = str(value)
            validated[name] = value

        if validated["multiplier"] < 1:
            raise ValueError("multiplier must be 1 or greater")
        if not 0.25 <= validated["flow_scale"] <= 1.0:
            raise ValueError("flow_scale must be between 0.25 and 1.0")
        if validated["experimental_present_mode"] not in {"fifo", "mailbox"}:
            raise ValueError("experimental_present_mode must be fifo or mailbox")
        return cast(ConfigurationData, validated)

    @staticmethod
    def _migrate_dll_path(value: Any) -> str:
        path_value = str(value or "")
        if not path_value:
            return ""
        path = Path(path_value)
        if path.name.lower() in {"lossless.dll", "losslessscaling.dll"}:
            return str(path.with_name("lsfg-vk.dll"))
        return path_value

    @staticmethod
    def _config_from_profile(profile: Dict[str, Any], global_config: Dict[str, Any]) -> Dict[str, Any]:
        config: Dict[str, Any] = dict(ConfigurationManager.get_defaults())
        for field in ("multiplier", "flow_scale", "performance_mode"):
            if field in profile:
                config[field] = profile[field]
        config["experimental_present_mode"] = "fifo" if bool(profile.get("override_present_mode", True)) else "mailbox"
        config["dll"] = global_config.get("dll", "")
        config["no_fp16"] = global_config.get("no_fp16", False)
        for field in ("active_in", "pacing", "preserve_swapchain_image_count"):
            if field in profile:
                config[field] = profile[field]
        return {**config, **ConfigurationManager.validate_config(config)}

    @staticmethod
    def generate_toml_content(config: ConfigurationData) -> str:
        profile_data: ProfileData = {
            "current_profile": DEFAULT_PROFILE_NAME,
            "profiles": {DEFAULT_PROFILE_NAME: dict(config)},
            "global_config": {
                "dll": config.get("dll", ""),
                "no_fp16": config.get("no_fp16", False),
            },
        }
        return ConfigurationManager.generate_toml_content_multi_profile(profile_data)

    @staticmethod
    def generate_toml_content_multi_profile(profile_data: ProfileData) -> str:
        global_config = profile_data["global_config"]
        lines = ["version = 2", "", "[global]"]
        dll = ConfigurationManager._migrate_dll_path(global_config.get("dll", ""))
        if dll:
            lines.append(f"dll = {_toml_value(dll)}")
        lines.append(f"allow_fp16 = {_toml_value(not bool(global_config.get('no_fp16', False)))}")
        if global_config.get("log_level"):
            lines.append(f"log_level = {_toml_value(global_config['log_level'])}")
        if global_config.get("log_file"):
            lines.append(f"log_file = {_toml_value(global_config['log_file'])}")

        profiles = sorted(
            profile_data["profiles"].items(),
            key=lambda item: (item[0] != DEFAULT_PROFILE_NAME, item[0]),
        )
        for profile_name, raw_config in profiles:
            config = ConfigurationManager.validate_config(raw_config)
            lines.extend(["", "[[profile]]", f"name = {_toml_value(profile_name)}"])
            active_in = raw_config.get("active_in")
            if active_in not in (None, "", []):
                lines.append(f"active_in = {_toml_value(active_in)}")
            lines.extend(
                [
                    f"multiplier = {config['multiplier']}",
                    f"flow_scale = {config['flow_scale']}",
                    f"performance_mode = {_toml_value(config['performance_mode'])}",
                    f"pacing = {_toml_value(raw_config.get('pacing', 'vsync'))}",
                    f"override_present_mode = {_toml_value(config['experimental_present_mode'] == 'fifo')}",
                    f"preserve_swapchain_image_count = {_toml_value(bool(raw_config.get('preserve_swapchain_image_count', False)))}",
                ]
            )
        return "\n".join(lines) + "\n"

    @staticmethod
    def _profile_data_from_v1(data: Dict[str, Any]) -> ProfileData:
        old_global = dict(data.get("global", {}))
        global_config: Dict[str, Any] = {
            "dll": ConfigurationManager._migrate_dll_path(old_global.get("dll", "")),
            "no_fp16": bool(old_global.get("no_fp16", False)),
        }
        profiles: Dict[str, Dict[str, Any]] = {}
        for game in data.get("game", []):
            profile_name = str(game.get("exe", DEFAULT_PROFILE_NAME))
            config: Dict[str, Any] = dict(ConfigurationManager.get_defaults())
            for field in ("multiplier", "flow_scale", "performance_mode", "experimental_present_mode"):
                if field in game:
                    config[field] = game[field]
            config["dll"] = global_config["dll"]
            config["no_fp16"] = global_config["no_fp16"]
            profiles[profile_name] = dict(ConfigurationManager.validate_config(config))

        if not profiles:
            profiles[DEFAULT_PROFILE_NAME] = dict(ConfigurationManager.get_defaults())

        current_profile = str(old_global.get("current_profile", DEFAULT_PROFILE_NAME))
        if current_profile not in profiles:
            current_profile = DEFAULT_PROFILE_NAME if DEFAULT_PROFILE_NAME in profiles else next(iter(profiles))
        return ProfileData(
            current_profile=current_profile,
            profiles=profiles,
            global_config=global_config,
        )

    @staticmethod
    def is_legacy_v1(content: str) -> bool:
        try:
            return tomllib.loads(content).get("version") == 1
        except tomllib.TOMLDecodeError:
            return False

    @staticmethod
    def parse_toml_content_multi_profile(content: str) -> ProfileData:
        data = tomllib.loads(content)
        version = data.get("version")
        if version == 1:
            return ConfigurationManager._profile_data_from_v1(data)
        if version != 2:
            raise ValueError("unsupported lsfg-vk configuration version")

        raw_global = dict(data.get("global", {}))
        global_config: Dict[str, Any] = {
            "dll": ConfigurationManager._migrate_dll_path(raw_global.get("dll", "")),
            "no_fp16": not bool(raw_global.get("allow_fp16", True)),
        }
        for field in ("log_level", "log_file"):
            if field in raw_global:
                global_config[field] = raw_global[field]

        profiles: Dict[str, Dict[str, Any]] = {}
        for profile in data.get("profile", []):
            profile_name = str(profile.get("name", DEFAULT_PROFILE_NAME))
            profiles[profile_name] = ConfigurationManager._config_from_profile(profile, global_config)

        if not profiles:
            default = dict(ConfigurationManager.get_defaults())
            default["dll"] = global_config["dll"]
            default["no_fp16"] = global_config["no_fp16"]
            profiles[DEFAULT_PROFILE_NAME] = default

        current_profile = DEFAULT_PROFILE_NAME if DEFAULT_PROFILE_NAME in profiles else next(iter(profiles))
        return ProfileData(
            current_profile=current_profile,
            profiles=profiles,
            global_config=global_config,
        )

    @staticmethod
    def parse_toml_content(content: str) -> ConfigurationData:
        profile_data = ConfigurationManager.parse_toml_content_multi_profile(content)
        return cast(ConfigurationData, profile_data["profiles"][profile_data["current_profile"]])

    @staticmethod
    def parse_script_content(script_content: str) -> Dict[str, Union[bool, int, str]]:
        return get_script_parsing_logic()(script_content.splitlines())

    @staticmethod
    def parse_profile_selection(script_content: str) -> str | None:
        selected = None
        for line in script_content.splitlines():
            try:
                tokens = shlex.split(line)
            except ValueError:
                continue
            if len(tokens) != 2 or tokens[0] != "export" or "=" not in tokens[1]:
                continue
            key, value = tokens[1].split("=", 1)
            if key in {"LSFGVK_PROFILE", "LSFG_PROCESS"} and value:
                selected = value
        return selected

    @staticmethod
    def merge_config_with_script(
        toml_config: Dict[str, Any],
        script_values: Dict[str, Union[bool, int, str]],
    ) -> Dict[str, Any]:
        merged = dict(toml_config)
        for field in SCRIPT_ONLY_FIELDS:
            if field in script_values:
                merged[field] = script_values[field]
        return merged

    @staticmethod
    def normalize_profile_name(profile_name: str) -> str:
        return re.sub(r"\s+", "-", profile_name.strip()).strip("-")

    @staticmethod
    def validate_profile_name(profile_name: str) -> bool:
        normalized = ConfigurationManager.normalize_profile_name(profile_name)
        invalid = '\t\n\r\'"\\/$|&;()<>{}[]' + "`" + '*?'
        return (
            bool(normalized)
            and not any(character in invalid for character in normalized)
            and normalized.lower() not in {"global", "profile"}
        )

    @staticmethod
    def create_profile(profile_data: ProfileData, profile_name: str, source_profile: str = None) -> ProfileData:
        if not ConfigurationManager.validate_profile_name(profile_name):
            raise ValueError(f"Invalid profile name: {profile_name}")
        normalized = ConfigurationManager.normalize_profile_name(profile_name)
        if normalized in profile_data["profiles"]:
            raise ValueError(f"Profile '{normalized}' already exists")
        source = source_profile if source_profile in profile_data["profiles"] else profile_data["current_profile"]
        profiles = dict(profile_data["profiles"])
        profiles[normalized] = dict(profiles[source])
        return ProfileData(
            current_profile=profile_data["current_profile"],
            profiles=profiles,
            global_config=dict(profile_data["global_config"]),
        )

    @staticmethod
    def delete_profile(profile_data: ProfileData, profile_name: str) -> ProfileData:
        if profile_name == DEFAULT_PROFILE_NAME:
            raise ValueError("Cannot delete the default profile")
        if profile_name not in profile_data["profiles"]:
            raise ValueError(f"Profile '{profile_name}' does not exist")
        profiles = dict(profile_data["profiles"])
        del profiles[profile_name]
        current_profile = profile_data["current_profile"]
        if current_profile == profile_name:
            current_profile = DEFAULT_PROFILE_NAME if DEFAULT_PROFILE_NAME in profiles else next(iter(profiles))
        return ProfileData(
            current_profile=current_profile,
            profiles=profiles,
            global_config=dict(profile_data["global_config"]),
        )

    @staticmethod
    def rename_profile(profile_data: ProfileData, old_name: str, new_name: str) -> ProfileData:
        if old_name == DEFAULT_PROFILE_NAME:
            raise ValueError("Cannot rename the default profile")
        if old_name not in profile_data["profiles"] or not ConfigurationManager.validate_profile_name(new_name):
            raise ValueError("Invalid profile rename")
        normalized = ConfigurationManager.normalize_profile_name(new_name)
        if normalized in profile_data["profiles"]:
            raise ValueError(f"Profile '{normalized}' already exists")
        profiles = {
            normalized if name == old_name else name: value
            for name, value in profile_data["profiles"].items()
        }
        current_profile = normalized if profile_data["current_profile"] == old_name else profile_data["current_profile"]
        return ProfileData(
            current_profile=current_profile,
            profiles=profiles,
            global_config=dict(profile_data["global_config"]),
        )

    @staticmethod
    def set_current_profile(profile_data: ProfileData, profile_name: str) -> ProfileData:
        if profile_name not in profile_data["profiles"]:
            raise ValueError(f"Profile '{profile_name}' does not exist")
        return ProfileData(
            current_profile=profile_name,
            profiles=dict(profile_data["profiles"]),
            global_config=dict(profile_data["global_config"]),
        )
