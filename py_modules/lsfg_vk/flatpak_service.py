"""
Flatpak service for managing lsfg-vk Flatpak runtime extensions.
"""

import subprocess
import os
from pathlib import Path
from typing import Dict, Any, List, Optional

from .base_service import BaseService
from .constants import (
    BIN_DIR,
    FLATPAK_23_08_FILENAME,
    FLATPAK_24_08_FILENAME,
    FLATPAK_25_08_FILENAME,
)
from .types import BaseResponse


SUPPORTED_FLATPAK_VERSIONS = ("23.08", "24.08", "25.08")


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
        self.flatpak_command = None

    def _get_lsfg_paths(self) -> tuple[str, str]:
        """Return the v2 config directory and directory containing Lossless.dll."""
        config_path = str(self.config_dir)
        dll_directory = str(self.user_home / ".local/share/Steam/steamapps/common")
        return config_path, dll_directory

    def _get_bundled_extension_path(self, version: str) -> Path:
        """Return the checksum-pinned Flatpak bundle shipped with this plugin."""
        filenames = {
            "23.08": FLATPAK_23_08_FILENAME,
            "24.08": FLATPAK_24_08_FILENAME,
            "25.08": FLATPAK_25_08_FILENAME,
        }
        try:
            filename = filenames[version]
        except KeyError as error:
            raise ValueError(f"Unsupported Flatpak runtime version: {version}") from error

        plugin_dir = Path(__file__).resolve().parent.parent.parent
        return plugin_dir / BIN_DIR / filename

    def _get_extension_id(self, version: str) -> str:
        """Return the full user-installation ref for a supported runtime branch."""
        extension_ids = {
            "23.08": self.extension_id_23_08,
            "24.08": self.extension_id_24_08,
            "25.08": self.extension_id_25_08,
        }
        try:
            return extension_ids[version]
        except KeyError as error:
            raise ValueError(f"Unsupported Flatpak runtime version: {version}") from error

    def _get_installed_extension_commit(self, version: str) -> str:
        """Record the deployed commit so a failed multi-runtime migration can roll back."""
        result = self._run_flatpak_command(
            ["info", "--user", "--show-commit", self._get_extension_id(version)],
            capture_output=True,
            text=True,
            check=True,
        )
        commit = str(result.stdout or "").strip()
        if not commit:
            raise OSError(f"Flatpak did not report a deployed commit for {version}")
        return commit

    def _rollback_extension(self, version: str, commit: str) -> Optional[str]:
        """Restore one runtime to its previous deployed commit; return an error if it fails."""
        try:
            result = self._run_flatpak_command(
                [
                    "update",
                    "--user",
                    "--assumeyes",
                    "--noninteractive",
                    f"--commit={commit}",
                    self._get_extension_id(version),
                ],
                capture_output=True,
                text=True,
            )
        except (OSError, subprocess.SubprocessError) as error:
            return str(error)
        if result.returncode != 0:
            return result.stderr or f"Flatpak rollback failed for {version}"
        return None

    def _get_installed_extension_versions(self) -> list[str]:
        """Return installed lsfg-vk runtime branches from the user Flatpak installation."""
        result = self._run_flatpak_command(
            ["list", "--user", "--runtime"],
            capture_output=True,
            text=True,
            check=True,
        )
        installed_runtimes = result.stdout
        base_extension_name = "org.freedesktop.Platform.VulkanLayer.lsfgvk"
        return [
            version
            for version in SUPPORTED_FLATPAK_VERSIONS
            if any(
                base_extension_name in line and version in line
                for line in installed_runtimes.splitlines()
            )
        ]

    def _remove_legacy_app_overrides(self, app_id: str) -> list[str]:
        """Remove only the v1 overrides previously created by this plugin."""
        legacy_dll_path = self.user_home / ".local/share/Steam/steamapps/common/Lossless Scaling/Lossless.dll"
        legacy_overrides = [
            ["override", "--user", "--unset-env=LSFG_CONFIG", app_id],
            ["override", "--user", f"--nofilesystem={legacy_dll_path}", app_id],
            ["override", "--user", f"--nofilesystem={self.lsfg_launch_script_path}", app_id],
        ]
        errors = []
        for args in legacy_overrides:
            result = self._run_flatpak_command(args, capture_output=True, text=True)
            if result.returncode != 0:
                errors.append(f"{' '.join(args[2:-1])}: {result.stderr}")
        return errors

    def _get_clean_env(self):
        """Get a clean environment without PyInstaller's bundled libraries"""
        env = os.environ.copy()

        if 'LD_LIBRARY_PATH' in env:
            del env['LD_LIBRARY_PATH']

        standard_paths = ['/usr/bin', '/usr/local/bin', '/bin']
        current_path = env.get('PATH', '')

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

        self.log.info(f"Running flatpak with PATH: {env.get('PATH')}")
        self.log.info(f"LD_LIBRARY_PATH removed: {'LD_LIBRARY_PATH' not in env}")

        return subprocess.run([self.flatpak_command] + args, env=env, **kwargs)

    def check_flatpak_available(self) -> bool:
        """Check if flatpak command is available and store the working command"""
        self.log.info(f"PATH: {os.environ.get('PATH', 'Not set')}")
        self.log.info(f"HOME: {os.environ.get('HOME', 'Not set')}")
        self.log.info(f"USER: {os.environ.get('USER', 'Not set')}")

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

            installed_versions = self._get_installed_extension_versions()
            installed_23_08 = "23.08" in installed_versions
            installed_24_08 = "24.08" in installed_versions
            installed_25_08 = "25.08" in installed_versions

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
        """Install or update a specific version of the lsfg-vk Flatpak extension."""
        try:
            if version not in SUPPORTED_FLATPAK_VERSIONS:
                return self._error_response(BaseResponse, "Invalid version. Must be '23.08', '24.08', or '25.08'")

            if not self.check_flatpak_available():
                return self._error_response(BaseResponse, "Flatpak is not available on this system")

            bundle_path = self._get_bundled_extension_path(version)
            if not bundle_path.is_file():
                error_msg = f"Bundled Flatpak extension not found at {bundle_path}; reinstall the plugin"
                self.log.error(error_msg)
                return self._error_response(BaseResponse, error_msg)

            result = self._run_flatpak_command(
                [
                    "install",
                    "--user",
                    "--or-update",
                    "--assumeyes",
                    "--noninteractive",
                    str(bundle_path),
                ],
                capture_output=True, text=True
            )

            if result.returncode != 0:
                error_msg = f"Failed to install Flatpak extension: {result.stderr}"
                self.log.error(error_msg)
                return self._error_response(BaseResponse, error_msg)

            self.log.info("Successfully installed bundled lsfg-vk Flatpak extension %s", version)
            return self._success_response(
                BaseResponse,
                f"lsfg-vk {version} runtime extension installed successfully from the bundled asset",
            )

        except Exception as e:
            error_msg = f"Error installing Flatpak extension {version}: {str(e)}"
            self.log.error(error_msg)
            return self._error_response(BaseResponse, error_msg)

    def _get_flatpak_app_ids(self) -> list[str]:
        """Return application IDs in the user Flatpak installation."""
        result = self._run_flatpak_command(
            ["list", "--user", "--app"],
            capture_output=True,
            text=True,
            check=True,
        )
        app_ids = []
        for line in result.stdout.splitlines():
            parts = line.split("\t")
            if len(parts) >= 2 and parts[1].strip():
                app_ids.append(parts[1].strip())
        return app_ids

    def _get_app_override_output(self, app_id: str) -> Optional[str]:
        """Return an app's user override output, or None if it cannot be read."""
        result = self._run_flatpak_command(
            ["override", "--user", "--show", app_id],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            return None
        return result.stdout

    def _has_legacy_app_override(self, output: str) -> bool:
        """Detect only overrides written by the v1 plugin."""
        config_path, _ = self._get_lsfg_paths()
        legacy_dll_path = self.user_home / ".local/share/Steam/steamapps/common/Lossless Scaling/Lossless.dll"
        legacy_config = f"LSFG_CONFIG={config_path}/conf.toml"
        return (
            legacy_config in output
            or str(legacy_dll_path) in output
            or str(self.lsfg_launch_script_path) in output
        )

    def _migrate_legacy_app_overrides(self) -> Dict[str, Any]:
        """Upgrade v1 app overrides without changing unrelated Flatpak apps."""
        migrated_apps = []
        failed_apps = []
        try:
            for app_id in self._get_flatpak_app_ids():
                output = self._get_app_override_output(app_id)
                if output is None or not self._has_legacy_app_override(output):
                    continue

                result = self.set_app_override(app_id)
                if result.get("success"):
                    migrated_apps.append(app_id)
                else:
                    failed_apps.append({"app_id": app_id, "error": result.get("error", "unknown error")})
        except (subprocess.CalledProcessError, OSError) as error:
            stderr = getattr(error, "stderr", None)
            return self._error_response(
                BaseResponse,
                f"Could not inspect Flatpak applications: {stderr or error}",
                migrated_apps=migrated_apps,
                failed_apps=failed_apps,
            )

        if failed_apps:
            return self._error_response(
                BaseResponse,
                f"Failed to migrate overrides for {len(failed_apps)} Flatpak application(s)",
                migrated_apps=migrated_apps,
                failed_apps=failed_apps,
            )
        return self._success_response(
            BaseResponse,
            f"Migrated {len(migrated_apps)} legacy Flatpak app override(s)",
            migrated_apps=migrated_apps,
            failed_apps=failed_apps,
        )

    def update_installed_extensions(self) -> Dict[str, Any]:
        """Update existing user Flatpak extensions and migrate their v1 app overrides."""
        empty_result = {
            "updated_versions": [],
            "failed_versions": [],
            "rolled_back_versions": [],
            "rollback_failed_versions": [],
            "migrated_apps": [],
            "failed_apps": [],
        }
        try:
            if not self.check_flatpak_available():
                return self._success_response(
                    BaseResponse,
                    "Flatpak is unavailable; skipped runtime and app-override migration",
                    skipped=True,
                    **empty_result,
                )

            installed_versions = self._get_installed_extension_versions()
            if not installed_versions:
                return self._success_response(
                    BaseResponse,
                    "No installed lsfg-vk Flatpak runtimes require migration",
                    skipped=True,
                    **empty_result,
                )

            missing_bundles = [
                {"version": version, "error": f"Bundled Flatpak extension not found for {version}"}
                for version in installed_versions
                if not self._get_bundled_extension_path(version).is_file()
            ]
            if missing_bundles:
                return self._error_response(
                    BaseResponse,
                    "Flatpak runtime migration was not started because a bundled asset is missing",
                    skipped=False,
                    failed_versions=missing_bundles,
                    **{key: value for key, value in empty_result.items() if key != "failed_versions"},
                )

            previous_commits = {}
            commit_failures = []
            for version in installed_versions:
                try:
                    previous_commits[version] = self._get_installed_extension_commit(version)
                except (subprocess.CalledProcessError, OSError) as error:
                    stderr = getattr(error, "stderr", None)
                    commit_failures.append({"version": version, "error": stderr or str(error)})
            if commit_failures:
                return self._error_response(
                    BaseResponse,
                    "Flatpak runtime migration was not started because existing commits could not be recorded",
                    skipped=False,
                    failed_versions=commit_failures,
                    **{key: value for key, value in empty_result.items() if key != "failed_versions"},
                )

            updated_versions = []
            failed_versions = []
            for version in installed_versions:
                result = self.install_extension(version)
                if result.get("success"):
                    updated_versions.append(version)
                else:
                    failed_versions.append({"version": version, "error": result.get("error", "unknown error")})

            if failed_versions:
                rolled_back_versions = []
                rollback_failed_versions = []
                for version in reversed(updated_versions):
                    rollback_error = self._rollback_extension(version, previous_commits[version])
                    if rollback_error is None:
                        rolled_back_versions.append(version)
                    else:
                        rollback_failed_versions.append({"version": version, "error": rollback_error})

                rollback_message = (
                    f"rolled back {len(rolled_back_versions)} runtime(s)"
                    if not rollback_failed_versions
                    else f"could not roll back {len(rollback_failed_versions)} runtime(s)"
                )
                return self._error_response(
                    BaseResponse,
                    f"Flatpak runtime migration failed; {rollback_message}; "
                    "legacy app overrides were left unchanged",
                    skipped=False,
                    updated_versions=updated_versions,
                    failed_versions=failed_versions,
                    rolled_back_versions=rolled_back_versions,
                    rollback_failed_versions=rollback_failed_versions,
                    migrated_apps=[],
                    failed_apps=[],
                )

            override_result = self._migrate_legacy_app_overrides()
            response = {
                "updated_versions": updated_versions,
                "failed_versions": [],
                "rolled_back_versions": [],
                "rollback_failed_versions": [],
                "migrated_apps": override_result.get("migrated_apps", []),
                "failed_apps": override_result.get("failed_apps", []),
            }
            if not override_result.get("success"):
                return self._error_response(
                    BaseResponse,
                    override_result.get("error", "Flatpak app override migration failed"),
                    skipped=False,
                    **response,
                )
            return self._success_response(
                BaseResponse,
                f"Updated {len(updated_versions)} Flatpak runtime(s); "
                f"migrated {len(response['migrated_apps'])} app override(s)",
                skipped=False,
                **response,
            )
        except (subprocess.CalledProcessError, OSError) as error:
            stderr = getattr(error, "stderr", None)
            return self._error_response(
                BaseResponse,
                f"Could not migrate installed Flatpak runtimes: {stderr or error}",
                skipped=False,
                **empty_result,
            )

    def uninstall_extension(self, version: str) -> BaseResponse:
        """Uninstall a specific version of the lsfg-vk Flatpak extension"""
        try:
            if version not in SUPPORTED_FLATPAK_VERSIONS:
                return self._error_response(BaseResponse, "Invalid version. Must be '23.08', '24.08', or '25.08'")

            if not self.check_flatpak_available():
                return self._error_response(BaseResponse, "Flatpak is not available on this system")

            extension_id = self._get_extension_id(version)

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

            result = self._run_flatpak_command(
                ["list", "--user", "--app"],
                capture_output=True, text=True, check=True
            )

            apps = []
            for line in result.stdout.strip().split('\n'):
                if not line.strip():
                    continue

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
            output = self._get_app_override_output(app_id)
            if output is None:
                return {"filesystem": False, "env": False}
            config_path, dll_directory = self._get_lsfg_paths()

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
            
            has_config_fs = config_path in filesystem_section
            has_dll_fs = dll_directory in filesystem_section

            filesystem_override = has_config_fs and has_dll_fs

            env_override = False
            in_environment = False
            
            for line in output.split('\n'):
                line = line.strip()
                if line == "[Environment]":
                    in_environment = True
                elif line.startswith("[") and line != "[Environment]":
                    in_environment = False
                elif in_environment and line.startswith(f"LSFGVK_CONFIG={config_path}/conf.toml"):
                    env_override = True
                    break

            self.log.debug(f"Override status for {app_id}: filesystem={filesystem_override} ({has_config_fs}/{has_dll_fs}), env={env_override}")
            
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

            config_path, dll_directory = self._get_lsfg_paths()

            filesystem_overrides = [
                f"--filesystem={dll_directory}:ro",
                f"--filesystem={config_path}:rw",
            ]
            
            for override in filesystem_overrides:
                result = self._run_flatpak_command(
                    ["override", "--user", override, app_id],
                    capture_output=True, text=True
                )
                if result.returncode != 0:
                    error_msg = f"Failed to set filesystem override {override}: {result.stderr}"
                    return self._error_response(FlatpakOverrideResponse, error_msg,
                                              app_id=app_id, operation="set")

            result = self._run_flatpak_command(
                ["override", "--user", f"--env=LSFGVK_CONFIG={config_path}/conf.toml", app_id],
                capture_output=True, text=True
            )

            if result.returncode != 0:
                error_msg = f"Failed to set environment override: {result.stderr}"
                return self._error_response(FlatpakOverrideResponse, error_msg,
                                          app_id=app_id, operation="set")

            legacy_errors = self._remove_legacy_app_overrides(app_id)
            if legacy_errors:
                self.log.warning(
                    "Applied v2 overrides for %s but could not fully remove v1 overrides: %s",
                    app_id,
                    "; ".join(legacy_errors),
                )

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

            config_path, dll_directory = self._get_lsfg_paths()

            filesystem_overrides = [
                f"--nofilesystem={dll_directory}",
                f"--nofilesystem={config_path}",
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

            result = self._run_flatpak_command(
                ["override", "--user", "--unset-env=LSFGVK_CONFIG", app_id],
                capture_output=True, text=True
            )

            if result.returncode != 0:
                removal_errors.append(f"unset-env: {result.stderr}")

            removal_errors.extend(self._remove_legacy_app_overrides(app_id))

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
