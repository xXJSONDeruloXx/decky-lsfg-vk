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
)
from .types import InstallationCheckResponse, InstallationResponse, UninstallationResponse


class InstallationService(BaseService):
    def __init__(self, logger=None):
        super().__init__(logger)
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
            self._write_file(
                self.config_file_path,
                ConfigurationManager.generate_toml_content_multi_profile(profile_data),
                0o644,
            )
            self._create_lsfg_launch_script(profile_data)
            self._remove_legacy_layer_files()
            return self._success_response(InstallationResponse, "lsfg-vk 2.0.0 installed successfully")
        except Exception as error:
            self.log.error(f"Error installing lsfg-vk: {error}")
            return self._error_response(InstallationResponse, str(error), message="")

    def _payload_destinations(self) -> Dict[str, tuple[Path, int]]:
        return {
            f"bin/{CLI_FILENAME}": (self.cli_file, 0o755),
            f"lib/{LIB_FILENAME}": (self.lib_file, 0o644),
            f"lib/{LIB_X86_FILENAME}": (self.lib_x86_file, 0o644),
            f"share/vulkan/implicit_layer.d/{JSON_FILENAME}": (self.json_file, 0o644),
            f"share/vulkan/implicit_layer.d/{JSON_X86_FILENAME}": (self.json_x86_file, 0o644),
        }

    def _install_archive(self, archive_path: Path) -> None:
        destinations = self._payload_destinations()
        found = set()
        with tarfile.open(archive_path, "r:xz") as archive:
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

        from .dll_detection import DllDetectionService

        if not profile_data["global_config"].get("dll"):
            dll_result = DllDetectionService(self.log).check_lossless_scaling_dll()
            if dll_result.get("detected") and dll_result.get("path"):
                profile_data["global_config"]["dll"] = dll_result["path"]

        defaults = dict(ConfigurationManager.get_defaults())
        for profile_name, raw_profile in list(profile_data["profiles"].items()):
            validated = ConfigurationManager.validate_config({**defaults, **raw_profile})
            profile_data["profiles"][profile_name] = {**raw_profile, **validated}

        if self.lsfg_script_path.exists():
            script_content = self.lsfg_script_path.read_text(encoding="utf-8")
            selected = ConfigurationManager.parse_profile_selection(script_content)
            if selected in profile_data["profiles"]:
                profile_data["current_profile"] = selected
            current_profile = profile_data["current_profile"]
            profile_data["profiles"][current_profile] = ConfigurationManager.merge_config_with_script(
                profile_data["profiles"][current_profile],
                ConfigurationManager.parse_script_content(script_content),
            )

        if profile_data["current_profile"] not in profile_data["profiles"]:
            profile_data["current_profile"] = (
                DEFAULT_PROFILE_NAME
                if DEFAULT_PROFILE_NAME in profile_data["profiles"]
                else next(iter(profile_data["profiles"]))
            )

        for profile in profile_data["profiles"].values():
            profile["dll"] = profile_data["global_config"].get("dll", "")
            profile["no_fp16"] = profile_data["global_config"].get("no_fp16", False)
        return profile_data

    def _create_lsfg_launch_script(self, profile_data: ProfileData) -> None:
        from .configuration import ConfigurationService

        configuration_service = ConfigurationService(logger=self.log)
        configuration_service.user_home = self.user_home
        configuration_service.config_dir = self.config_dir
        configuration_service.config_file_path = self.config_file_path
        configuration_service.lsfg_script_path = self.lsfg_launch_script_path
        self._write_file(
            self.lsfg_launch_script_path,
            configuration_service._generate_script_content_for_profile(profile_data),
            0o755,
        )

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
        return legacy_layer or legacy_config

    def get_launch_script_path(self) -> str:
        return str(self.lsfg_launch_script_path)

    def check_installation(self) -> InstallationCheckResponse:
        try:
            lib_exists = self.lib_file.exists() and self.lib_x86_file.exists()
            json_exists = self.json_file.exists() and self.json_x86_file.exists()
            script_exists = self.lsfg_launch_script_path.exists()
            return {
                "installed": lib_exists and json_exists and script_exists and self.cli_file.exists(),
                "lib_exists": lib_exists,
                "json_exists": json_exists,
                "script_exists": script_exists,
                "lib_path": str(self.lib_file),
                "json_path": str(self.json_file),
                "script_path": str(self.lsfg_launch_script_path),
                "error": None,
            }
        except Exception as error:
            return {
                "installed": False,
                "lib_exists": False,
                "json_exists": False,
                "script_exists": False,
                "lib_path": str(self.lib_file),
                "json_path": str(self.json_file),
                "script_path": str(self.lsfg_launch_script_path),
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
                self.legacy_lib_file,
                self.legacy_json_file,
                self.lsfg_launch_script_path,
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
