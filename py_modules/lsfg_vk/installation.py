"""Installation and in-place migration service for lsfg-vk v2."""

import json
import platform
import shutil
import tarfile
import tempfile
import traceback
from pathlib import Path
from typing import Any, Dict

from .base_service import BaseService
from .config_schema import ConfigurationManager, ProfileData
from .constants import (
    ARMADA_DEVICE_ENV,
    BIN_DIR,
    JSON_FILENAME,
    LEGACY_JSON_FILENAME,
    LEGACY_LIB_FILENAME,
    LIB_FILENAME,
    get_layer_archive_filename,
)
from .types import InstallationCheckResponse, InstallationResponse, UninstallationResponse


class InstallationService(BaseService):
    """Install architecture-matched v2 assets and migrate the public config."""

    def __init__(self, logger=None):
        super().__init__(logger)
        self.lib_file = self.local_lib_dir / LIB_FILENAME
        self.json_file = self.local_share_dir / JSON_FILENAME
        self.legacy_lib_file = self.local_lib_dir / LEGACY_LIB_FILENAME
        self.legacy_json_file = self.local_share_dir / LEGACY_JSON_FILENAME
        self._config_recovery_backup: Path | None = None

    def install(self) -> InstallationResponse:
        try:
            plugin_dir = Path(__file__).parent.parent.parent
            archive_name = get_layer_archive_filename(self._is_arm_architecture())
            archive_path = plugin_dir / BIN_DIR / archive_name
            if not archive_path.exists():
                error_msg = f"{archive_name} not found at {archive_path}"
                self.log.error(error_msg)
                return self._error_response(InstallationResponse, error_msg, message="")

            self._ensure_directories()
            self._extract_and_install_files(archive_path)
            profile_data = self._create_config_file()
            self._create_lsfg_launch_script(profile_data)
            self._remove_legacy_layer_files()

            message = "lsfg-vk v2 installed successfully"
            if self._config_recovery_backup is not None:
                message += f"; unsupported config backed up to {self._config_recovery_backup.name}"
            self.log.info("lsfg-vk v2 installed successfully from %s", archive_name)
            return self._success_response(InstallationResponse, message)
        except (OSError, tarfile.TarError, shutil.Error) as error:
            self.log.error("Error installing lsfg-vk: %s", error)
            return self._error_response(InstallationResponse, str(error), message="")
        except Exception as error:
            self.log.error("Unexpected error installing lsfg-vk: %s", error)
            return self._error_response(InstallationResponse, str(error), message="")

    def _is_arm_architecture(self) -> bool:
        """Detect the native game host, including Decky running under FEX on Armada."""
        if platform.machine().lower() in ("aarch64", "arm64"):
            return True
        if ARMADA_DEVICE_ENV.is_file():
            self.log.info("Detected native AArch64 Armada host through device-env")
            return True
        try:
            with Path("/proc/1/exe").open("rb") as host_executable:
                elf_header = host_executable.read(20)
            if elf_header[:4] == b"\x7fELF" and elf_header[5] in (1, 2):
                byte_order = "little" if elf_header[5] == 1 else "big"
                if int.from_bytes(elf_header[18:20], byte_order) == 183:
                    self.log.info("Detected native AArch64 host through PID 1")
                    return True
        except OSError as error:
            self.log.debug("Could not inspect native host architecture: %s", error)
        return False

    @staticmethod
    def _copy_plugin_file(source: Path, destination: Path, mode: int = 0o644) -> None:
        """Copy payload content without preserving FEX-incompatible metadata."""
        shutil.copyfile(source, destination)
        destination.chmod(mode)

    def _extract_and_install_files(self, archive_path: Path) -> None:
        """Extract just the v2 library and manifest from an owner release archive."""
        destinations = {
            LIB_FILENAME: self.lib_file,
            JSON_FILENAME: self.json_file,
        }
        found = set()
        with tarfile.open(archive_path, "r:xz") as archive:
            with tempfile.TemporaryDirectory() as temp_dir:
                temp_root = Path(temp_dir)
                for member in archive.getmembers():
                    if not member.isfile():
                        continue
                    filename = Path(member.name).name
                    destination = destinations.get(filename)
                    if destination is None:
                        continue
                    source = archive.extractfile(member)
                    if source is None:
                        continue
                    temporary_file = temp_root / filename
                    with source, temporary_file.open("wb") as output:
                        shutil.copyfileobj(source, output)
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    if filename == JSON_FILENAME:
                        self._copy_and_fix_json_file(temporary_file, destination)
                    else:
                        self._copy_plugin_file(temporary_file, destination)
                    found.add(filename)
                    self.log.info("Installed %s to %s", filename, destination)

        missing = [name for name in destinations if name not in found]
        if missing:
            raise OSError("Archive did not contain required lsfg-vk files: " + ", ".join(missing))

    def _copy_and_fix_json_file(self, source: Path, destination: Path) -> None:
        """Point the manifest at ~/.local/lib after Decky installs it."""
        try:
            data = json.loads(source.read_text(encoding="utf-8"))
            data["layer"]["library_path"] = "../../../lib/liblsfg-vk-layer.so"
            destination.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
            destination.chmod(0o644)
        except (json.JSONDecodeError, KeyError, OSError) as error:
            self.log.error("Error fixing JSON file %s: %s", source, error)
            self._copy_plugin_file(source, destination)

    def _create_config_file(self) -> ProfileData:
        """Migrate v1 once, normalize v2, and retain Decky launch workarounds."""
        from .dll_detection import DllDetectionService

        dll_service = DllDetectionService(self.log)
        profile_data: ProfileData
        was_legacy = False
        self._config_recovery_backup = None
        if self.config_file_path.exists():
            content = self.config_file_path.read_text(encoding="utf-8")
            was_legacy = ConfigurationManager.is_legacy_v1(content)
            try:
                profile_data = ConfigurationManager.parse_toml_content_multi_profile(content)
            except (ValueError, KeyError, TypeError) as error:
                self._config_recovery_backup = self._backup_config(content, "unrecognized")
                self.log.warning(
                    "Could not parse existing config; saved it to %s and using defaults: %s",
                    self._config_recovery_backup,
                    error,
                )
                default = ConfigurationManager.get_defaults_with_dll_detection(dll_service)
                profile_data = ProfileData(
                    current_profile="decky-lsfg-vk",
                    profiles={"decky-lsfg-vk": default},
                    global_config={"dll": default["dll"], "allow_fp16": default["allow_fp16"]},
                )
            if was_legacy:
                self._backup_legacy_config(content)
        else:
            default = ConfigurationManager.get_defaults_with_dll_detection(dll_service)
            profile_data = ProfileData(
                current_profile="decky-lsfg-vk",
                profiles={"decky-lsfg-vk": default},
                global_config={"dll": default["dll"], "allow_fp16": default["allow_fp16"]},
            )

        profile_data = self._merge_config_with_defaults(profile_data, dll_service)
        script_values = self._read_script_values()
        current_profile = profile_data["current_profile"]
        profile_data["profiles"][current_profile] = ConfigurationManager.merge_config_with_script(
            profile_data["profiles"][current_profile], script_values
        )
        self._write_file(
            self.config_file_path,
            ConfigurationManager.generate_toml_content_multi_profile(profile_data),
            0o644,
        )
        return profile_data

    def _backup_config(self, content: str, label: str) -> Path:
        backup_path = self.config_file_path.with_name(f"{self.config_file_path.name}.{label}.bak")
        if not backup_path.exists():
            self._write_file(backup_path, content, 0o644)
            self.log.info("Backed up %s configuration to %s", label, backup_path)
        return backup_path

    def _backup_legacy_config(self, content: str) -> None:
        self._backup_config(content, "v1")

    def _read_script_values(self) -> Dict[str, Any]:
        if not self.lsfg_launch_script_path.exists():
            return {}
        try:
            return ConfigurationManager.parse_script_content(
                self.lsfg_launch_script_path.read_text(encoding="utf-8")
            )
        except OSError as error:
            self.log.warning("Could not preserve launch-script settings: %s", error)
            return {}

    def _create_lsfg_launch_script(self, profile_data: ProfileData = None) -> None:
        """Write the v2 launcher after config migration has completed."""
        from .configuration import ConfigurationService

        if profile_data is None:
            profile_data = ConfigurationManager.parse_toml_content_multi_profile(
                self.config_file_path.read_text(encoding="utf-8")
            )
        configuration_service = ConfigurationService(logger=self.log)
        configuration_service.user_home = self.user_home
        configuration_service.config_dir = self.config_dir
        configuration_service.config_file_path = self.config_file_path
        configuration_service.lsfg_script_path = self.lsfg_launch_script_path
        script = configuration_service._generate_script_content_for_profile(profile_data)
        self._write_file(self.lsfg_launch_script_path, script, 0o755)

    def _merge_config_with_defaults(self, existing: ProfileData, dll_service) -> ProfileData:
        defaults = ConfigurationManager.get_defaults_with_dll_detection(dll_service)
        global_config = dict(existing.get("global_config", {}))
        global_config.setdefault("dll", defaults["dll"])
        global_config.setdefault("allow_fp16", defaults["allow_fp16"])

        profiles: Dict[str, Any] = {}
        for name, existing_config in existing.get("profiles", {}).items():
            profiles[name] = ConfigurationManager.validate_config({
                **defaults,
                **existing_config,
                **global_config,
            })
        if not profiles:
            profiles["decky-lsfg-vk"] = ConfigurationManager.validate_config(defaults)

        current_profile = existing.get("current_profile", "decky-lsfg-vk")
        if current_profile not in profiles:
            current_profile = "decky-lsfg-vk" if "decky-lsfg-vk" in profiles else next(iter(profiles))
        return ProfileData(
            current_profile=current_profile,
            profiles=profiles,
            global_config=global_config,
        )

    def _remove_legacy_layer_files(self) -> None:
        for path in (self.legacy_lib_file, self.legacy_json_file):
            if self._remove_if_exists(path):
                self.log.info("Removed superseded v1 layer file %s", path)

    def get_launch_script_path(self) -> str:
        return str(self.lsfg_launch_script_path)

    def check_installation(self) -> InstallationCheckResponse:
        try:
            lib_exists = self.lib_file.exists()
            json_exists = self.json_file.exists()
            legacy_installed = self.legacy_lib_file.exists() or self.legacy_json_file.exists()
            return {
                "installed": lib_exists and json_exists,
                "legacy_installed": legacy_installed,
                "lib_exists": lib_exists,
                "json_exists": json_exists,
                "script_exists": self.config_file_path.exists(),
                "lib_path": str(self.lib_file),
                "json_path": str(self.json_file),
                "script_path": str(self.config_file_path),
                "error": None,
            }
        except OSError as error:
            return {
                "installed": False,
                "legacy_installed": False,
                "lib_exists": False,
                "json_exists": False,
                "script_exists": False,
                "lib_path": str(self.lib_file),
                "json_path": str(self.json_file),
                "script_path": str(self.config_file_path),
                "error": str(error),
            }

    def uninstall(self) -> UninstallationResponse:
        try:
            removed = []
            for path in (
                self.lib_file,
                self.json_file,
                self.legacy_lib_file,
                self.legacy_json_file,
                self.lsfg_launch_script_path,
            ):
                if self._remove_if_exists(path):
                    removed.append(str(path))
            if not removed:
                return self._success_response(UninstallationResponse, "No lsfg-vk files found to remove", removed_files=None)
            return self._success_response(
                UninstallationResponse,
                f"lsfg-vk uninstalled successfully. Removed {len(removed)} files.",
                removed_files=removed,
            )
        except OSError as error:
            return self._error_response(UninstallationResponse, str(error), message="", removed_files=None)

    def cleanup_on_uninstall(self) -> None:
        try:
            self.uninstall()
        except Exception as error:
            self.log.error("Error cleaning up lsfg-vk files during uninstall: %s", error)
            self.log.error("Traceback: %s", traceback.format_exc())
