import os
from typing import Any, Dict, Optional

import decky

from .configuration import ConfigurationService
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
        self.wrapper_service = WrapperService()

    async def install_lsfg_vk(self):
        return self.installation_service.install()

    async def check_lsfg_vk_installed(self):
        return self.installation_service.check_installation()

    async def uninstall_lsfg_vk(self):
        return self.installation_service.uninstall()

    async def get_game_configs(self):
        return self.configuration_service.get_game_configs()

    async def get_installed_games(self):
        result = self.steam_service.get_installed_games()
        if not result.get("success"):
            return result
        cache: Dict[str, Dict[str, Any]] = {}
        for game in result.get("games", []):
            transport = game.get("transport", {})
            if transport.get("kind") != "flatpak":
                continue
            app_id = transport.get("flatpakAppId")
            if not app_id:
                continue
            if app_id not in cache:
                cache[app_id] = self.flatpak_service.resolve_app_support(app_id)
            game["flatpakSupport"] = cache[app_id]
        return result

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
        shortcut_exe: Optional[str] = None,
        command_token_added: bool = False,
        transport: Optional[Dict[str, Any]] = None,
    ):
        return self.wrapper_service.set(
            appid,
            state,
            shortcut_exe,
            command_token_added,
            transport,
        )

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

    async def get_lossless_scaling_branch_status(self):
        return self.steam_service.get_branch_status()

    async def get_flatpak_support_status(self):
        return self.flatpak_service.get_flatpak_support_status()

    async def ensure_flatpak_support(self, flatpak_app_id: str):
        return self.flatpak_service.ensure_app_support(flatpak_app_id)

    async def repair_flatpak_support(self, flatpak_app_id: str):
        return self.flatpak_service.ensure_app_support(flatpak_app_id)

    async def set_flatpak_extension_enabled(self, version: str, enabled: bool):
        return self.flatpak_service.set_extension_enabled(version, enabled)

    async def _main(self):
        repair = self.wrapper_service.repair()
        if not repair.get("success"):
            decky.logger.error(f"Could not repair lsfg workaround wrapper: {repair.get('error')}")
        decky.logger.info("decky-lsfg-vk plugin loaded")

    async def _unload(self):
        decky.logger.info("decky-lsfg-vk plugin unloaded")

    async def _uninstall(self):
        decky.logger.info("decky-lsfg-vk plugin being uninstalled")
        self.installation_service.cleanup_on_uninstall()
        try:
            result = self.flatpak_service.remove_plugin_owned_extensions()
            if not result.get("success"):
                decky.logger.warning(result.get("error"))
        except Exception as error:
            decky.logger.error(f"Error during Flatpak cleanup: {error}")
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
