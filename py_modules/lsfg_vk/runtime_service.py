import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Sequence

from .base_service import BaseService
from .constants import CLI_FILENAME


class RuntimeService(BaseService):
    COMMAND_TIMEOUT_SECONDS = 10
    MAX_OUTPUT_LENGTH = 12_000
    DLL_MISSING_MARKER = "! The DLL file does not exist:"
    DLL_NONE_MARKER = "DLL override: (none)"

    def __init__(self, logger=None):
        super().__init__(logger)
        self.cli_path = self.local_bin_dir / CLI_FILENAME

    def _environment(self) -> dict[str, str]:
        environment = os.environ.copy()
        environment.update(
            HOME=str(self.user_home),
            XDG_CONFIG_HOME=str(self.user_home / ".config"),
        )
        for name in ("LSFGVK_CONFIG", "LSFGVK_PROFILE", "LSFGVK_ENV"):
            environment.pop(name, None)
        return environment

    @classmethod
    def _output(cls, stdout: Any, stderr: Any) -> str:
        values = []
        for value in (stdout, stderr):
            if isinstance(value, bytes):
                value = value.decode("utf-8", errors="replace")
            if value:
                values.append(str(value).strip())
        output = "\n".join(value for value in values if value)
        return output if len(output) <= cls.MAX_OUTPUT_LENGTH else output[: cls.MAX_OUTPUT_LENGTH]

    def _run(self, arguments: Sequence[str]) -> tuple[int, str]:
        if not self.cli_path.is_file() or not os.access(self.cli_path, os.X_OK):
            raise FileNotFoundError(f"{CLI_FILENAME} is not installed at {self.cli_path}")
        result = subprocess.run(
            [str(self.cli_path), *arguments],
            cwd=str(self.user_home),
            env=self._environment(),
            capture_output=True,
            text=True,
            timeout=self.COMMAND_TIMEOUT_SECONDS,
            check=False,
        )
        return result.returncode, self._output(result.stdout, result.stderr)

    def validate_config_content(self, content: str) -> None:
        self.config_dir.mkdir(parents=True, exist_ok=True)
        temporary_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=self.config_dir,
                prefix=".conf.toml.",
                suffix=".tmp",
                delete=False,
            ) as temporary_file:
                temporary_path = Path(temporary_file.name)
                temporary_file.write(content)
                temporary_file.flush()
                os.fsync(temporary_file.fileno())

            returncode, output = self._run(("validate", "--config", str(temporary_path)))
            if returncode != 0:
                raise ValueError(output or "lsfg-vk rejected the generated configuration")
        finally:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)

    def is_healthy(self) -> bool:
        returncode, output = self._run(("healthcheck",))
        return returncode == 0 and "Healthcheck found issues" not in output

    def check_lossless_scaling(self) -> dict[str, Any]:
        """Report Lossless Scaling state from lsfg-vk's own validator."""
        if not self.config_file_path.is_file():
            return {
                "installed": False,
                "status": "lsfg-vk configuration is not installed",
            }

        try:
            returncode, output = self._run(
                ("validate", "--config", str(self.config_file_path), "--print")
            )
        except Exception as error:
            return {"installed": False, "status": str(error)}

        if returncode != 0:
            return {
                "installed": False,
                "status": output or "lsfg-vk could not validate its configuration",
            }

        if self.DLL_MISSING_MARKER in output:
            return {
                "installed": False,
                "status": "Lossless Scaling's lsfg-vk.dll was not found",
            }

        if self.DLL_NONE_MARKER in output:
            return {
                "installed": False,
                "status": "Lossless Scaling's lsfg-vk.dll is not configured",
            }

        return {
            "installed": True,
            "status": "Lossless Scaling detected by lsfg-vk",
        }
