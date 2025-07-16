"""
Main plugin class for the lsfg-vk Decky Loader plugin.

This plugin provides services for installing and managing the lsfg-vk 
Vulkan layer for Lossless Scaling frame generation on Steam Deck.
"""

import os
from typing import Dict, Any

from .installation import InstallationService
from .dll_detection import DllDetectionService
from .configuration import ConfigurationService


class Plugin:
    """
    Main plugin class for lsfg-vk management.
    
    This class provides a unified interface for installation, configuration,
    and DLL detection services. It implements the Decky Loader plugin lifecycle
    methods (_main, _unload, _uninstall, _migration).
    """
    
    def __init__(self):
        """Initialize the plugin with all necessary services"""
        # Initialize services - they will use decky.logger by default
        self.installation_service = InstallationService()
        self.dll_detection_service = DllDetectionService()
        self.configuration_service = ConfigurationService()

    # Installation methods
    async def install_lsfg_vk(self) -> Dict[str, Any]:
        """Install lsfg-vk by extracting the zip file to ~/.local
        
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

    # DLL detection methods
    async def check_lossless_scaling_dll(self) -> Dict[str, Any]:
        """Check if Lossless Scaling DLL is available at the expected paths
        
        Returns:
            DllDetectionResponse dict with detection status and path info
        """
        return self.dll_detection_service.check_lossless_scaling_dll()

    # Configuration methods
    async def get_lsfg_config(self) -> Dict[str, Any]:
        """Read current lsfg script configuration
        
        Returns:
            ConfigurationResponse dict with current configuration or error
        """
        return self.configuration_service.get_config()

    async def update_lsfg_config(self, enable_lsfg: bool, multiplier: int, flow_scale: float, 
                          hdr: bool, perf_mode: bool, immediate_mode: bool, disable_vkbasalt: bool, frame_cap: int) -> Dict[str, Any]:
        """Update lsfg script configuration
        
        Args:
            enable_lsfg: Whether to enable LSFG
            multiplier: LSFG multiplier value (typically 2-4)
            flow_scale: LSFG flow scale value (typically 0.5-2.0)
            hdr: Whether to enable HDR
            perf_mode: Whether to enable performance mode
            immediate_mode: Whether to enable immediate present mode (disable vsync)
            disable_vkbasalt: Whether to disable vkbasalt layer
            frame_cap: Frame rate cap value (10-60)
            
        Returns:
            ConfigurationResponse dict with success status
        """
        return self.configuration_service.update_config(
            enable_lsfg, multiplier, flow_scale, hdr, perf_mode, immediate_mode, disable_vkbasalt, frame_cap
        )

    # Plugin lifecycle methods
    async def _main(self):
        """
        Asyncio-compatible long-running code, executed in a task when the plugin is loaded.
        
        This method is called by Decky Loader when the plugin starts up.
        Currently just logs that the plugin has loaded successfully.
        """
        import decky
        decky.logger.info("Lossless Scaling VK plugin loaded!")

    async def _unload(self):
        """
        Function called first during the unload process.
        
        This method is called by Decky Loader when the plugin is being unloaded.
        Use this for cleanup that should happen when the plugin stops.
        """
        import decky
        decky.logger.info("Lossless Scaling VK plugin unloading")

    async def _uninstall(self):
        """
        Function called after `_unload` during uninstall.
        
        This method is called by Decky Loader when the plugin is being uninstalled.
        It automatically cleans up any lsfg-vk files that were installed.
        """
        import decky
        decky.logger.info("Lossless Scaling VK plugin uninstalled - starting cleanup")
        
        # Clean up lsfg-vk files when the plugin is uninstalled
        self.installation_service.cleanup_on_uninstall()
        
        decky.logger.info("Lossless Scaling VK plugin uninstall cleanup completed")

    async def _migration(self):
        """
        Migrations that should be performed before entering `_main()`.
        
        This method is called by Decky Loader for plugin migrations.
        Currently migrates logs, settings, and runtime data from old locations.
        """
        import decky
        decky.logger.info("Running Lossless Scaling VK plugin migrations")
        
        # Migrate logs from old location
        # ~/.config/decky-lossless-scaling-vk/lossless-scaling-vk.log -> decky.DECKY_LOG_DIR/lossless-scaling-vk.log
        decky.migrate_logs(os.path.join(decky.DECKY_USER_HOME,
                                       ".config", "decky-lossless-scaling-vk", "lossless-scaling-vk.log"))
        
        # Migrate settings from old locations
        # ~/homebrew/settings/lossless-scaling-vk.json -> decky.DECKY_SETTINGS_DIR/lossless-scaling-vk.json
        # ~/.config/decky-lossless-scaling-vk/ -> decky.DECKY_SETTINGS_DIR/
        decky.migrate_settings(
            os.path.join(decky.DECKY_HOME, "settings", "lossless-scaling-vk.json"),
            os.path.join(decky.DECKY_USER_HOME, ".config", "decky-lossless-scaling-vk"))
        
        # Migrate runtime data from old locations
        # ~/homebrew/lossless-scaling-vk/ -> decky.DECKY_RUNTIME_DIR/
        # ~/.local/share/decky-lossless-scaling-vk/ -> decky.DECKY_RUNTIME_DIR/
        decky.migrate_runtime(
            os.path.join(decky.DECKY_HOME, "lossless-scaling-vk"),
            os.path.join(decky.DECKY_USER_HOME, ".local", "share", "decky-lossless-scaling-vk"))
        
        decky.logger.info("Lossless Scaling VK plugin migrations completed")
