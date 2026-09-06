import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, List

from .base_service import BaseService
from .config_schema import ConfigurationManager
from .dll_detection import DllDetectionService
from .types import BaseResponse


class FlatpakService(BaseService):
    EXTENSION_ID = "org.freedesktop.Platform.VulkanLayer.lsfgvk"
    SUPPORTED_RUNTIMES = ("24.08", "25.08")

    def __init__(self, logger=None):
        super().__init__(logger)
        self.flatpak_command = None

    def _get_clean_env(self) -> Dict[str, str]:
        env = os.environ.copy()
        env.pop("LD_LIBRARY_PATH", None)
        path_entries = [entry for entry in env.get("PATH", "").split(":") if entry]
        for entry in ("/usr/bin", "/usr/local/bin", "/bin"):
            if entry not in path_entries:
                path_entries.insert(0, entry)
        env["PATH"] = ":".join(path_entries)
        return env

    def check_flatpak_available(self) -> bool:
        env = self._get_clean_env()
        self.flatpak_command = shutil.which("flatpak", path=env["PATH"])
        return self.flatpak_command is not None

    def _run_flatpak_command(self, args: List[str], **kwargs):
        if self.flatpak_command is None and not self.check_flatpak_available():
            raise FileNotFoundError("Flatpak command not available")
        return subprocess.run(
            [self.flatpak_command, *args],
            env=self._get_clean_env(),
            **kwargs,
        )

    @classmethod
    def _extension_ref(cls, version: str) -> str:
        return f"{cls.EXTENSION_ID}/x86_64/{version}"

    @classmethod
    def _validate_runtime(cls, version: str) -> None:
        if version not in cls.SUPPORTED_RUNTIMES:
            raise ValueError("Unsupported Flatpak runtime")

    def get_extension_status(self) -> Dict[str, Any]:
        try:
            if not self.check_flatpak_available():
                raise FileNotFoundError("Flatpak is not available on this system")

            result = self._run_flatpak_command(
                ["list", "--user", "--runtime", "--columns=application,arch,branch"],
                capture_output=True,
                text=True,
                check=True,
            )
            installed = {
                tuple(line.split("\t")[:3])
                for line in result.stdout.splitlines()
                if line.strip()
            }
            return self._success_response(
                BaseResponse,
                "Flatpak runtime status retrieved",
                installed_23_08=(self.EXTENSION_ID, "x86_64", "23.08") in installed,
                installed_24_08=(self.EXTENSION_ID, "x86_64", "24.08") in installed,
                installed_25_08=(self.EXTENSION_ID, "x86_64", "25.08") in installed,
            )
        except Exception as error:
            return self._error_response(
                BaseResponse,
                str(error),
                installed_23_08=False,
                installed_24_08=False,
                installed_25_08=False,
            )

    def install_extension(self, version: str) -> Dict[str, Any]:
        try:
            self._validate_runtime(version)
            if not self.check_flatpak_available():
                raise FileNotFoundError("Flatpak is not available on this system")
            result = self._run_flatpak_command(
                [
                    "install",
                    "--user",
                    "--noninteractive",
                    "--or-update",
                    "flathub",
                    f"{self.EXTENSION_ID}//{version}",
                ],
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                raise OSError(result.stderr.strip() or "Flatpak installation failed")
            return self._success_response(
                BaseResponse,
                f"lsfg-vk {version} runtime extension installed",
            )
        except Exception as error:
            return self._error_response(BaseResponse, str(error))

    def uninstall_extension(self, version: str) -> Dict[str, Any]:
        try:
            if version not in ("23.08", *self.SUPPORTED_RUNTIMES):
                raise ValueError("Unsupported Flatpak runtime")
            if not self.check_flatpak_available():
                raise FileNotFoundError("Flatpak is not available on this system")
            result = self._run_flatpak_command(
                ["uninstall", "--user", "--noninteractive", self._extension_ref(version)],
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                raise OSError(result.stderr.strip() or "Flatpak uninstall failed")
            return self._success_response(
                BaseResponse,
                f"lsfg-vk {version} runtime extension uninstalled",
            )
        except Exception as error:
            return self._error_response(BaseResponse, str(error))

    def _dll_directory(self) -> Path:
        if self.config_file_path.exists():
            try:
                profile_data = ConfigurationManager.parse_toml_content_multi_profile(
                    self.config_file_path.read_text(encoding="utf-8")
                )
                dll_path = profile_data["global_config"].get("dll")
                if dll_path:
                    return Path(dll_path).parent
            except Exception:
                pass

        result = DllDetectionService(self.log).check_lossless_scaling_dll()
        if result.get("detected") and result.get("path"):
            return Path(result["path"]).parent
        return self.user_home / ".local/share/Steam/steamapps/common"

    def _override_output(self, app_id: str) -> str:
        result = self._run_flatpak_command(
            ["override", "--user", "--show", app_id],
            capture_output=True,
            text=True,
        )
        return result.stdout if result.returncode == 0 else ""

    def _override_paths(self) -> Dict[str, str]:
        return {
            "config_dir": str(self.config_dir),
            "config_file": str(self.config_file_path),
            "dll_dir": str(self._dll_directory()),
            "legacy_dll": str(
                self.user_home
                / ".local/share/Steam/steamapps/common/Lossless Scaling/Lossless.dll"
            ),
            "legacy_script": str(self.lsfg_launch_script_path),
        }

    def _check_app_override_status(self, app_id: str) -> Dict[str, bool]:
        output = self._override_output(app_id)
        paths = self._override_paths()
        return {
            "filesystem": (
                paths["config_dir"] in output
                and paths["dll_dir"] in output
            ),
            "env": f"LSFGVK_CONFIG={paths['config_file']}" in output,
        }

    def get_flatpak_apps(self) -> Dict[str, Any]:
        try:
            if not self.check_flatpak_available():
                raise FileNotFoundError("Flatpak is not available on this system")
            result = self._run_flatpak_command(
                ["list", "--user", "--app", "--columns=name,application"],
                capture_output=True,
                text=True,
                check=True,
            )
            apps = []
            for line in result.stdout.splitlines():
                parts = line.split("\t", 1)
                if len(parts) != 2:
                    continue
                status = self._check_app_override_status(parts[1])
                apps.append(
                    {
                        "app_id": parts[1],
                        "app_name": parts[0],
                        "has_filesystem_override": status["filesystem"],
                        "has_env_override": status["env"],
                    }
                )
            return self._success_response(
                BaseResponse,
                f"Found {len(apps)} Flatpak applications",
                apps=apps,
                total_apps=len(apps),
            )
        except Exception as error:
            return self._error_response(
                BaseResponse,
                str(error),
                apps=[],
                total_apps=0,
            )

    def set_app_override(self, app_id: str) -> Dict[str, Any]:
        try:
            if not self.check_flatpak_available():
                raise FileNotFoundError("Flatpak is not available on this system")
            paths = self._override_paths()
            result = self._run_flatpak_command(
                [
                    "override",
                    "--user",
                    f"--filesystem={paths['config_dir']}:rw",
                    f"--filesystem={paths['dll_dir']}:ro",
                    f"--env=LSFGVK_CONFIG={paths['config_file']}",
                    f"--nofilesystem={paths['legacy_dll']}",
                    f"--nofilesystem={paths['legacy_script']}",
                    "--unset-env=LSFG_CONFIG",
                    app_id,
                ],
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                raise OSError(result.stderr.strip() or "Failed to set Flatpak overrides")
            return self._success_response(
                BaseResponse,
                f"lsfg-vk overrides set for {app_id}",
                app_id=app_id,
                operation="set",
            )
        except Exception as error:
            return self._error_response(
                BaseResponse,
                str(error),
                app_id=app_id,
                operation="set",
            )

    def remove_app_override(self, app_id: str) -> Dict[str, Any]:
        try:
            if not self.check_flatpak_available():
                raise FileNotFoundError("Flatpak is not available on this system")
            paths = self._override_paths()
            result = self._run_flatpak_command(
                [
                    "override",
                    "--user",
                    f"--nofilesystem={paths['config_dir']}",
                    f"--nofilesystem={paths['dll_dir']}",
                    f"--nofilesystem={paths['legacy_dll']}",
                    f"--nofilesystem={paths['legacy_script']}",
                    "--unset-env=LSFGVK_CONFIG",
                    "--unset-env=LSFG_CONFIG",
                    app_id,
                ],
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                raise OSError(result.stderr.strip() or "Failed to remove Flatpak overrides")
            return self._success_response(
                BaseResponse,
                f"lsfg-vk overrides removed for {app_id}",
                app_id=app_id,
                operation="remove",
            )
        except Exception as error:
            return self._error_response(
                BaseResponse,
                str(error),
                app_id=app_id,
                operation="remove",
            )

    def migrate_v2(self) -> None:
        if not self.check_flatpak_available():
            return

        status = self.get_extension_status()
        if status.get("installed_23_08"):
            result = self.uninstall_extension("23.08")
            if not result.get("success"):
                self.log.warning(result.get("error"))

        for version, key in (
            ("24.08", "installed_24_08"),
            ("25.08", "installed_25_08"),
        ):
            if not status.get(key):
                continue
            result = self.install_extension(version)
            if not result.get("success"):
                self.log.warning(result.get("error"))

        apps_result = self._run_flatpak_command(
            ["list", "--user", "--app", "--columns=application"],
            capture_output=True,
            text=True,
        )
        if apps_result.returncode != 0:
            return

        for app_id in apps_result.stdout.splitlines():
            app_id = app_id.strip()
            if not app_id:
                continue
            if "LSFG_CONFIG=" in self._override_output(app_id):
                result = self.set_app_override(app_id)
                if not result.get("success"):
                    self.log.warning(result.get("error"))
