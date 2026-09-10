import os
from typing import Any, Dict

import decky

from .configuration import ConfigurationService
from .flatpak_profile_service import FlatpakProfileService
from .flatpak_service import FlatpakService
from .installation import InstallationService
from .runtime_service import RuntimeService
from .steam_service import SteamService
from .wrapper_service import WrapperService


class Plugin:
    def __init__(self):
        self.runtime_service = RuntimeService()
        self.steam_service = SteamService()
        self.installation_service = InstallationService(
            runtime_service=self.runtime_service,
            steam_service=self.steam_service,
        )
        self.configuration_service = ConfigurationService(runtime_service=self.runtime_service)
        self.flatpak_service = FlatpakService()
        self.flatpak_profile_service = FlatpakProfileService(
            self.flatpak_service,
            self.configuration_service,
        )
        self.wrapper_service = WrapperService()

    async def install_lsfg_vk(self):
        return self.installation_service.install()

    async def check_lsfg_vk_installed(self):
        return self.installation_service.check_installation()

    async def uninstall_lsfg_vk(self):
        flatpak = self.flatpak_service.remove_plugin_owned_environment()
        if not flatpak.get("success"):
            return {
                "success": False,
                "message": "",
                "error": flatpak.get("error") or "Could not clean up Flatpak support",
                "removed_files": None,
            }
        self.configuration_service.reset_all_flatpak_configs()
        return self.installation_service.uninstall()

    async def get_game_configs(self):
        return self.configuration_service.get_game_configs()

    async def get_installed_games(self):
        return self.steam_service.get_installed_games()

    async def update_game_config(self, appid: str, game_name: str, config: Dict[str, Any]):
        return self.configuration_service.update_game_config(appid, game_name, config)

    async def reset_game_config(self, appid: str):
        return self.configuration_service.reset_game_config(appid)

    async def reset_all_game_configs(self):
        return self.configuration_service.reset_all_game_configs()

    async def get_workaround_state(self, appid: str):
        return self.wrapper_service.get(appid)

    async def set_workaround_state(
        self,
        appid: str,
        state: Dict[str, Any],
        command_token_added: bool = False,
    ):
        return self.wrapper_service.set(appid, state, command_token_added)

    async def remove_workaround_state(self, appid: str):
        return self.wrapper_service.remove(appid)

    async def get_config_file_content(self):
        path = self.configuration_service.config_file_path
        try:
            if not path.exists():
                return {
                    "success": False,
                    "content": None,
                    "path": str(path),
                    "error": "Config file does not exist",
                }
            return {
                "success": True,
                "content": path.read_text(encoding="utf-8"),
                "path": str(path),
                "error": None,
            }
        except Exception as error:
            return {
                "success": False,
                "content": None,
                "path": str(path),
                "error": f"Error reading config file: {error}",
            }

    async def get_debug_file_contents(self):
        files = (
            ("config", "LSFG-VK configuration", self.configuration_service.config_file_path),
            ("workarounds", "Per-app workarounds", self.wrapper_service.sidecar_path),
            ("wrapper", "Generated launch wrapper", self.wrapper_service.wrapper_path),
            ("flatpak", "Flatpak ownership state", self.flatpak_service.ownership_path),
        )
        contents = []
        for file_id, label, path in files:
            item = {
                "id": file_id,
                "label": label,
                "path": str(path),
                "exists": False,
                "content": None,
                "error": None,
            }
            try:
                if path.is_symlink():
                    item["error"] = "Path is a symlink; refusing to read it"
                elif not path.exists():
                    item["error"] = "File does not exist"
                elif not path.is_file():
                    item["error"] = "Path is not a regular file"
                else:
                    item["exists"] = True
                    item["content"] = path.read_text(encoding="utf-8")
            except Exception as error:
                item["error"] = f"Error reading file: {error}"
            contents.append(item)
        return {
            "success": True,
            "message": "Debug file contents retrieved",
            "error": None,
            "files": contents,
        }

    async def get_lossless_scaling_branch_status(self):
        return self.steam_service.get_branch_status()

    async def get_flatpak_apps(self):
        return self.flatpak_profile_service.get_apps()

    async def enable_flatpak_app(self, flatpak_app_id: str):
        return self.flatpak_profile_service.enable_app(flatpak_app_id)

    async def update_flatpak_config(self, flatpak_app_id: str, config: Dict[str, Any]):
        return self.flatpak_profile_service.update_config(flatpak_app_id, config)

    async def get_flatpak_workaround_state(self, flatpak_app_id: str):
        return self.flatpak_profile_service.get_workaround_state(flatpak_app_id)

    async def set_flatpak_workaround_state(self, flatpak_app_id: str, state: Dict[str, Any]):
        return self.flatpak_profile_service.set_workaround_state(flatpak_app_id, state)

    async def remove_flatpak_app(self, flatpak_app_id: str):
        return self.flatpak_profile_service.remove_app(flatpak_app_id)

    async def get_running_flatpak_apps(self):
        return self.flatpak_profile_service.get_running_apps()

    async def _main(self):
        repair = self.wrapper_service.repair()
        if not repair.get("success"):
            decky.logger.error(f"Could not repair lsfg workaround wrapper: {repair.get('error')}")
        decky.logger.info("decky-lsfg-vk plugin loaded")

    async def _unload(self):
        decky.logger.info("decky-lsfg-vk plugin unloaded")

    async def _uninstall(self):
        decky.logger.info("decky-lsfg-vk plugin being uninstalled")
        try:
            result = self.flatpak_service.remove_plugin_owned_environment()
            if result.get("success"):
                self.configuration_service.reset_all_flatpak_configs()
            else:
                decky.logger.warning(result.get("error"))
        except Exception as error:
            decky.logger.error(f"Error during Flatpak cleanup: {error}")
        self.installation_service.cleanup_on_uninstall()
        decky.logger.info("decky-lsfg-vk plugin uninstall cleanup completed")

    async def _migration(self):
        decky.logger.info("Running decky-lsfg-vk plugin migrations")
        decky.migrate_logs(os.path.join(
            decky.DECKY_USER_HOME,
            ".config",
            "decky-lossless-scaling-vk",
            "lossless-scaling-vk.log",
        ))
        decky.migrate_settings(
            os.path.join(decky.DECKY_HOME, "settings", "lossless-scaling-vk.json"),
            os.path.join(decky.DECKY_USER_HOME, ".config", "decky-lossless-scaling-vk"),
        )
        decky.migrate_runtime(
            os.path.join(decky.DECKY_HOME, "lossless-scaling-vk"),
            os.path.join(decky.DECKY_USER_HOME, ".local", "share", "decky-lossless-scaling-vk"),
        )
        decky.logger.info("decky-lsfg-vk plugin migrations completed")
