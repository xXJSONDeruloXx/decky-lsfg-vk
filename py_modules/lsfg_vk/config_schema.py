"""Small adapter for the upstream lsfg-vk v2 configuration format."""

import json
import sys
import tomllib
from pathlib import Path
from typing import Any, Dict, TypedDict

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

ConfigurationData = Dict[str, Any]


class ProfileData(TypedDict):
    profiles: Dict[str, Dict[str, Any]]
    global_config: Dict[str, Any]


PROFILE_DEFAULTS: Dict[str, Any] = {
    "active_in": [],
    "pacing_mode": "vsync",
    "multiplier": 2,
    "flow_scale": 0.8,
    "performance_mode": False,
    "override_present_mode": True,
    "preserve_swapchain_image_count": False,
}
GLOBAL_DEFAULTS: Dict[str, Any] = {"dll": "", "no_fp16": False}


def _toml_value(value: Any) -> str:
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, str):
        return json.dumps(value)
    if isinstance(value, list):
        return "[ " + ", ".join(_toml_value(item) for item in value) + " ]"
    return str(value)


def _normalize_active_in(value: Any) -> list[str]:
    if value in (None, ""):
        return []
    if isinstance(value, str):
        return [value]
    if not isinstance(value, list):
        raise ValueError("active_in must be a string or list of strings")
    return [str(item) for item in value if str(item)]


class ConfigurationManager:
    @staticmethod
    def get_defaults() -> Dict[str, Any]:
        return {**GLOBAL_DEFAULTS, **PROFILE_DEFAULTS}

    @staticmethod
    def validate_config(config: Dict[str, Any]) -> Dict[str, Any]:
        result = {**PROFILE_DEFAULTS, **GLOBAL_DEFAULTS}
        result.update({key: value for key, value in config.items() if key in result})
        result["active_in"] = _normalize_active_in(result.get("active_in"))
        result["pacing_mode"] = str(result.get("pacing_mode", "vsync")).lower()
        if result["pacing_mode"] != "vsync":
            raise ValueError("pacing_mode must be vsync")
        result["multiplier"] = int(result["multiplier"])
        if result["multiplier"] < 1:
            raise ValueError("multiplier must be 1 or greater")
        result["flow_scale"] = float(result["flow_scale"])
        if not 0.25 <= result["flow_scale"] <= 1.0:
            raise ValueError("flow_scale must be between 0.25 and 1.0")
        for name in ("no_fp16", "performance_mode", "override_present_mode", "preserve_swapchain_image_count"):
            result[name] = bool(result[name])
        result["dll"] = str(result.get("dll") or "")
        return result

    @staticmethod
    def _migrate_dll_path(value: Any) -> str:
        path_value = str(value or "")
        if not path_value:
            return ""
        path = Path(path_value)
        if path.name.lower() in {"lossless.dll"}:
            return str(path.with_name("lsfg-vk.dll"))
        return path_value

    @staticmethod
    def _config_from_profile(profile: Dict[str, Any], global_config: Dict[str, Any]) -> Dict[str, Any]:
        raw = dict(profile)
        if "pacing_mode" not in raw and "pacing" in raw:
            raw["pacing_mode"] = raw["pacing"]
        if "override_present_mode" not in raw and "experimental_present_mode" in raw:
            raw["override_present_mode"] = raw["experimental_present_mode"] == "fifo"
        raw["dll"] = global_config.get("dll", "")
        raw["no_fp16"] = global_config.get("no_fp16", False)
        return ConfigurationManager.validate_config(raw)

    @staticmethod
    def generate_toml_content_multi_profile(profile_data: ProfileData) -> str:
        global_config = {**GLOBAL_DEFAULTS, **profile_data.get("global_config", {})}
        lines = ["version = 2", "", "[global]"]
        dll = ConfigurationManager._migrate_dll_path(global_config.get("dll"))
        if dll:
            lines.append(f"dll = {_toml_value(dll)}")
        lines.append(f"allow_fp16 = {_toml_value(not bool(global_config.get('no_fp16', False)))}")
        profiles = sorted(profile_data["profiles"].items())
        if not profiles:
            profiles = [("", {})]
        for name, raw in profiles:
            config = ConfigurationManager.validate_config({**raw, **global_config})
            lines.extend(["", "[[profile]]", f"name = {_toml_value(name)}"])
            if config["active_in"]:
                lines.append(f"active_in = {_toml_value(config['active_in'])}")
            lines.extend([
                f"pacing_mode = {_toml_value(config['pacing_mode'])}",
                f"multiplier = {config['multiplier']}",
                f"flow_scale = {config['flow_scale']}",
                f"performance_mode = {_toml_value(config['performance_mode'])}",
                f"override_present_mode = {_toml_value(config['override_present_mode'])}",
                f"preserve_swapchain_image_count = {_toml_value(config['preserve_swapchain_image_count'])}",
            ])
        return "\n".join(lines) + "\n"

    @staticmethod
    def parse_toml_content_multi_profile(content: str) -> ProfileData:
        data = tomllib.loads(content)
        version = data.get("version")
        if version not in (1, 2):
            raise ValueError("unsupported lsfg-vk configuration version")
        raw_global = dict(data.get("global", {}))
        global_config = {
            "dll": ConfigurationManager._migrate_dll_path(raw_global.get("dll", "")),
            "no_fp16": not bool(raw_global.get("allow_fp16", True)),
        }
        profiles: Dict[str, Dict[str, Any]] = {}
        source_profiles = data.get("game", []) if version == 1 else data.get("profile", [])
        for profile in source_profiles:
            name = str(profile.get("exe" if version == 1 else "name", ""))
            config = ConfigurationManager._config_from_profile(profile, global_config)
            if config["active_in"]:
                profiles[name] = config
        return {"profiles": profiles, "global_config": global_config}

    @staticmethod
    def is_legacy_v1(content: str) -> bool:
        try:
            return tomllib.loads(content).get("version") == 1
        except tomllib.TOMLDecodeError:
            return False
