import os
import shutil
import tarfile
import tempfile
import traceback
from pathlib import Path
from typing import Dict

from .base_service import BaseService
from .config_schema import ConfigurationManager, DEFAULT_PROFILE_NAME, ProfileData
from .constants import (
    ARCHIVE_FILENAME,
    BIN_DIR,
    CLI_FILENAME,
    JSON_FILENAME,
    JSON_X86_FILENAME,
    LEGACY_JSON_FILENAME,
    LEGACY_LIB_FILENAME,
    LIB_FILENAME,
    LIB_X86_FILENAME,
    LOCAL_SHARE,
    UI_DESKTOP_FILENAME,
    UI_FILENAME,
    UI_ICON_FILENAME,
)
from .runtime_service import RuntimeService
from .steam_service import SteamService
from .types import InstallationCheckResponse, InstallationResponse, UninstallationResponse


class InstallationService(BaseService):
    def __init__(
        self,
        logger=None,
        runtime_service: RuntimeService = None,
        steam_service: SteamService = None,
    ):
        super().__init__(logger)
        self.runtime_service = runtime_service or RuntimeService(logger=self.log)
        self.steam_service = steam_service or SteamService(logger=self.log)
        self.lib_file = self.local_lib_dir / LIB_FILENAME
        self.lib_x86_file = self.local_lib_dir / LIB_X86_FILENAME
        self.json_file = self.local_share_dir / JSON_FILENAME
        self.json_x86_file = self.local_share_dir / JSON_X86_FILENAME
        self.cli_file = self.local_bin_dir / CLI_FILENAME
        self.legacy_lib_file = self.local_lib_dir / LEGACY_LIB_FILENAME
        self.legacy_json_file = self.local_share_dir / LEGACY_JSON_FILENAME

    def install(self) -> InstallationResponse:
        try:
            plugin_dir = Path(__file__).parent.parent.parent
            archive_path = plugin_dir / BIN_DIR / ARCHIVE_FILENAME
            if not archive_path.exists():
                raise FileNotFoundError(f"{ARCHIVE_FILENAME} not found at {archive_path}")

            self._ensure_directories()
            profile_data = self._prepare_config()
            self._install_archive(archive_path)
            config_content = ConfigurationManager.generate_toml_content_multi_profile(profile_data)
            self.runtime_service.validate_config_content(config_content)
            self._write_file(
                self.config_file_path,
                config_content,
                0o644,
            )
            self._remove_legacy_layer_files()
            return self._success_response(InstallationResponse, "lsfg-vk 2.0.0 installed successfully")
        except Exception as error:
            self.log.error(f"Error installing lsfg-vk: {error}")
            return self._error_response(InstallationResponse, str(error), message="")

    def _payload_destinations(self) -> Dict[str, tuple[Path, int]]:
        return {
            f"bin/{CLI_FILENAME}": (self.cli_file, 0o755),
            f"bin/{UI_FILENAME}": (self.local_bin_dir / UI_FILENAME, 0o755),
            f"lib/{LIB_FILENAME}": (self.lib_file, 0o644),
            f"lib/{LIB_X86_FILENAME}": (self.lib_x86_file, 0o644),
            f"share/vulkan/implicit_layer.d/{JSON_FILENAME}": (self.json_file, 0o644),
            f"share/vulkan/implicit_layer.d/{JSON_X86_FILENAME}": (self.json_x86_file, 0o644),
            f"share/applications/{UI_DESKTOP_FILENAME}": (
                self.user_home / LOCAL_SHARE / "applications" / UI_DESKTOP_FILENAME,
                0o644,
            ),
            f"share/icons/hicolor/256x256/apps/{UI_ICON_FILENAME}": (
                self.user_home / LOCAL_SHARE / "icons" / "hicolor" / "256x256" / "apps" / UI_ICON_FILENAME,
                0o644,
            ),
        }

    def _install_archive(self, archive_path: Path) -> None:
        destinations = self._payload_destinations()
        found = set()
        with tarfile.open(archive_path, "r:*") as archive:
            members = {
                member.name.removeprefix("./"): member
                for member in archive.getmembers()
                if member.isfile()
            }
            for source_path, (destination, mode) in destinations.items():
                member = members.get(source_path)
                if member is None:
                    continue
                source = archive.extractfile(member)
                if source is None:
                    continue
                destination.parent.mkdir(parents=True, exist_ok=True)
                temporary_path = None
                try:
                    with tempfile.NamedTemporaryFile(
                        mode="wb",
                        dir=destination.parent,
                        prefix=f".{destination.name}.",
                        delete=False,
                    ) as temporary_file:
                        temporary_path = Path(temporary_file.name)
                        with source:
                            shutil.copyfileobj(source, temporary_file)
                        temporary_file.flush()
                        os.fsync(temporary_file.fileno())
                    temporary_path.chmod(mode)
                    os.replace(temporary_path, destination)
                    found.add(source_path)
                except Exception:
                    if temporary_path is not None:
                        temporary_path.unlink(missing_ok=True)
                    raise

        missing = sorted(set(destinations) - found)
        if missing:
            raise OSError("Archive is missing required files: " + ", ".join(missing))

    def _prepare_config(self) -> ProfileData:
        if self.config_file_path.exists():
            content = self.config_file_path.read_text(encoding="utf-8")
            legacy = ConfigurationManager.is_legacy_v1(content)
            profile_data = ConfigurationManager.parse_toml_content_multi_profile(content)
            if legacy:
                backup_path = self.config_file_path.with_name(f"{self.config_file_path.name}.v1.bak")
                if not backup_path.exists():
                    self._write_file(backup_path, content, 0o644)
        else:
            default = dict(ConfigurationManager.get_defaults())
            profile_data = ProfileData(
                current_profile=DEFAULT_PROFILE_NAME,
                profiles={DEFAULT_PROFILE_NAME: default},
                global_config={
                    "dll": default.get("dll", ""),
                    "no_fp16": default.get("no_fp16", False),
                },
            )

        self._resolve_dll_path(profile_data)
        defaults = dict(ConfigurationManager.get_defaults())
        for profile_name, raw_profile in list(profile_data["profiles"].items()):
            profile_data["profiles"][profile_name] = ConfigurationManager.validate_config(
                {**defaults, **raw_profile, **profile_data["global_config"]}
            )
        profile_data["current_profile"] = DEFAULT_PROFILE_NAME
        return profile_data

    def _resolve_dll_path(self, profile_data: ProfileData) -> bool:
        current_path = str(profile_data["global_config"].get("dll") or "")
        if current_path and Path(current_path).is_file():
            return False

        dll_path = self.steam_service.find_lsfg_vk_dll()
        if dll_path and current_path != dll_path:
            profile_data["global_config"]["dll"] = dll_path
            return True
        return False

    def _remove_legacy_layer_files(self) -> None:
        for path in (self.legacy_lib_file, self.legacy_json_file):
            self._remove_if_exists(path)

    def needs_v2_migration(self) -> bool:
        legacy_layer = self.legacy_lib_file.exists() or self.legacy_json_file.exists()
        legacy_config = False
        if self.config_file_path.exists():
            try:
                legacy_config = ConfigurationManager.is_legacy_v1(
                    self.config_file_path.read_text(encoding="utf-8")
                )
            except OSError:
                legacy_config = False
        if legacy_layer or legacy_config:
            return True
        try:
            if self.config_file_path.exists():
                data = ConfigurationManager.parse_toml_content_multi_profile(
                    self.config_file_path.read_text(encoding="utf-8")
                )
                configured = str(data["global_config"].get("dll") or "")
                if (not configured or not Path(configured).is_file()) and self.steam_service.find_lsfg_vk_dll():
                    return True
            return not self.runtime_service.is_healthy()
        except Exception:
            return True

    def check_installation(self) -> InstallationCheckResponse:
        try:
            installation_error = None
            try:
                installed = self.runtime_service.is_healthy()
            except Exception as error:
                installed = False
                installation_error = str(error)

            lossless_scaling = self.runtime_service.check_lossless_scaling()
            return {
                "installed": installed,
                "lossless_scaling_installed": bool(lossless_scaling["installed"]),
                "lossless_scaling_status": str(lossless_scaling["status"]),
                "error": installation_error,
            }
        except Exception as error:
            return {
                "installed": False,
                "lossless_scaling_installed": False,
                "lossless_scaling_status": str(error),
                "error": str(error),
            }

    def uninstall(self) -> UninstallationResponse:
        try:
            removed = []
            for path in (
                self.lib_file,
                self.lib_x86_file,
                self.json_file,
                self.json_x86_file,
                self.cli_file,
                self.local_bin_dir / UI_FILENAME,
                self.user_home / LOCAL_SHARE / "applications" / UI_DESKTOP_FILENAME,
                self.user_home / LOCAL_SHARE / "icons" / "hicolor" / "256x256" / "apps" / UI_ICON_FILENAME,
                self.legacy_lib_file,
                self.legacy_json_file,
                self.legacy_script_path,
            ):
                if self._remove_if_exists(path):
                    removed.append(str(path))
            if not removed:
                return self._success_response(
                    UninstallationResponse,
                    "No lsfg-vk files found to remove",
                    removed_files=None,
                )
            return self._success_response(
                UninstallationResponse,
                f"lsfg-vk uninstalled successfully. Removed {len(removed)} files.",
                removed_files=removed,
            )
        except Exception as error:
            return self._error_response(
                UninstallationResponse,
                str(error),
                message="",
                removed_files=None,
            )

    def cleanup_on_uninstall(self) -> None:
        try:
            self.uninstall()
        except Exception as error:
            self.log.error(f"Error cleaning up lsfg-vk files during uninstall: {error}")
            self.log.error(traceback.format_exc())
