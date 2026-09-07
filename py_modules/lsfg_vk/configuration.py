import re
from typing import Any, Dict

from .base_service import BaseService
from .config_schema import ConfigurationManager, ProfileData
from .runtime_service import RuntimeService


class ConfigurationService(BaseService):
    """Controller-facing adapter over upstream lsfg-vk profiles."""

    def __init__(self, logger=None, runtime_service: RuntimeService = None):
        super().__init__(logger)
        self.runtime_service = runtime_service or RuntimeService(logger=self.log)

    def _default_data(self) -> ProfileData:
        return {"profiles": {}, "global_config": {"dll": "", "no_fp16": False}}

    def _get_profile_data(self) -> ProfileData:
        if not self.config_file_path.exists():
            return self._default_data()
        return ConfigurationManager.parse_toml_content_multi_profile(self.config_file_path.read_text(encoding="utf-8"))

    def _save_profile_data(self, data: ProfileData) -> None:
        content = ConfigurationManager.generate_toml_content_multi_profile(data)
        self.runtime_service.validate_config_content(content)
        self._write_file(self.config_file_path, content, 0o644)

    @staticmethod
    def _profile_name(data: ProfileData, appid: str, game_name: str) -> str:
        name = str(game_name).strip()
        if not name:
            raise ValueError("game name is required")
        existing = data["profiles"].get(name)
        if existing is not None and str(appid) not in existing.get("active_in", []):
            name = f"{name} ({appid})"
        return name

    @staticmethod
    def _profile_for_appid(data: ProfileData, appid: str):
        return next(
            (
                (name, profile)
                for name, profile in data["profiles"].items()
                if str(appid) in profile.get("active_in", [])
            ),
            (None, None),
        )

    @staticmethod
    def _public_config(config: Dict[str, Any]) -> Dict[str, Any]:
        return ConfigurationManager.validate_config(config)

    def get_game_configs(self) -> Dict[str, Any]:
        try:
            data = self._get_profile_data()
            games = []
            for name, raw in data["profiles"].items():
                active_in = raw.get("active_in", [])
                if len(active_in) != 1 or not re.fullmatch(r"-?[0-9]+", str(active_in[0])):
                    continue
                games.append({"appid": str(active_in[0]), "profile": name, "config": self._public_config(raw)})
            return self._success_response(dict, global_config=dict(data["global_config"]), games=games)
        except Exception as error:
            self.log.error(f"Error reading game configs: {error}")
            return self._error_response(dict, str(error), games=[])

    def update_game_config(self, appid: str, game_name: str, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            data = self._get_profile_data()
            old_name, _ = self._profile_for_appid(data, appid)
            name = self._profile_name(data, appid, game_name)
            merged_config = {**data["global_config"], **config}
            if not config.get("dll"):
                merged_config["dll"] = data["global_config"].get("dll", "")
            validated = self._public_config(merged_config)
            validated["active_in"] = [str(appid)]
            data["global_config"] = {
                "dll": validated["dll"],
                "no_fp16": validated["no_fp16"],
            }
            if old_name and old_name != name:
                data["profiles"].pop(old_name, None)
            data["profiles"][name] = validated
            self._save_profile_data(data)
            return self._success_response(dict, appid=str(appid), config=validated)
        except Exception as error:
            return self._error_response(dict, str(error), appid=str(appid), config=None)

    def reset_game_config(self, appid: str) -> Dict[str, Any]:
        try:
            data = self._get_profile_data()
            name, _ = self._profile_for_appid(data, appid)
            if name:
                data["profiles"].pop(name, None)
            self._save_profile_data(data)
            return self._success_response(dict, appid=str(appid), exists=False)
        except Exception as error:
            return self._error_response(dict, str(error), appid=str(appid), config=None)

    def reset_all_game_configs(self) -> Dict[str, Any]:
        try:
            data = self._get_profile_data()
            data["profiles"] = {}
            self._save_profile_data(data)
            return self._success_response(dict, global_config=dict(data["global_config"]), games=[])
        except Exception as error:
            return self._error_response(dict, str(error), games=[])
