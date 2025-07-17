"""
Main plugin class for the lsfg-vk Decky Loader plugin.

This plugin provides services for installing and managing the lsfg-vk 
Vulkan layer for Lossless Scaling frame generation on Steam Deck.
"""

import os
import json
import subprocess
import urllib.request
import ssl
from typing import Dict, Any
from pathlib import Path

from .installation import InstallationService
from .dll_detection import DllDetectionService
from .configuration import ConfigurationService
from .config_schema import ConfigurationManager


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
        result = self.dll_detection_service.check_lossless_scaling_dll()
        
        # Convert to dict to allow modification
        result_dict = dict(result)
        
        # If DLL was detected, automatically update the configuration
        if result.get("detected") and result.get("path"):
            try:
                dll_path = result["path"]
                if dll_path:  # Type guard
                    update_result = self.configuration_service.update_dll_path(dll_path)
                    if update_result.get("success"):
                        result_dict["config_updated"] = True
                        result_dict["message"] = f"DLL detected and configuration updated: {dll_path}"
                    else:
                        result_dict["config_updated"] = False
                        result_dict["message"] = f"DLL detected but config update failed: {update_result.get('error', 'Unknown error')}"
            except Exception as e:
                result_dict["config_updated"] = False
                result_dict["message"] = f"DLL detected but config update failed: {str(e)}"
        
        return result_dict

    # Configuration methods
    async def get_lsfg_config(self) -> Dict[str, Any]:
        """Read current lsfg script configuration
        
        Returns:
            ConfigurationResponse dict with current configuration or error
        """
        return self.configuration_service.get_config()

    async def get_config_schema(self) -> Dict[str, Any]:
        """Get configuration schema information for frontend
        
        Returns:
            Dict with field names, types, and defaults
        """
        return {
            "field_names": ConfigurationManager.get_field_names(),
            "field_types": {name: field_type.value for name, field_type in ConfigurationManager.get_field_types().items()},
            "defaults": ConfigurationManager.get_defaults()
        }

    async def update_lsfg_config(self, enable: bool, dll: str, multiplier: int, flow_scale: float, 
                          performance_mode: bool, hdr_mode: bool) -> Dict[str, Any]:
        """Update lsfg TOML configuration
        
        Args:
            enable: Whether to enable LSFG
            dll: Path to Lossless.dll
            multiplier: LSFG multiplier value
            flow_scale: LSFG flow scale value
            performance_mode: Whether to enable performance mode
            hdr_mode: Whether to enable HDR mode
            
        Returns:
            ConfigurationResponse dict with success status
        """
        return self.configuration_service.update_config(
            enable, dll, multiplier, flow_scale, performance_mode, hdr_mode
        )

    async def update_dll_path(self, dll_path: str) -> Dict[str, Any]:
        """Update the DLL path in the configuration when detected
        
        Args:
            dll_path: Path to the detected Lossless.dll file
            
        Returns:
            ConfigurationResponse dict with success status
        """
        return self.configuration_service.update_dll_path(dll_path)

    # Self-updater methods
    async def check_for_plugin_update(self) -> Dict[str, Any]:
        """Check for plugin updates by comparing current version with latest GitHub release
        
        Returns:
            Dict containing update information:
            {
                "update_available": bool,
                "current_version": str,
                "latest_version": str,
                "release_notes": str,
                "release_date": str,
                "download_url": str,
                "error": str (if error occurred)
            }
        """
        try:
            import decky
            
            # Read current version from package.json
            package_json_path = Path(decky.DECKY_PLUGIN_DIR) / "package.json"
            current_version = "0.0.0"
            
            if package_json_path.exists():
                try:
                    with open(package_json_path, 'r', encoding='utf-8') as f:
                        package_data = json.load(f)
                        current_version = package_data.get('version', '0.0.0')
                except Exception as e:
                    decky.logger.warning(f"Failed to read package.json: {e}")
            
            # Fetch latest release from GitHub
            api_url = "https://api.github.com/repos/xXJSONDeruloXx/decky-lossless-scaling-vk/releases/latest"
            
            try:
                # Create SSL context that doesn't verify certificates
                # This is needed on Steam Deck where certificate verification often fails
                ssl_context = ssl.create_default_context()
                ssl_context.check_hostname = False
                ssl_context.verify_mode = ssl.CERT_NONE
                
                # Use urllib to fetch the latest release info
                with urllib.request.urlopen(api_url, context=ssl_context) as response:
                    release_data = json.loads(response.read().decode('utf-8'))
                
                latest_version = release_data.get('tag_name', '').lstrip('v')
                release_notes = release_data.get('body', '')
                release_date = release_data.get('published_at', '')
                
                # Find the plugin zip download URL
                download_url = ""
                for asset in release_data.get('assets', []):
                    if asset.get('name', '').endswith('.zip'):
                        download_url = asset.get('browser_download_url', '')
                        break
                
                # Compare versions
                update_available = self._compare_versions(current_version, latest_version)
                
                return {
                    "success": True,
                    "update_available": update_available,
                    "current_version": current_version,
                    "latest_version": latest_version,
                    "release_notes": release_notes,
                    "release_date": release_date,
                    "download_url": download_url
                }
                
            except Exception as e:
                decky.logger.error(f"Failed to fetch release info: {e}")
                return {
                    "success": False,
                    "error": f"Failed to check for updates: {str(e)}"
                }
                
        except Exception as e:
            return {
                "success": False,
                "error": f"Update check failed: {str(e)}"
            }

    async def download_plugin_update(self, download_url: str) -> Dict[str, Any]:
        """Download the plugin update zip file to ~/Downloads
        
        Args:
            download_url: URL to download the plugin zip from
            
        Returns:
            Dict containing download result:
            {
                "success": bool,
                "download_path": str,
                "error": str (if error occurred)
            }
        """
        try:
            import decky
            
            # Create download path
            downloads_dir = Path.home() / "Downloads"
            downloads_dir.mkdir(exist_ok=True)
            download_path = downloads_dir / "decky-lossless-scaling-vk.zip"
            
            # Remove existing file if it exists
            if download_path.exists():
                download_path.unlink()
            
            # Download the file
            decky.logger.info(f"Downloading plugin update from {download_url}")
            
            try:
                # Create SSL context that doesn't verify certificates
                # This is needed on Steam Deck where certificate verification often fails
                ssl_context = ssl.create_default_context()
                ssl_context.check_hostname = False
                ssl_context.verify_mode = ssl.CERT_NONE
                
                # Use urllib to download the file with SSL context
                with urllib.request.urlopen(download_url, context=ssl_context) as response:
                    with open(download_path, 'wb') as f:
                        f.write(response.read())
                
                # Verify the file was downloaded successfully
                if download_path.exists() and download_path.stat().st_size > 0:
                    decky.logger.info(f"Plugin update downloaded successfully to {download_path}")
                    return {
                        "success": True,
                        "download_path": str(download_path)
                    }
                else:
                    return {
                        "success": False,
                        "error": "Download completed but file is empty or missing"
                    }
                    
            except Exception as e:
                decky.logger.error(f"Download failed: {e}")
                return {
                    "success": False,
                    "error": f"Download failed: {str(e)}"
                }
                
        except Exception as e:
            return {
                "success": False,
                "error": f"Download preparation failed: {str(e)}"
            }

    def _compare_versions(self, current: str, latest: str) -> bool:
        """Compare two version strings to determine if an update is available
        
        Args:
            current: Current version string (e.g., "1.2.3")
            latest: Latest version string (e.g., "1.2.4")
            
        Returns:
            True if latest version is newer than current version
        """
        try:
            # Remove 'v' prefix if present and split by dots
            current_parts = current.lstrip('v').split('.')
            latest_parts = latest.lstrip('v').split('.')
            
            # Pad with zeros if needed to ensure equal length
            max_len = max(len(current_parts), len(latest_parts))
            current_parts.extend(['0'] * (max_len - len(current_parts)))
            latest_parts.extend(['0'] * (max_len - len(latest_parts)))
            
            # Compare each part numerically
            for i in range(max_len):
                try:
                    current_num = int(current_parts[i])
                    latest_num = int(latest_parts[i])
                    
                    if latest_num > current_num:
                        return True
                    elif latest_num < current_num:
                        return False
                    # If equal, continue to next part
                except ValueError:
                    # If conversion fails, do string comparison
                    if latest_parts[i] > current_parts[i]:
                        return True
                    elif latest_parts[i] < current_parts[i]:
                        return False
            
            # All parts are equal
            return False
            
        except Exception:
            # If comparison fails, assume no update available
            return False

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
