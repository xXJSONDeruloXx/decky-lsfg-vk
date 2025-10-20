"""
Flatpak service for managing lsfg-vk Flatpak runtime extensions.
"""

import subprocess
import os
from pathlib import Path
from typing import Dict, Any, List, Optional

from .base_service import BaseService
from .constants import (
    FLATPAK_23_08_FILENAME, FLATPAK_24_08_FILENAME, FLATPAK_25_08_FILENAME, BIN_DIR, CONFIG_DIR
)
from .types import BaseResponse


class FlatpakExtensionStatus(BaseResponse):
    """Response for Flatpak extension status"""
    def __init__(self, success: bool = False, message: str = "", error: str = "", 
                 installed_23_08: bool = False, installed_24_08: bool = False, installed_25_08: bool = False):
        super().__init__(success, message, error)
        self.installed_23_08 = installed_23_08
        self.installed_24_08 = installed_24_08
        self.installed_25_08 = installed_25_08


class FlatpakAppInfo(BaseResponse):
    """Response for Flatpak app information"""
    def __init__(self, success: bool = False, message: str = "", error: str = "",
                 apps: List[Dict[str, Any]] = None, total_apps: int = 0):
        super().__init__(success, message, error)
        self.apps = apps or []
        self.total_apps = total_apps


class FlatpakOverrideResponse(BaseResponse):
    """Response for Flatpak override operations"""
    def __init__(self, success: bool = False, message: str = "", error: str = "",
                 app_id: str = "", operation: str = ""):
        super().__init__(success, message, error)
        self.app_id = app_id
        self.operation = operation


