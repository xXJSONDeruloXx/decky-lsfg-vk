import os
import pwd
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, List

from .base_service import BaseService
from .config_schema import ConfigurationManager
from .constants import (
    BIN_DIR,
    FLATPAK_23_08_FILENAME,
    FLATPAK_24_08_FILENAME,
    FLATPAK_25_08_FILENAME,
)
from .types import BaseResponse


class FlatpakService(BaseService):
    EXTENSION_ID = "org.freedesktop.Platform.VulkanLayer.lsfgvk"
    SUPPORTED_RUNTIMES = ("23.08", "24.08", "25.08")

    def __init__(self, logger=None):
        super().__init__(logger)
        self.flatpak_command = None

    def _get_clean_env(self) -> Dict[str, str]:
        env = os.environ.copy()
        env.pop("LD_LIBRARY_PATH", None)
        env["HOME"] = str(self.user_home)
        path_entries = [entry for entry in env.get("PATH", "").split(":") if entry]
        for entry in ("/usr/bin", "/usr/local/bin", "/bin"):
            if entry not in path_entries:
                path_entries.insert(0, entry)
        env["PATH"] = ":".join(path_entries)
        return env

    def _flatpak_user(self) -> pwd.struct_passwd:
        try:
            return pwd.getpwuid(self.user_home.stat().st_uid)
        except (KeyError, OSError) as error:
            raise RuntimeError(f"Unable to resolve Flatpak user for {self.user_home}") from error

    def check_flatpak_available(self) -> bool:
        env = self._get_clean_env()
        self.flatpak_command = shutil.which("flatpak", path=env["PATH"])
        return self.flatpak_command is not None

    def _run_flatpak_command(self, args: List[str], **kwargs):
        if self.flatpak_command is None and not self.check_flatpak_available():
            raise FileNotFoundError("Flatpak command not available")
        command = [self.flatpak_command, *args]
        target_user = self._flatpak_user()
        if os.geteuid() != target_user.pw_uid:
            runuser = shutil.which("runuser", path=self._get_clean_env()["PATH"])
            if runuser is None:
                raise FileNotFoundError("runuser command not available")
            command = [runuser, "--user", target_user.pw_name, "--", *command]
        return subprocess.run(
            command,
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

    @classmethod
    def _bundle_filename(cls, version: str) -> str:
        return {
            "23.08": FLATPAK_23_08_FILENAME,
            "24.08": FLATPAK_24_08_FILENAME,
            "25.08": FLATPAK_25_08_FILENAME,
        }[version]

    def _bundled_extension_path(self, version: str) -> Path:
        self._validate_runtime(version)
        return Path(__file__).resolve().parent.parent.parent / BIN_DIR / self._bundle_filename(version)

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
            bundle_path = self._bundled_extension_path(version)
            if not bundle_path.is_file():
                raise FileNotFoundError(
                    f"Bundled Flatpak extension not found at {bundle_path}; reinstall the plugin"
                )
            result = self._run_flatpak_command(
                [
                    "install",
                    "--user",
                    "--noninteractive",
                    "--or-update",
                    str(bundle_path),
                ],
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                raise OSError(result.stderr.strip() or "Flatpak installation failed")
            return self._success_response(
                BaseResponse,
                f"lsfg-vk {version} runtime extension installed from the bundled asset",
            )
        except Exception as error:
            return self._error_response(BaseResponse, str(error))

    def uninstall_extension(self, version: str) -> Dict[str, Any]:
        try:
            self._validate_runtime(version)
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

    def _override_output(self, app_id: str) -> str:
        result = self._run_flatpak_command(
            ["override", "--user", "--show", app_id],
            capture_output=True,
            text=True,
        )
        return result.stdout if result.returncode == 0 else ""

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

        return self.user_home / ".local/share/Steam/steamapps/common/Lossless Scaling"

    def _override_paths(self) -> Dict[str, str]:
        return {
            "config_dir": str(self.config_dir),
            "config_file": str(self.config_file_path),
            "dll_dir": str(self._dll_directory()),
            "legacy_home": str(self.user_home),
            "legacy_dll": str(
                self.user_home
                / ".local/share/Steam/steamapps/common/Lossless Scaling/Lossless.dll"
            ),
            "legacy_script": str(self.legacy_script_path),
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
                ["list", "--app", "--columns=name,application"],
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
                    # Remove permissions/env from the pre-v2 plugin when an
                    # existing app is explicitly migrated or reconfigured.
                    f"--nofilesystem={paths['legacy_home']}",
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
                    f"--nofilesystem={paths['legacy_home']}",
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
