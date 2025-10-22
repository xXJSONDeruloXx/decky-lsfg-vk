"""
DLL detection service for Lossless Scaling.
"""

import os
import re
from pathlib import Path
from typing import Dict, Any, List

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
        
        Search order:
        1. LSFG_DLL_PATH environment variable
        2. XDG_DATA_HOME Steam directory
        3. HOME/.local/share Steam directory  
        4. All Steam library folders (including SD cards)
        
        Returns:
            DllDetectionResponse with detection status and path information
        """
        try:
            dll_path = self._check_env_dll_path()
            if dll_path:
                return dll_path
            
            xdg_path = self._check_xdg_data_home()
            if xdg_path:
                return xdg_path
            
            home_path = self._check_home_local_share()
            if home_path:
                return home_path
            
            steam_libraries_path = self._check_steam_library_folders()
            if steam_libraries_path:
                return steam_libraries_path
            
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

    def _check_steam_library_folders(self) -> DllDetectionResponse | None:
        """Check all Steam library folders for Lossless Scaling DLL
        
        This method parses Steam's libraryfolders.vdf file to find all
        Steam library locations and checks each one for the DLL.
        
        Returns:
            DllDetectionResponse if found, None otherwise
        """
        steam_libraries = self._get_steam_library_paths()
        
        for library_path in steam_libraries:
            dll_path = Path(library_path) / STEAM_COMMON_PATH / LOSSLESS_DLL_NAME
            if dll_path.exists():
                self.log.info(f"Found DLL in Steam library: {dll_path}")
                return {
                    "detected": True,
                    "path": str(dll_path),
                    "source": f"Steam library folder: {library_path}",
                    "message": None,
                    "error": None
                }
        
        return None
    
    def _get_steam_library_paths(self) -> List[str]:
        """Get all Steam library folder paths from libraryfolders.vdf
        
        Returns:
            List of Steam library folder paths
        """
        library_paths = []
        
        steam_paths = []
        
        data_dir = os.getenv(ENV_XDG_DATA_HOME)
        if data_dir and data_dir.strip():
            steam_paths.append(Path(data_dir.strip()) / "Steam")
        
        home_dir = os.getenv(ENV_HOME)
        if home_dir and home_dir.strip():
            steam_paths.append(Path(home_dir.strip()) / ".local" / "share" / "Steam")
        
        for steam_path in steam_paths:
            if steam_path.exists():
                library_paths.append(str(steam_path))
                
                vdf_path = steam_path / "steamapps" / "libraryfolders.vdf"
                if vdf_path.exists():
                    try:
                        additional_paths = self._parse_library_folders_vdf(vdf_path)
                        library_paths.extend(additional_paths)
                    except Exception as e:
                        self.log.warning(f"Failed to parse {vdf_path}: {str(e)}")
        
        seen = set()
        unique_paths = []
        for path in library_paths:
            if path not in seen:
                seen.add(path)
                unique_paths.append(path)
        
        self.log.info(f"Found {len(unique_paths)} Steam library paths: {unique_paths}")
        return unique_paths
    
    def _parse_library_folders_vdf(self, vdf_path: Path) -> List[str]:
        """Parse Steam's libraryfolders.vdf file to extract library paths
        
        Args:
            vdf_path: Path to the libraryfolders.vdf file
            
        Returns:
            List of additional Steam library folder paths
        """
        library_paths = []
        
        try:
            with open(vdf_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            path_pattern = r'"path"\s*"([^"]+)"'
            matches = re.findall(path_pattern, content, re.IGNORECASE)
            
            for path_match in matches:
                path = path_match.replace('\\\\', '/').replace('\\', '/')
                library_path = Path(path)
                
                if library_path.exists() and (library_path / "steamapps").exists():
                    library_paths.append(str(library_path))
                    self.log.info(f"Found additional Steam library: {library_path}")
        
        except Exception as e:
            self.log.error(f"Error parsing libraryfolders.vdf: {str(e)}")
        
        return library_paths
