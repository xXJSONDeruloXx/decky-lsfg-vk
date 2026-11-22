import re
import time
from pathlib import Path
from typing import Any, Dict

from .base_service import BaseService
from .config_schema import ConfigurationManager, ProfileData, UnsupportedConfigurationVersion
from .runtime_service import RuntimeService


class ConfigurationService(BaseService):
    FLATPAK_PROFILE_PREFIX = "flatpak:"

    def __init__(self, logger=None, runtime_service: RuntimeService = None):
        super().__init__(logger)
        self.runtime_service = runtime_service or RuntimeService(logger=self.log)

    def _default_data(self) -> ProfileData:
        return {"profiles": {}, "global_config": {"dll": "", "no_fp16": False}}

    def _reset_legacy_config(self, version: Any) -> ProfileData:
        data = self._default_data()
        self._remove_if_exists(self.config_file_path)
        content = ConfigurationManager.generate_toml_content_multi_profile(data)
        self._write_file(self.config_file_path, content)
        self.log.warning(
            f"Removed legacy lsfg-vk configuration version {version!r}; reset conf.toml to v2 defaults"
        )
        return data

    def _get_profile_data(self) -> ProfileData:
        if not self.config_file_path.exists():
            return self._default_data()
        content = self.config_file_path.read_text(encoding="utf-8")
        try:
            return ConfigurationManager.parse_toml_content_multi_profile(content)
        except UnsupportedConfigurationVersion as error:
            if not ConfigurationManager.is_discardable_legacy_version(error.version):
                raise
            return self._reset_legacy_config(error.version)

    BACKUP_COUNT = 3
    BACKUP_INTERVAL_SECONDS = 600

    def _backup_path(self, index: int) -> Path:
        return self.config_file_path.with_name(f"{self.config_file_path.name}.bak.{index}")

    def _rotate_backups(self, new_content: str) -> None:
        """Keep the last few versions of conf.toml so a bad change can be undone.

        Slider drags save many times in a row, so a new snapshot is only taken
        once the newest one is older than BACKUP_INTERVAL_SECONDS.
        """
        try:
            if not self.config_file_path.is_file():
                return
            current = self.config_file_path.read_text(encoding="utf-8")
            if current == new_content:
                return
            newest = self._backup_path(1)
            if newest.is_file() and time.time() - newest.stat().st_mtime < self.BACKUP_INTERVAL_SECONDS:
                return
            for index in range(self.BACKUP_COUNT, 1, -1):
                older = self._backup_path(index - 1)
                if older.is_file():
                    self._write_file(self._backup_path(index), older.read_text(encoding="utf-8"))
            self._write_file(newest, current)
        except Exception as error:
            self.log.warning(f"Could not back up lsfg-vk configuration: {error}")

    def _save_profile_data(self, data: ProfileData) -> None:
        content = ConfigurationManager.generate_toml_content_multi_profile(data)
        self.runtime_service.validate_config_content(content)
        self._rotate_backups(content)
        self._write_file(self.config_file_path, content, 0o644)

    def get_config_backup_info(self) -> Dict[str, Any]:
        newest = self._backup_path(1)
        if not newest.is_file():
            return self._success_response(dict, available=False, saved_at=None, count=0)
        count = sum(1 for index in range(1, self.BACKUP_COUNT + 1) if self._backup_path(index).is_file())
        return self._success_response(dict, available=True, saved_at=int(newest.stat().st_mtime), count=count)

    def restore_config_backup(self) -> Dict[str, Any]:
        """Swap conf.toml with the newest backup, so the restore can be undone too."""
        try:
            newest = self._backup_path(1)
            if not newest.is_file():
                raise FileNotFoundError("There is no earlier configuration to restore")
            backup_content = newest.read_text(encoding="utf-8")
            ConfigurationManager.parse_toml_content_multi_profile(backup_content)
            self.runtime_service.validate_config_content(backup_content)
            current = (
                self.config_file_path.read_text(encoding="utf-8")
                if self.config_file_path.is_file()
                else None
            )
            self._write_file(self.config_file_path, backup_content, 0o644)
            if current is not None:
                self._write_file(newest, current)
            return self._success_response(dict, "Restored the previous configuration")
        except Exception as error:
            self.log.error(f"Error restoring lsfg-vk configuration: {error}")
            return self._error_response(dict, str(error))

    SHARED_PROFILE_FIELDS = (
        "multiplier",
        "flow_scale",
        "performance_mode",
        "override_present_mode",
        "preserve_swapchain_image_count",
    )

    def apply_config_to_all_games(self, appid: str) -> Dict[str, Any]:
        """Copy one game's tuning to every other game profile (not Flatpak apps)."""
        try:
            data = self._get_profile_data()
            source_name, source = self._profile_for_appid(data, appid)
            if source is None:
                raise ValueError("That game has no profile to copy from")
            updated = 0
            for name, profile in data["profiles"].items():
                active_in = profile.get("active_in", [])
                if name == source_name or len(active_in) != 1:
                    continue
                if not re.fullmatch(r"-?[0-9]+", str(active_in[0])):
                    continue
                profile.update({field: source[field] for field in self.SHARED_PROFILE_FIELDS})
                updated += 1
            if updated:
                self._save_profile_data(data)
            return self._success_response(dict, f"Updated {updated} game profile(s)", updated=updated)
        except Exception as error:
            return self._error_response(dict, str(error), updated=0)

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

    @classmethod
    def flatpak_profile_name(cls, app_id: str) -> str:
        value = str(app_id).strip()
        if not value:
            raise ValueError("Flatpak application ID is required")
        return f"{cls.FLATPAK_PROFILE_PREFIX}{value}"

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

    def update_global_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            data = self._get_profile_data()
            merged_config = {**data["global_config"], **config}
            validated = self._public_config(merged_config)
            data["global_config"] = {
                "dll": validated["dll"],
                "no_fp16": validated["no_fp16"],
            }
            self._save_profile_data(data)
            return self._success_response(dict, global_config=dict(data["global_config"]))
        except Exception as error:
            return self._error_response(dict, str(error), global_config=None)

    def update_game_config(self, appid: str, game_name: str, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            data = self._get_profile_data()
            old_name, _ = self._profile_for_appid(data, appid)
            name = self._profile_name(data, appid, game_name)
            merged_config = {**data["global_config"], **{key: value for key, value in config.items() if key != "no_fp16"}}
            if not config.get("dll"):
                merged_config["dll"] = data["global_config"].get("dll", "")
            validated = self._public_config(merged_config)
            validated["active_in"] = [str(appid)]
            if old_name and old_name != name:
                data["profiles"].pop(old_name, None)
            data["profiles"][name] = validated
            self._save_profile_data(data)
            return self._success_response(dict, appid=str(appid), config=validated)
        except Exception as error:
            return self._error_response(dict, str(error), appid=str(appid), config=None)

    def get_flatpak_config(self, app_id: str) -> Dict[str, Any]:
        try:
            data = self._get_profile_data()
            name = self.flatpak_profile_name(app_id)
            raw = data["profiles"].get(name)
            return self._success_response(
                dict,
                app_id=str(app_id),
                profile=name,
                exists=raw is not None,
                config=self._public_config(raw) if raw is not None else None,
                global_config=dict(data["global_config"]),
            )
        except Exception as error:
            return self._error_response(dict, str(error), app_id=str(app_id), config=None, exists=False)

    def update_flatpak_config(self, app_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            data = self._get_profile_data()
            name = self.flatpak_profile_name(app_id)
            merged_config = {**data["global_config"], **{key: value for key, value in config.items() if key != "no_fp16"}}
            if not config.get("dll"):
                merged_config["dll"] = data["global_config"].get("dll", "")
            validated = self._public_config(merged_config)
            validated["active_in"] = []
            data["profiles"][name] = validated
            self._save_profile_data(data)
            return self._success_response(dict, app_id=str(app_id), profile=name, exists=True, config=validated)
        except Exception as error:
            return self._error_response(dict, str(error), app_id=str(app_id), config=None, exists=False)

    def reset_flatpak_config(self, app_id: str) -> Dict[str, Any]:
        try:
            data = self._get_profile_data()
            name = self.flatpak_profile_name(app_id)
            data["profiles"].pop(name, None)
            self._save_profile_data(data)
            return self._success_response(dict, app_id=str(app_id), profile=name, exists=False)
        except Exception as error:
            return self._error_response(dict, str(error), app_id=str(app_id), config=None, exists=False)

    def reset_all_flatpak_configs(self) -> Dict[str, Any]:
        try:
            data = self._get_profile_data()
            data["profiles"] = {
                name: profile
                for name, profile in data["profiles"].items()
                if not name.startswith(self.FLATPAK_PROFILE_PREFIX)
            }
            self._save_profile_data(data)
            return self._success_response(dict, global_config=dict(data["global_config"]))
        except Exception as error:
            return self._error_response(dict, str(error))

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

    def reset_game_configs(self, appids: list[str]) -> Dict[str, Any]:
        try:
            if not isinstance(appids, list):
                raise ValueError("appids must be a list")
            requested = set()
            for appid in appids:
                if isinstance(appid, bool) or not isinstance(appid, (str, int)):
                    raise ValueError("appids must contain only strings or integers")
                value = str(appid)
                if not re.fullmatch(r"-?[0-9]+", value):
                    raise ValueError("appids must contain only numeric App IDs")
                requested.add(value)

            data = self._get_profile_data()
            data["profiles"] = {
                name: profile
                for name, profile in data["profiles"].items()
                if not (
                    len(profile.get("active_in", [])) == 1
                    and str(profile["active_in"][0]) in requested
                )
            }
            self._save_profile_data(data)
            return self._success_response(dict, global_config=dict(data["global_config"]), games=[])
        except Exception as error:
            return self._error_response(dict, str(error), games=[])

    def reset_all_game_configs(self) -> Dict[str, Any]:
        try:
            data = self._get_profile_data()
            data["profiles"] = {
                name: profile
                for name, profile in data["profiles"].items()
                if not (
                    len(profile.get("active_in", [])) == 1
                    and re.fullmatch(r"-?[0-9]+", str(profile.get("active_in", [""])[0]))
                )
            }
            self._save_profile_data(data)
            return self._success_response(dict, global_config=dict(data["global_config"]), games=[])
        except Exception as error:
            return self._error_response(dict, str(error), games=[])
