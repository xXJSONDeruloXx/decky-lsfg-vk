import os
import zipfile
import shutil
import subprocess
import tempfile

# The decky plugin module is located at decky-loader/plugin
# For easy intellisense checkout the decky-loader code repo
# and add the `decky-loader/plugin/imports` path to `python.analysis.extraPaths` in `.vscode/settings.json`
import decky
import asyncio

# Import our modular services
from src.services import InstallationService, DllDetectionService, ConfigurationService
from src.plugin_lifecycle import PluginLifecycleManager


class Plugin:
    def __init__(self):
        # Initialize services
        self.installation_service = InstallationService()
        self.dll_detection_service = DllDetectionService()
        self.configuration_service = ConfigurationService()
        self.lifecycle_manager = PluginLifecycleManager()

    # Installation methods
    async def install_lsfg_vk(self) -> dict:
        """Install lsfg-vk by extracting the zip file to ~/.local"""
        return await self.installation_service.install()

    async def check_lsfg_vk_installed(self) -> dict:
        """Check if lsfg-vk is already installed"""
        return await self.installation_service.check_installation()

    async def uninstall_lsfg_vk(self) -> dict:
        """Uninstall lsfg-vk by removing the installed files"""
        return await self.installation_service.uninstall()

    # DLL detection methods
    async def check_lossless_scaling_dll(self) -> dict:
        """Check if Lossless Scaling DLL is available at the expected paths"""
        return await self.dll_detection_service.check_lossless_scaling_dll()

    # Configuration methods
    async def get_lsfg_config(self) -> dict:
        """Read current lsfg script configuration"""
        return await self.configuration_service.get_config()

    async def update_lsfg_config(self, enable_lsfg: bool, multiplier: int, flow_scale: float, 
                               hdr: bool, perf_mode: bool, immediate_mode: bool) -> dict:
        """Update lsfg script configuration"""
        return await self.configuration_service.update_config(
            enable_lsfg, multiplier, flow_scale, hdr, perf_mode, immediate_mode
        )

    # Plugin lifecycle methods
    async def _main(self):
        """Asyncio-compatible long-running code, executed in a task when the plugin is loaded"""
        await self.lifecycle_manager.on_load()

    async def _unload(self):
        """Function called first during the unload process"""
        await self.lifecycle_manager.on_unload()

    async def _uninstall(self):
        """Function called after `_unload` during uninstall"""
        await self.lifecycle_manager.on_uninstall()

    async def _migration(self):
        """Migrations that should be performed before entering `_main()`"""
        await self.lifecycle_manager.on_migration()
