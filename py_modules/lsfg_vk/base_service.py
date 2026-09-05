import os
import tempfile
from pathlib import Path
from typing import Any, Dict, Optional, TypeVar

import decky

from .constants import CONFIG_DIR, CONFIG_FILENAME, LOCAL_BIN, LOCAL_LIB, SCRIPT_NAME, VULKAN_LAYER_DIR

ResponseType = TypeVar("ResponseType", bound=Dict[str, Any])


class BaseService:
    def __init__(self, logger: Optional[Any] = None):
        self.log = decky.logger if logger is None else logger
        self.user_home = Path.home()
        self.local_bin_dir = self.user_home / LOCAL_BIN
        self.local_lib_dir = self.user_home / LOCAL_LIB
        self.local_share_dir = self.user_home / VULKAN_LAYER_DIR
        self.lsfg_script_path = self.user_home / SCRIPT_NAME
        self.lsfg_launch_script_path = self.user_home / SCRIPT_NAME
        self.config_dir = self.user_home / CONFIG_DIR
        self.config_file_path = self.config_dir / CONFIG_FILENAME

    def _ensure_directories(self) -> None:
        for directory in (self.local_bin_dir, self.local_lib_dir, self.local_share_dir, self.config_dir):
            directory.mkdir(parents=True, exist_ok=True)

    def _remove_if_exists(self, path: Path) -> bool:
        if not path.exists() and not path.is_symlink():
            return False
        path.unlink()
        self.log.info(f"Removed {path}")
        return True

    def _write_file(self, path: Path, content: str, mode: int = 0o644) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=path.parent,
                prefix=f".{path.name}.",
                delete=False,
            ) as temporary_file:
                temporary_path = Path(temporary_file.name)
                temporary_file.write(content)
                temporary_file.flush()
                os.fsync(temporary_file.fileno())
            temporary_path.chmod(mode)
            os.replace(temporary_path, path)
        except Exception:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)
            raise

    def _success_response(self, response_type: type, message: str = "", **kwargs) -> Any:
        response = {"success": True, "message": message, "error": None}
        response.update(kwargs)
        return response

    def _error_response(self, response_type: type, error: str, message: str = "", **kwargs) -> Any:
        response = {"success": False, "message": message, "error": error}
        response.update(kwargs)
        return response
