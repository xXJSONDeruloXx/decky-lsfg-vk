"""
Main plugin class for the lsfg-vk Decky Loader plugin.

This plugin provides services for installing and managing the lsfg-vk 
Vulkan layer for frame generation on Steam Deck.
"""

import os
from typing import Any, Dict, Optional

import decky

from .installation import InstallationService
from .configuration import ConfigurationService
from .flatpak_service import FlatpakService
from .runtime_service import RuntimeService
from .steam_service import SteamService
from .wrapper_service import WrapperService


class Plugin:
    """
    Main plugin class for lsfg-vk management.
    
    This class provides a unified interface for installation, configuration,
    and Flatpak management services. It implements the Decky Loader plugin lifecycle
    methods (_main, _unload, _uninstall, _migration).
    """
    
    def __init__(self):
        """Initialize the plugin with all necessary services"""
        self.runtime_service = RuntimeService()
        self.steam_service = SteamService()
        self.installation_service = InstallationService(
            runtime_service=self.runtime_service,
            steam_service=self.steam_service,
        )
        self.configuration_service = ConfigurationService(runtime_service=self.runtime_service)
        self.flatpak_service = FlatpakService()
        self.wrapper_service = WrapperService()

    async def install_lsfg_vk(self) -> Dict[str, Any]:
        """Install the bundled lsfg-vk runtime to ~/.local
        
        Returns:
            InstallationResponse dict with success status and message/error
        """
        return self.installation_service.install()

    async def check_lsfg_vk_installed(self) -> Dict[str, Any]:
        """Check if lsfg-vk is already installed
        
        Returns:
            InstallationCheckResponse dict with installation status and paths
        """
        return self.installation_service.check_installation()

    async def uninstall_lsfg_vk(self) -> Dict[str, Any]:
        """Uninstall lsfg-vk by removing the installed files
        
        Returns:
            UninstallationResponse dict with success status and removed files
        """
        return self.installation_service.uninstall()

    async def get_game_configs(self) -> Dict[str, Any]:
        return self.configuration_service.get_game_configs()

    async def get_installed_games(self) -> Dict[str, Any]:
        return self.steam_service.get_installed_games()

    async def update_game_config(self, appid: str, game_name: str, config: Dict[str, Any]) -> Dict[str, Any]:
        return self.configuration_service.update_game_config(appid, game_name, config)

    async def reset_game_config(self, appid: str) -> Dict[str, Any]:
        return self.configuration_service.reset_game_config(appid)

    async def reset_all_game_configs(self) -> Dict[str, Any]:
        return self.configuration_service.reset_all_game_configs()

    async def get_workaround_state(self, appid: str) -> Dict[str, Any]:
        return self.wrapper_service.get(appid)

    async def set_workaround_state(
        self,
        appid: str,
        state: Dict[str, Any],
        shortcut_exe: Optional[str] = None,
        command_token_added: bool = False,
    ) -> Dict[str, Any]:
        return self.wrapper_service.set(appid, state, shortcut_exe, command_token_added)

    async def remove_workaround_state(self, appid: str) -> Dict[str, Any]:
        return self.wrapper_service.remove(appid)

    async def get_config_file_content(self) -> Dict[str, Any]:
        """Get the current config file content
        
        Returns:
            Dict containing the config file content or error message
        """
        try:
            config_path = self.configuration_service.config_file_path
            if not config_path.exists():
                return {
                    "success": False,
                    "content": None,
                    "path": str(config_path),
                    "error": "Config file does not exist"
                }
            
            content = config_path.read_text(encoding='utf-8')
            return {
                "success": True,
                "content": content,
                "path": str(config_path),
                "error": None
            }
        except Exception as e:
            return {
                "success": False,
                "content": None,
                "path": str(config_path) if 'config_path' in locals() else "unknown",
                "error": f"Error reading config file: {str(e)}"
            }

    async def check_flatpak_extension_status(self) -> Dict[str, Any]:
        """Check status of lsfg-vk Flatpak runtime extensions
        
        Returns:
            FlatpakExtensionStatus dict with installation status for all supported runtime versions
        """
        return self.flatpak_service.get_extension_status()

    async def install_flatpak_extension(self, version: str) -> Dict[str, Any]:
        """Install lsfg-vk Flatpak runtime extension
        
        Args:
            version: Runtime version to install ("23.08", "24.08", or "25.08")
            
        Returns:
            BaseResponse dict with success status and message/error
        """
        return self.flatpak_service.install_extension(version)

    async def uninstall_flatpak_extension(self, version: str) -> Dict[str, Any]:
        """Uninstall lsfg-vk Flatpak runtime extension
        
        Args:
            version: Runtime version to uninstall ("23.08", "24.08", or "25.08")
            
        Returns:
            BaseResponse dict with success status and message/error
        """
        return self.flatpak_service.uninstall_extension(version)

    async def get_flatpak_apps(self) -> Dict[str, Any]:
        """Get list of installed Flatpak apps and their lsfg-vk override status
        
        Returns:
            FlatpakAppInfo dict with apps list and override status
        """
        return self.flatpak_service.get_flatpak_apps()

    async def get_lossless_scaling_branch_status(self) -> Dict[str, Any]:
        return self.steam_service.get_branch_status()

    async def set_flatpak_app_override(self, app_id: str) -> Dict[str, Any]:
        """Set lsfg-vk overrides for a Flatpak app
        
        Args:
            app_id: Flatpak application ID
            
        Returns:
            FlatpakOverrideResponse dict with operation result
        """
        return self.flatpak_service.set_app_override(app_id)

    async def remove_flatpak_app_override(self, app_id: str) -> Dict[str, Any]:
        """Remove lsfg-vk overrides for a Flatpak app
        
        Args:
            app_id: Flatpak application ID
            
        Returns:
            FlatpakOverrideResponse dict with operation result
        """
        return self.flatpak_service.remove_app_override(app_id)
    
    async def _main(self):
        """
        Main entry point for the plugin.
        
        This method is called by Decky Loader when the plugin is loaded.
        Any initialization code should go here.
        """
        repair = self.wrapper_service.repair()
        if not repair.get("success"):
            decky.logger.error(f"Could not repair lsfg workaround wrapper: {repair.get('error')}")
        decky.logger.info("decky-lsfg-vk plugin loaded")

    async def _unload(self):
        """
        Cleanup tasks when the plugin is unloaded.
        
        This method is called by Decky Loader when the plugin is being unloaded.
        Any cleanup code should go here.
        """
        decky.logger.info("decky-lsfg-vk plugin unloaded")

    async def _uninstall(self):
        """
        Called when the plugin is uninstalled.
        
        This method is called by Decky Loader when the plugin is being uninstalled.
        Performs cleanup of plugin files and flatpak extensions.
        """
        decky.logger.info("decky-lsfg-vk plugin being uninstalled")
        
        # Clean up lsfg-vk files when the plugin is uninstalled
        # Launch integrations are removed with their profiles.  Keep the
        # generated pass-through wrapper if it is still referenced elsewhere;
        # InstallationService only removes files owned by the runtime bundle.
        self.installation_service.cleanup_on_uninstall()
        
        try:
            extension_status = self.flatpak_service.get_extension_status()
            for version, key in (
                ("23.08", "installed_23_08"),
                ("24.08", "installed_24_08"),
                ("25.08", "installed_25_08"),
            ):
                if extension_status.get(key):
                    result = self.flatpak_service.uninstall_extension(version)
                    if not result.get("success"):
                        decky.logger.warning(result.get("error"))
        except Exception as error:
            decky.logger.error(f"Error during Flatpak cleanup: {error}")

        decky.logger.info("decky-lsfg-vk plugin uninstall cleanup completed")

    async def _migration(self):
        """
        Migrations that should be performed before entering `_main()`.
        
        This method is called by Decky Loader for plugin migrations.
        Currently migrates logs, settings, and runtime data from old locations.
        """
        decky.logger.info("Running decky-lsfg-vk plugin migrations")
        
        decky.migrate_logs(os.path.join(decky.DECKY_USER_HOME,
                                       ".config", "decky-lossless-scaling-vk", "lossless-scaling-vk.log"))
        
        decky.migrate_settings(
            os.path.join(decky.DECKY_HOME, "settings", "lossless-scaling-vk.json"),
            os.path.join(decky.DECKY_USER_HOME, ".config", "decky-lossless-scaling-vk"))
        
        decky.migrate_runtime(
            os.path.join(decky.DECKY_HOME, "lossless-scaling-vk"),
            os.path.join(decky.DECKY_USER_HOME, ".local", "share", "decky-lossless-scaling-vk"))
        
        decky.logger.info("decky-lsfg-vk plugin migrations completed")
