"""
DLL detection service for Lossless Scaling.
"""

import os
from pathlib import Path
from typing import Dict, Any

from .base_service import BaseService
from .constants import (
    ENV_LSFG_DLL_PATH, ENV_XDG_DATA_HOME, ENV_HOME,
    STEAM_COMMON_PATH, LOSSLESS_DLL_NAME
)
from .types import DllDetectionResponse


class DllDetectionService(BaseService):
    """Service for detecting Lossless Scaling DLL"""
    
    def check_lossless_scaling_dll(self) -> DllDetectionResponse:
        """Check if Lossless Scaling DLL is available at the expected paths
        
        Returns:
            DllDetectionResponse with detection status and path information
        """
        try:
            # Check environment variable first
            dll_path = self._check_env_dll_path()
            if dll_path:
                return dll_path
            
            # Check XDG_DATA_HOME path
            xdg_path = self._check_xdg_data_home()
            if xdg_path:
                return xdg_path
            
            # Check HOME/.local/share path
            home_path = self._check_home_local_share()
            if home_path:
                return home_path
            
            # DLL not found in any expected location
            return {
                "detected": False,
                "path": None,
                "source": None,
                "message": "Lossless Scaling DLL not found in expected locations",
                "error": None
            }
            
        except Exception as e:
            error_msg = f"Error checking Lossless Scaling DLL: {str(e)}"
            self.log.error(error_msg)
            return {
                "detected": False,
                "path": None,
                "source": None,
                "message": None,
                "error": str(e)
            }
    
    def _check_env_dll_path(self) -> DllDetectionResponse | None:
        """Check LSFG_DLL_PATH environment variable
        
        Returns:
            DllDetectionResponse if found, None otherwise
        """
        dll_path = os.getenv(ENV_LSFG_DLL_PATH)
        if dll_path and dll_path.strip():
            dll_path_obj = Path(dll_path.strip())
            if dll_path_obj.exists():
                self.log.info(f"Found DLL via {ENV_LSFG_DLL_PATH}: {dll_path_obj}")
                return {
                    "detected": True,
                    "path": str(dll_path_obj),
                    "source": f"{ENV_LSFG_DLL_PATH} environment variable",
                    "message": None,
                    "error": None
                }
        return None
    
    def _check_xdg_data_home(self) -> DllDetectionResponse | None:
        """Check XDG_DATA_HOME Steam directory
        
        Returns:
            DllDetectionResponse if found, None otherwise
        """
        data_dir = os.getenv(ENV_XDG_DATA_HOME)
        if data_dir and data_dir.strip():
            dll_path = Path(data_dir.strip()) / "Steam" / STEAM_COMMON_PATH / LOSSLESS_DLL_NAME
            if dll_path.exists():
                self.log.info(f"Found DLL via {ENV_XDG_DATA_HOME}: {dll_path}")
                return {
                    "detected": True,
                    "path": str(dll_path),
                    "source": f"{ENV_XDG_DATA_HOME} Steam directory",
                    "message": None,
                    "error": None
                }
        return None
    
    def _check_home_local_share(self) -> DllDetectionResponse | None:
        """Check HOME/.local/share Steam directory
        
        Returns:
            DllDetectionResponse if found, None otherwise
        """
        home_dir = os.getenv(ENV_HOME)
        if home_dir and home_dir.strip():
            dll_path = Path(home_dir.strip()) / ".local" / "share" / "Steam" / STEAM_COMMON_PATH / LOSSLESS_DLL_NAME
            if dll_path.exists():
                self.log.info(f"Found DLL via {ENV_HOME}/.local/share: {dll_path}")
                return {
                    "detected": True,
                    "path": str(dll_path),
                    "source": f"{ENV_HOME}/.local/share Steam directory",
                    "message": None,
                    "error": None
                }
        return None
