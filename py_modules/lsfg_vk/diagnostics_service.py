import json
import platform
from pathlib import Path
from typing import Callable, List, Optional, Tuple

from .base_service import BaseService
from .constants import (
    ARCHIVE_FILENAME,
    CLI_FILENAME,
    JSON_FILENAME,
    JSON_X86_FILENAME,
    LIB_FILENAME,
    LIB_X86_FILENAME,
)
from .runtime_service import RuntimeService
from .steam_service import SteamService


class DiagnosticsService(BaseService):
    """Builds a plain-text report users can paste into a support channel."""

    def __init__(
        self,
        logger=None,
        runtime_service: Optional[RuntimeService] = None,
        steam_service: Optional[SteamService] = None,
    ):
        super().__init__(logger)
        self.runtime_service = runtime_service or RuntimeService(logger=self.log)
        self.steam_service = steam_service or SteamService(logger=self.log)
        self.plugin_root = Path(__file__).resolve().parent.parent.parent

    def _plugin_version(self) -> str:
        try:
            with open(self.plugin_root / "package.json", encoding="utf-8") as handle:
                return str(json.load(handle).get("version", "unknown"))
        except Exception:
            return "unknown"

    @staticmethod
    def _os_name() -> str:
        try:
            for line in Path("/etc/os-release").read_text(encoding="utf-8").splitlines():
                if line.startswith("PRETTY_NAME="):
                    return line.split("=", 1)[1].strip().strip('"')
        except Exception:
            pass
        return platform.platform()

    def _present(self, path: Path) -> str:
        if path.is_symlink():
            return "symlink"
        return "present" if path.is_file() else "missing"

    def _safe(self, label: str, producer: Callable[[], str]) -> str:
        try:
            return producer()
        except Exception as error:
            return f"error ({error})"

    def _mask_home(self, text: str) -> str:
        return text.replace(str(self.user_home), "~")

    def _layer_files(self) -> List[Tuple[str, Path]]:
        return [
            (CLI_FILENAME, self.local_bin_dir / CLI_FILENAME),
            (LIB_FILENAME, self.local_lib_dir / LIB_FILENAME),
            (LIB_X86_FILENAME, self.local_lib_dir / LIB_X86_FILENAME),
            (JSON_FILENAME, self.local_share_dir / JSON_FILENAME),
            (JSON_X86_FILENAME, self.local_share_dir / JSON_X86_FILENAME),
            ("conf.toml", self.config_file_path),
        ]

    def _config_validation(self) -> str:
        if not self.config_file_path.is_file():
            return "skipped (no config file)"
        returncode, output = self.runtime_service._run(
            ("validate", "--config", str(self.config_file_path))
        )
        if returncode == 0:
            return "ok"
        return f"failed: {output or 'no output'}"

    def _healthcheck(self) -> str:
        return "ok" if self.runtime_service.is_healthy() else "reported issues"

    def _lossless_scaling(self) -> str:
        status = self.runtime_service.check_lossless_scaling()
        return f"{'detected' if status['installed'] else 'not detected'} - {status['status']}"

    def _branch(self) -> str:
        status = self.steam_service.get_branch_status()
        if not status.get("installed"):
            return "Lossless Scaling not installed through Steam"
        return (
            f"selected={status.get('selected_branch') or 'public'}, "
            f"target={status.get('target_branch')}, "
            f"needs_switch={status.get('needs_switch')}"
        )

    def build_report(self) -> str:
        lines = [
            "decky-lsfg-vk diagnostics",
            f"Plugin version: {self._plugin_version()}",
            f"OS: {self._os_name()}",
            f"Kernel: {platform.release()}",
            f"Bundled archive: {ARCHIVE_FILENAME}",
            "",
            "Files:",
        ]
        for name, path in self._layer_files():
            lines.append(f"  {name}: {self._present(path)}")
        lines += [
            "",
            f"Lossless Scaling: {self._safe('lossless_scaling', self._lossless_scaling)}",
            f"Steam branch: {self._safe('branch', self._branch)}",
            f"Config validation: {self._safe('validation', self._config_validation)}",
            f"Healthcheck: {self._safe('healthcheck', self._healthcheck)}",
        ]
        return self._mask_home("\n".join(lines))

    def get_report(self) -> dict:
        try:
            return self._success_response(dict, "Diagnostics generated", report=self.build_report())
        except Exception as error:
            self.log.error(f"Error generating diagnostics: {error}")
            return self._error_response(dict, str(error), report=None)
