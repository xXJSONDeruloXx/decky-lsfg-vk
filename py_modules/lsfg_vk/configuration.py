import re
import shlex
from typing import Any, Dict

from .base_service import BaseService
from .config_schema import ConfigurationManager, DEFAULT_PROFILE_NAME, ProfileData
from .runtime_service import RuntimeService


class ConfigurationService(BaseService):
    """Controller-facing adapter over upstream lsfg-vk profiles."""

    def __init__(self, logger=None, runtime_service: RuntimeService = None):
        super().__init__(logger)
        self.runtime_service = runtime_service or RuntimeService(logger=self.log)

    def _default_data(self) -> ProfileData:
        defaults = ConfigurationManager.validate_config({})
        return {"current_profile": DEFAULT_PROFILE_NAME, "profiles": {DEFAULT_PROFILE_NAME: defaults}, "global_config": {"dll": "", "no_fp16": False}}

    def _get_profile_data(self) -> ProfileData:
        if not self.config_file_path.exists():
            return self._default_data()
        return ConfigurationManager.parse_toml_content_multi_profile(self.config_file_path.read_text(encoding="utf-8"))

    def _save_profile_data(self, data: ProfileData) -> None:
        content = ConfigurationManager.generate_toml_content_multi_profile(data)
        self.runtime_service.validate_config_content(content)
        self._write_file(self.config_file_path, content, 0o644)

    @staticmethod
    def _game_profile_name(appid: str) -> str:
        if not re.fullmatch(r"[0-9]+", str(appid)):
            raise ValueError("appid must be numeric")
        return f"game-{appid}"

    @staticmethod
    def _public_config(config: Dict[str, Any]) -> Dict[str, Any]:
        return ConfigurationManager.validate_config(config)

    def get_config(self) -> Dict[str, Any]:
        try:
            data = self._get_profile_data()
            return self._success_response(dict, config=self._public_config(data["profiles"][DEFAULT_PROFILE_NAME]))
        except Exception as error:
            self.log.error(f"Error reading lsfg config: {error}")
            return self._error_response(dict, str(error), config=None)

    def get_game_configs(self) -> Dict[str, Any]:
        try:
            data = self._get_profile_data()
            games = []
            for name, raw in data["profiles"].items():
                active_in = raw.get("active_in", [])
                if len(active_in) != 1 or not str(active_in[0]).isdigit():
                    continue
                games.append({"appid": str(active_in[0]), "profile": name, "config": self._public_config(raw)})
            return self._success_response(dict, default=self._public_config(data["profiles"][DEFAULT_PROFILE_NAME]), games=games)
        except Exception as error:
            self.log.error(f"Error reading game configs: {error}")
            return self._error_response(dict, str(error), default=None, games=[])

    def get_game_config(self, appid: str) -> Dict[str, Any]:
        try:
            data = self._get_profile_data()
            name = self._game_profile_name(appid)
            profile = data["profiles"].get(name)
            if profile is None:
                profile = next((value for value in data["profiles"].values() if str(appid) in value.get("active_in", [])), None)
            return self._success_response(dict, appid=str(appid), exists=profile is not None, config=self._public_config(profile or data["profiles"][DEFAULT_PROFILE_NAME]))
        except Exception as error:
            return self._error_response(dict, str(error), appid=str(appid), exists=False, config=None)

    def update_game_config(self, appid: str, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            data = self._get_profile_data()
            name = self._game_profile_name(appid)
            validated = self._public_config(config)
            validated["active_in"] = [str(appid)]
            data["profiles"][name] = validated
            self._save_profile_data(data)
            return self._success_response(dict, appid=str(appid), config=validated)
        except Exception as error:
            return self._error_response(dict, str(error), appid=str(appid), config=None)

    def reset_game_config(self, appid: str) -> Dict[str, Any]:
        try:
            data = self._get_profile_data()
            name = self._game_profile_name(appid)
            data["profiles"].pop(name, None)
            for profile_name, profile in list(data["profiles"].items()):
                if profile_name != DEFAULT_PROFILE_NAME and str(appid) in profile.get("active_in", []):
                    data["profiles"].pop(profile_name)
            self._save_profile_data(data)
            return self._success_response(dict, appid=str(appid), config=self._public_config(data["profiles"][DEFAULT_PROFILE_NAME]))
        except Exception as error:
            return self._error_response(dict, str(error), appid=str(appid), config=None)

    def reset_all_game_configs(self) -> Dict[str, Any]:
        try:
            data = self._get_profile_data()
            data["profiles"] = {DEFAULT_PROFILE_NAME: data["profiles"][DEFAULT_PROFILE_NAME]}
            self._save_profile_data(data)
            return self._success_response(dict, default=self._public_config(data["profiles"][DEFAULT_PROFILE_NAME]), games=[])
        except Exception as error:
            return self._error_response(dict, str(error), default=None, games=[])

    def update_config_from_dict(self, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            data = self._get_profile_data()
            validated = self._public_config(config)
            validated["active_in"] = []
            data["profiles"][DEFAULT_PROFILE_NAME] = validated
            data["global_config"] = {"dll": validated.get("dll", ""), "no_fp16": validated.get("no_fp16", False)}
            self._save_profile_data(data)
            return self._success_response(dict, config=validated)
        except Exception as error:
            return self._error_response(dict, str(error), config=None)

    def update_lsfg_script(self, config: Dict[str, Any]) -> Dict[str, Any]:
        return self.update_config_from_dict(config)

    def _generate_script_content_for_profile(self, profile_data: ProfileData) -> str:
        return "#!/bin/bash\n" f"export LSFGVK_CONFIG={shlex.quote(str(self.config_file_path))}\n" 'exec "$@"\n'

    def _generate_script_content(self, config: Dict[str, Any]) -> str:
        return self._generate_script_content_for_profile(self._default_data())

    def update_lsfg_script_from_profile_data(self, profile_data: ProfileData) -> Dict[str, Any]:
        try:
            self._write_file(self.lsfg_script_path, self._generate_script_content_for_profile(profile_data), 0o755)
            return self._success_response(dict)
        except Exception as error:
            return self._error_response(dict, str(error))
