"""
Base service class with common functionality.
"""

import os
import shutil
import tempfile
from pathlib import Path
from typing import Any, Optional

from .constants import LOCAL_LIB, LOCAL_SHARE_BASE, VULKAN_LAYER_DIR, SCRIPT_NAME, CONFIG_DIR, CONFIG_FILENAME


class BaseService:
    """Base service class with common functionality"""
    
    def __init__(self, logger: Optional[Any] = None):
        """Initialize base service
        
        Args:
            logger: Logger instance, defaults to decky.logger if None
        """
        if logger is None:
            import decky
            self.log = decky.logger
        else:
            self.log = logger
            
        # Initialize common paths using pathlib
        self.user_home = Path.home()
        self.local_lib_dir = self.user_home / LOCAL_LIB
        self.local_share_dir = self.user_home / VULKAN_LAYER_DIR
        self.lsfg_script_path = self.user_home / SCRIPT_NAME
        self.config_dir = self.user_home / CONFIG_DIR
        self.config_file_path = self.config_dir / CONFIG_FILENAME
    
    def _ensure_directories(self) -> None:
        """Create necessary directories if they don't exist"""
        self.local_lib_dir.mkdir(parents=True, exist_ok=True)
        self.local_share_dir.mkdir(parents=True, exist_ok=True)
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.log.info(f"Ensured directories exist: {self.local_lib_dir}, {self.local_share_dir}, {self.config_dir}")
    
    def _remove_if_exists(self, path: Path) -> bool:
        """Remove a file if it exists
        
        Args:
            path: Path to the file to remove
            
        Returns:
            True if file was removed, False if it didn't exist
            
        Raises:
            OSError: If removal fails
        """
        if path.exists():
            try:
                path.unlink()
                self.log.info(f"Removed {path}")
                return True
            except OSError as e:
                self.log.error(f"Failed to remove {path}: {e}")
                raise
        else:
            self.log.info(f"File not found: {path}")
            return False
    
    def _atomic_write(self, path: Path, content: str, mode: int = 0o644) -> None:
        """Write content to a file atomically
        
        Args:
            path: Target file path
            content: Content to write
            mode: File permissions (default: 0o644)
            
        Raises:
            OSError: If write fails
        """
        # Create temporary file in the same directory to ensure atomic move
        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(
                mode='w', 
                dir=path.parent, 
                delete=False,
                prefix=f'.{path.name}.',
                suffix='.tmp'
            ) as temp_file:
                temp_file.write(content)
                temp_path = Path(temp_file.name)
            
            # Set permissions before moving
            temp_path.chmod(mode)
            
            # Atomic move
            temp_path.replace(path)
            self.log.info(f"Atomically wrote to {path}")
            
        except Exception:
            # Clean up temp file if something went wrong
            if temp_path and temp_path.exists():
                try:
                    temp_path.unlink()
                except OSError:
                    pass  # Best effort cleanup
            raise