class FlatpakService(BaseService):
    """Service for handling Flatpak runtime extensions and app overrides"""

    def __init__(self, logger=None):
        super().__init__(logger)
        self.extension_id_23_08 = "org.freedesktop.Platform.VulkanLayer.lsfgvk/x86_64/23.08"
        self.extension_id_24_08 = "org.freedesktop.Platform.VulkanLayer.lsfgvk/x86_64/24.08"
        self.extension_id_25_08 = "org.freedesktop.Platform.VulkanLayer.lsfgvk/x86_64/25.08"
        self.flatpak_command = None  # Will be set when flatpak is detected

    def _get_clean_env(self):
        """Get a clean environment without PyInstaller's bundled libraries"""
        # Create a clean environment without PyInstaller's bundled libraries
        env = os.environ.copy()

        # Remove LD_LIBRARY_PATH that might point to PyInstaller's bundled libs
        if 'LD_LIBRARY_PATH' in env:
            del env['LD_LIBRARY_PATH']

        # Ensure PATH includes standard binary locations
        standard_paths = ['/usr/bin', '/usr/local/bin', '/bin']
        current_path = env.get('PATH', '')

        # Add standard paths if they're not already there
        path_parts = current_path.split(':') if current_path else []
        for std_path in standard_paths:
            if std_path not in path_parts:
                path_parts.insert(0, std_path)

        env['PATH'] = ':'.join(path_parts)

        return env

    def _run_flatpak_command(self, args: List[str], **kwargs):
        """Run flatpak command with clean environment to avoid library conflicts"""
        if self.flatpak_command is None:
            raise FileNotFoundError("Flatpak command not available")

        env = self._get_clean_env()

        # Log environment info for debugging
        self.log.info(f"Running flatpak with PATH: {env.get('PATH')}")
        self.log.info(f"LD_LIBRARY_PATH removed: {'LD_LIBRARY_PATH' not in env}")

        # Run the command with the clean environment
        return subprocess.run([self.flatpak_command] + args, env=env, **kwargs)

    def check_flatpak_available(self) -> bool:
        """Check if flatpak command is available and store the working command"""
        # Log environment info for debugging
        self.log.info(f"PATH: {os.environ.get('PATH', 'Not set')}")
        self.log.info(f"HOME: {os.environ.get('HOME', 'Not set')}")
        self.log.info(f"USER: {os.environ.get('USER', 'Not set')}")

        # Try common flatpak installation paths, starting with the standard command
        flatpak_paths = [
            "flatpak",
            "/usr/bin/flatpak",
            "/var/lib/flatpak/exports/bin/flatpak",
            "/home/deck/.local/bin/flatpak"
        ]

        for flatpak_path in flatpak_paths:
            try:
                result = subprocess.run([flatpak_path, "--version"], 
                                      capture_output=True, check=True, text=True,
                                      env=self._get_clean_env())
                self.log.info(f"Flatpak found at {flatpak_path}: {result.stdout.strip()}")
                self.flatpak_command = flatpak_path
                return True
            except (subprocess.CalledProcessError, FileNotFoundError):
                self.log.debug(f"Flatpak not found at {flatpak_path}")
                continue

        self.log.error("Flatpak command not found in any known locations")
        self.flatpak_command = None
        return False

    def get_extension_status(self) -> FlatpakExtensionStatus:
        """Check if lsfg-vk Flatpak extensions are installed"""
        try:
            if not self.check_flatpak_available():
                error_msg = "Flatpak is not available on this system"
                if self.flatpak_command is None:
                    error_msg += ". Command not found in PATH or common install locations."
                self.log.error(error_msg)
                return self._error_response(FlatpakExtensionStatus, 
                                          error_msg,
                                          installed_23_08=False, installed_24_08=False, installed_25_08=False)

            # Get list of installed runtimes
            result = self._run_flatpak_command(
                ["list", "--runtime"],
                capture_output=True, text=True, check=True
            )

            installed_runtimes = result.stdout

            # Check for all versions by looking for the base extension name and version
            base_extension_name = "org.freedesktop.Platform.VulkanLayer.lsfgvk"
            installed_23_08 = False
            installed_24_08 = False
            installed_25_08 = False

            for line in installed_runtimes.split('\n'):
                if base_extension_name in line:
                    if "23.08" in line:
                        installed_23_08 = True
                    elif "24.08" in line:
                        installed_24_08 = True
                    elif "25.08" in line:
                        installed_25_08 = True

            status_msg = []
            if installed_23_08:
                status_msg.append("23.08 runtime extension installed")
            if installed_24_08:
                status_msg.append("24.08 runtime extension installed")
            if installed_25_08:
                status_msg.append("25.08 runtime extension installed")

            if not status_msg:
                status_msg.append("No lsfg-vk runtime extensions installed")

            return self._success_response(FlatpakExtensionStatus,
                                        "; ".join(status_msg),
                                        installed_23_08=installed_23_08,
                                        installed_24_08=installed_24_08,
                                        installed_25_08=installed_25_08)

        except subprocess.CalledProcessError as e:
            error_msg = f"Error checking Flatpak extensions: {e.stderr if e.stderr else str(e)}"
            self.log.error(error_msg)
            return self._error_response(FlatpakExtensionStatus, error_msg,
                                      installed_23_08=False, installed_24_08=False, installed_25_08=False)

    def install_extension(self, version: str) -> BaseResponse:
        """Install a specific version of the lsfg-vk Flatpak extension"""
        try:
            if version not in ["23.08", "24.08", "25.08"]:
                return self._error_response(BaseResponse, "Invalid version. Must be '23.08', '24.08', or '25.08'")

            if not self.check_flatpak_available():
                return self._error_response(BaseResponse, "Flatpak is not available on this system")

            # Get the path to the flatpak file
            plugin_dir = Path(__file__).parent.parent.parent
            if version == "23.08":
                filename = FLATPAK_23_08_FILENAME
            elif version == "24.08":
                filename = FLATPAK_24_08_FILENAME
            else:  # 25.08
                filename = FLATPAK_25_08_FILENAME
            flatpak_path = plugin_dir / BIN_DIR / filename

            if not flatpak_path.exists():
                return self._error_response(BaseResponse, f"Flatpak file not found: {flatpak_path}")

            # Install the extension
            result = self._run_flatpak_command(
                ["install", "--user", "--noninteractive", str(flatpak_path)],
                capture_output=True, text=True
            )

            if result.returncode != 0:
                error_msg = f"Failed to install Flatpak extension: {result.stderr}"
                self.log.error(error_msg)
                return self._error_response(BaseResponse, error_msg)

            self.log.info(f"Successfully installed lsfg-vk Flatpak extension {version}")
            return self._success_response(BaseResponse, f"lsfg-vk {version} runtime extension installed successfully")

        except Exception as e:
            error_msg = f"Error installing Flatpak extension {version}: {str(e)}"
            self.log.error(error_msg)
            return self._error_response(BaseResponse, error_msg)

    def uninstall_extension(self, version: str) -> BaseResponse:
        """Uninstall a specific version of the lsfg-vk Flatpak extension"""
        try:
            if version not in ["23.08", "24.08", "25.08"]:
                return self._error_response(BaseResponse, "Invalid version. Must be '23.08', '24.08', or '25.08'")

            if not self.check_flatpak_available():
                return self._error_response(BaseResponse, "Flatpak is not available on this system")

            if version == "23.08":
                extension_id = self.extension_id_23_08
            elif version == "24.08":
                extension_id = self.extension_id_24_08
            else:  # 25.08
                extension_id = self.extension_id_25_08

            # Uninstall the extension
            result = self._run_flatpak_command(
                ["uninstall", "--user", "--noninteractive", extension_id],
                capture_output=True, text=True
            )

            if result.returncode != 0:
                error_msg = f"Failed to uninstall Flatpak extension: {result.stderr}"
                self.log.error(error_msg)
                return self._error_response(BaseResponse, error_msg)

            self.log.info(f"Successfully uninstalled lsfg-vk Flatpak extension {version}")
            return self._success_response(BaseResponse, f"lsfg-vk {version} runtime extension uninstalled successfully")

        except Exception as e:
            error_msg = f"Error uninstalling Flatpak extension {version}: {str(e)}"
            self.log.error(error_msg)
            return self._error_response(BaseResponse, error_msg)

    def get_flatpak_apps(self) -> FlatpakAppInfo:
        """Get list of installed Flatpak apps and their lsfg-vk override status"""
        try:
            if not self.check_flatpak_available():
                error_msg = "Flatpak is not available on this system"
                if self.flatpak_command is None:
                    error_msg += ". Command not found in PATH or common install locations."
                return self._error_response(FlatpakAppInfo, 
                                          error_msg,
                                          apps=[], total_apps=0)

            # Get list of installed apps
            result = self._run_flatpak_command(
                ["list", "--app"],
                capture_output=True, text=True, check=True
            )

            apps = []
            for line in result.stdout.strip().split('\n'):
                if not line.strip():
                    continue

                # Parse flatpak list output (Name\tApp ID\tVersion\tBranch\tInstallation)
                parts = line.split('\t')
                if len(parts) >= 2:
                    app_name = parts[0].strip()
                    app_id = parts[1].strip()

                    # Check override status
                    override_status = self._check_app_override_status(app_id)

                    apps.append({
                        "app_id": app_id,
                        "app_name": app_name,
                        "has_filesystem_override": override_status["filesystem"],
                        "has_env_override": override_status["env"]
                    })

            return self._success_response(FlatpakAppInfo,
                                        f"Found {len(apps)} Flatpak applications",
                                        apps=apps, total_apps=len(apps))

        except subprocess.CalledProcessError as e:
            error_msg = f"Error getting Flatpak apps: {e.stderr if e.stderr else str(e)}"
            self.log.error(error_msg)
            return self._error_response(FlatpakAppInfo, error_msg, apps=[], total_apps=0)

    def _check_app_override_status(self, app_id: str) -> Dict[str, bool]:
        """Check if an app has lsfg-vk overrides set"""
        try:
            result = self._run_flatpak_command(
                ["override", "--user", "--show", app_id],
                capture_output=True, text=True
            )

            if result.returncode != 0:
                return {"filesystem": False, "env": False}

            output = result.stdout
            home_path = os.path.expanduser("~")
            config_path = f"{home_path}/.config/lsfg-vk"
            dll_path = f"{home_path}/.local/share/Steam/steamapps/common/Lossless Scaling/Lossless.dll"
            lsfg_path = f"{home_path}/lsfg"

            # More precise checking - look for exact filesystem entries
            # Flatpak output format typically shows filesystem entries like:
            # filesystems=/path1;/path2;/path3
            filesystem_section = ""
            in_context = False
            
            for line in output.split('\n'):
                line = line.strip()
                if line == "[Context]":
                    in_context = True
                elif line.startswith("[") and line != "[Context]":
                    in_context = False
                elif in_context and line.startswith("filesystems="):
                    filesystem_section = line
                    break
            
            # Check each required filesystem override
            has_config_fs = config_path in filesystem_section
            has_dll_fs = dll_path in filesystem_section
            has_lsfg_fs = lsfg_path in filesystem_section

            # All three filesystem overrides must be present
            filesystem_override = has_config_fs and has_dll_fs and has_lsfg_fs

            # Check for environment override in the [Environment] section
            env_override = False
            in_environment = False
            
            for line in output.split('\n'):
                line = line.strip()
                if line == "[Environment]":
                    in_environment = True
                elif line.startswith("[") and line != "[Environment]":
                    in_environment = False
                elif in_environment and line.startswith(f"LSFG_CONFIG={config_path}/conf.toml"):
                    env_override = True
                    break

            self.log.debug(f"Override status for {app_id}: filesystem={filesystem_override} ({has_config_fs}/{has_dll_fs}/{has_lsfg_fs}), env={env_override}")
            
            return {"filesystem": filesystem_override, "env": env_override}

        except Exception as e:
            self.log.error(f"Error checking override status for {app_id}: {e}")
            return {"filesystem": False, "env": False}

    def set_app_override(self, app_id: str) -> FlatpakOverrideResponse:
        """Set lsfg-vk overrides for a Flatpak app"""
        try:
            if not self.check_flatpak_available():
                return self._error_response(FlatpakOverrideResponse,
                                          "Flatpak is not available on this system",
                                          app_id=app_id, operation="set")

            home_path = os.path.expanduser("~")
            config_path = f"{home_path}/.config/lsfg-vk"
            dll_path = f"{home_path}/.local/share/Steam/steamapps/common/Lossless Scaling/Lossless.dll"
            lsfg_path = f"{home_path}/lsfg"

            # Set all filesystem overrides
            filesystem_overrides = [
                f"--filesystem={dll_path}",
                f"--filesystem={config_path}:rw", 
                f"--filesystem={lsfg_path}:rw"
            ]
            
            # Apply filesystem overrides
            for override in filesystem_overrides:
                result = self._run_flatpak_command(
                    ["override", "--user", override, app_id],
                    capture_output=True, text=True
                )
                if result.returncode != 0:
                    error_msg = f"Failed to set filesystem override {override}: {result.stderr}"
                    return self._error_response(FlatpakOverrideResponse, error_msg,
                                              app_id=app_id, operation="set")

            # Set environment override
            result = self._run_flatpak_command(
                ["override", "--user", f"--env=LSFG_CONFIG={config_path}/conf.toml", app_id],
                capture_output=True, text=True
            )

            if result.returncode != 0:
                error_msg = f"Failed to set environment override: {result.stderr}"
                return self._error_response(FlatpakOverrideResponse, error_msg,
                                          app_id=app_id, operation="set")

            self.log.info(f"Successfully set lsfg-vk overrides for {app_id}")
            return self._success_response(FlatpakOverrideResponse,
                                        f"lsfg-vk overrides set for {app_id}",
                                        app_id=app_id, operation="set")

        except Exception as e:
            error_msg = f"Error setting overrides for {app_id}: {str(e)}"
            self.log.error(error_msg)
            return self._error_response(FlatpakOverrideResponse, error_msg,
                                      app_id=app_id, operation="set")

    def remove_app_override(self, app_id: str) -> FlatpakOverrideResponse:
        """Remove lsfg-vk overrides for a Flatpak app"""
        try:
            if not self.check_flatpak_available():
                return self._error_response(FlatpakOverrideResponse,
                                          "Flatpak is not available on this system",
                                          app_id=app_id, operation="remove")

            home_path = os.path.expanduser("~")
            config_path = f"{home_path}/.config/lsfg-vk"
            dll_path = f"{home_path}/.local/share/Steam/steamapps/common/Lossless Scaling/Lossless.dll"
            lsfg_path = f"{home_path}/lsfg"

            # First, try to reset all overrides for this app to clean slate
            reset_result = self._run_flatpak_command(
                ["override", "--user", "--reset", app_id],
                capture_output=True, text=True
            )
            
            if reset_result.returncode == 0:
                self.log.info(f"Successfully reset all overrides for {app_id}")
                return self._success_response(FlatpakOverrideResponse,
                                            f"All overrides reset for {app_id}",
                                            app_id=app_id, operation="remove")
            
            # If reset fails, try individual removal (fallback)
            self.log.debug(f"Reset failed, trying individual removal: {reset_result.stderr}")
            
            # Remove all filesystem overrides individually
            filesystem_overrides = [
                f"--nofilesystem={dll_path}",
                f"--nofilesystem={config_path}",
                f"--nofilesystem={lsfg_path}"
            ]
            
            removal_errors = []
            
            # Remove filesystem overrides
            for override in filesystem_overrides:
                result = self._run_flatpak_command(
                    ["override", "--user", override, app_id],
                    capture_output=True, text=True
                )
                if result.returncode != 0:
                    removal_errors.append(f"{override}: {result.stderr}")

            # Remove environment override
            result = self._run_flatpak_command(
                ["override", "--user", "--unset-env=LSFG_CONFIG", app_id],
                capture_output=True, text=True
            )

            if result.returncode != 0:
                removal_errors.append(f"unset-env: {result.stderr}")

            if removal_errors:
                self.log.warning(f"Some override removals had issues for {app_id}: {'; '.join(removal_errors)}")
            
            self.log.info(f"Completed override removal for {app_id}")
            return self._success_response(FlatpakOverrideResponse,
                                        f"lsfg-vk overrides removed for {app_id}",
                                        app_id=app_id, operation="remove")

        except Exception as e:
            error_msg = f"Error removing overrides for {app_id}: {str(e)}"
            self.log.error(error_msg)
            return self._error_response(FlatpakOverrideResponse, error_msg,
                                      app_id=app_id, operation="remove")