import shlex

from .base_service import BaseService
from .config_schema import ConfigurationManager, DEFAULT_PROFILE_NAME, ProfileData
from .config_schema_generated import ConfigurationData, get_script_generation_logic
from .types import ConfigurationResponse, ProfileResponse, ProfilesResponse


class ConfigurationService(BaseService):
    def get_config(self) -> ConfigurationResponse:
        try:
            profile_data = self._get_profile_data()
            current_profile = profile_data["current_profile"]
            config = profile_data["profiles"].get(current_profile, dict(ConfigurationManager.get_defaults()))
            return self._success_response(ConfigurationResponse, config=config)
        except Exception as error:
            self.log.error(f"Error reading lsfg config: {error}")
            return self._error_response(ConfigurationResponse, str(error), config=None)

    def update_config_from_dict(self, config: ConfigurationData) -> ConfigurationResponse:
        try:
            profile_data = self._get_profile_data()
            return self.update_profile_config(profile_data["current_profile"], config)
        except Exception as error:
            self.log.error(f"Error updating lsfg config: {error}")
            return self._error_response(ConfigurationResponse, str(error), config=None)

    def update_lsfg_script(self, config: ConfigurationData) -> ConfigurationResponse:
        try:
            profile_data: ProfileData = {
                "current_profile": DEFAULT_PROFILE_NAME,
                "profiles": {DEFAULT_PROFILE_NAME: dict(config)},
                "global_config": {
                    "dll": config.get("dll", ""),
                    "no_fp16": config.get("no_fp16", False),
                },
            }
            return self.update_lsfg_script_from_profile_data(profile_data)
        except Exception as error:
            return self._error_response(ConfigurationResponse, str(error), config=None)

    def _generate_script_content_for_profile(self, profile_data: ProfileData) -> str:
        current_profile = profile_data["current_profile"]
        config = dict(profile_data["profiles"].get(current_profile, ConfigurationManager.get_defaults()))
        config["dll"] = profile_data["global_config"].get("dll", config.get("dll", ""))
        config["no_fp16"] = profile_data["global_config"].get("no_fp16", config.get("no_fp16", False))

        lines = ["#!/bin/bash"]
        lines.extend(get_script_generation_logic()(config))
        lines.extend(
            [
                f"export LSFGVK_CONFIG={shlex.quote(str(self.config_file_path))}",
                f"export LSFGVK_PROFILE={shlex.quote(current_profile)}",
                'exec "$@"',
            ]
        )
        return "\n".join(lines) + "\n"

    def _generate_script_content(self, config: ConfigurationData) -> str:
        profile_data: ProfileData = {
            "current_profile": DEFAULT_PROFILE_NAME,
            "profiles": {DEFAULT_PROFILE_NAME: dict(config)},
            "global_config": {
                "dll": config.get("dll", ""),
                "no_fp16": config.get("no_fp16", False),
            },
        }
        return self._generate_script_content_for_profile(profile_data)

    def _get_profile_data(self) -> ProfileData:
        if not self.config_file_path.exists():
            from .dll_detection import DllDetectionService

            default = ConfigurationManager.get_defaults_with_dll_detection(DllDetectionService(self.log))
            return ProfileData(
                current_profile=DEFAULT_PROFILE_NAME,
                profiles={DEFAULT_PROFILE_NAME: dict(default)},
                global_config={
                    "dll": default.get("dll", ""),
                    "no_fp16": default.get("no_fp16", False),
                },
            )

        profile_data = ConfigurationManager.parse_toml_content_multi_profile(
            self.config_file_path.read_text(encoding="utf-8")
        )
        if self.lsfg_script_path.exists():
            script_content = self.lsfg_script_path.read_text(encoding="utf-8")
            selected = ConfigurationManager.parse_profile_selection(script_content)
            if selected in profile_data["profiles"]:
                profile_data["current_profile"] = selected
            current_profile = profile_data["current_profile"]
            profile_data["profiles"][current_profile] = ConfigurationManager.merge_config_with_script(
                profile_data["profiles"][current_profile],
                ConfigurationManager.parse_script_content(script_content),
            )
        return profile_data

    def _save_profile_data(self, profile_data: ProfileData) -> None:
        self._write_file(
            self.config_file_path,
            ConfigurationManager.generate_toml_content_multi_profile(profile_data),
            0o644,
        )

    def get_profiles(self) -> ProfilesResponse:
        try:
            profile_data = self._get_profile_data()
            return self._success_response(
                ProfilesResponse,
                "Profiles retrieved successfully",
                profiles=list(profile_data["profiles"]),
                current_profile=profile_data["current_profile"],
            )
        except Exception as error:
            return self._error_response(
                ProfilesResponse,
                str(error),
                profiles=None,
                current_profile=None,
            )

    def create_profile(self, profile_name: str, source_profile: str = None) -> ProfileResponse:
        try:
            profile_data = self._get_profile_data()
            new_profile_data = ConfigurationManager.create_profile(profile_data, profile_name, source_profile)
            self._save_profile_data(new_profile_data)
            normalized = ConfigurationManager.normalize_profile_name(profile_name)
            return self._success_response(
                ProfileResponse,
                f"Profile '{normalized}' created successfully",
                profile_name=normalized,
            )
        except Exception as error:
            return self._error_response(ProfileResponse, str(error), profile_name=None)

    def delete_profile(self, profile_name: str) -> ProfileResponse:
        try:
            profile_data = ConfigurationManager.delete_profile(self._get_profile_data(), profile_name)
            self._save_profile_data(profile_data)
            script_result = self.update_lsfg_script_from_profile_data(profile_data)
            if not script_result["success"]:
                raise OSError(script_result["error"])
            return self._success_response(
                ProfileResponse,
                f"Profile '{profile_name}' deleted successfully",
                profile_name=profile_name,
            )
        except Exception as error:
            return self._error_response(ProfileResponse, str(error), profile_name=None)

    def rename_profile(self, old_name: str, new_name: str) -> ProfileResponse:
        try:
            profile_data = ConfigurationManager.rename_profile(self._get_profile_data(), old_name, new_name)
            self._save_profile_data(profile_data)
            script_result = self.update_lsfg_script_from_profile_data(profile_data)
            if not script_result["success"]:
                raise OSError(script_result["error"])
            normalized = ConfigurationManager.normalize_profile_name(new_name)
            return self._success_response(
                ProfileResponse,
                f"Profile renamed to '{normalized}' successfully",
                profile_name=normalized,
            )
        except Exception as error:
            return self._error_response(ProfileResponse, str(error), profile_name=None)

    def set_current_profile(self, profile_name: str) -> ProfileResponse:
        try:
            profile_data = ConfigurationManager.set_current_profile(self._get_profile_data(), profile_name)
            script_result = self.update_lsfg_script_from_profile_data(profile_data)
            if not script_result["success"]:
                raise OSError(script_result["error"])
            return self._success_response(
                ProfileResponse,
                f"Current profile set to '{profile_name}' successfully",
                profile_name=profile_name,
            )
        except Exception as error:
            return self._error_response(ProfileResponse, str(error), profile_name=None)

    def update_profile_config(self, profile_name: str, config: ConfigurationData) -> ConfigurationResponse:
        try:
            profile_data = self._get_profile_data()
            if profile_name not in profile_data["profiles"]:
                raise ValueError(f"Profile '{profile_name}' does not exist")

            validated = ConfigurationManager.validate_config(config)
            profile_data["profiles"][profile_name] = {
                **profile_data["profiles"][profile_name],
                **validated,
            }
            profile_data["global_config"]["dll"] = validated.get("dll", "")
            profile_data["global_config"]["no_fp16"] = validated.get("no_fp16", False)
            self._save_profile_data(profile_data)

            if profile_name == profile_data["current_profile"]:
                script_result = self.update_lsfg_script_from_profile_data(profile_data)
                if not script_result["success"]:
                    raise OSError(script_result["error"])

            return self._success_response(
                ConfigurationResponse,
                f"Profile '{profile_name}' configuration updated successfully",
                config=validated,
            )
        except Exception as error:
            return self._error_response(ConfigurationResponse, str(error), config=None)

    def update_lsfg_script_from_profile_data(self, profile_data: ProfileData) -> ConfigurationResponse:
        try:
            script_content = self._generate_script_content_for_profile(profile_data)
            self._write_file(self.lsfg_script_path, script_content, 0o755)
            current_config = profile_data["profiles"].get(
                profile_data["current_profile"],
                dict(ConfigurationManager.get_defaults()),
            )
            return self._success_response(
                ConfigurationResponse,
                "Launch script updated successfully",
                config=current_config,
            )
        except Exception as error:
            return self._error_response(ConfigurationResponse, str(error), config=None)
