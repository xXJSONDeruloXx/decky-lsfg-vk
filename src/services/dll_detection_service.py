import os
from typing import Dict, Any
import decky


class DllDetectionService:
    """Service for detecting Lossless Scaling DLL"""
    
    async def check_lossless_scaling_dll(self) -> Dict[str, Any]:
        """Check if Lossless Scaling DLL is available at the expected paths"""
        try:
            # Check environment variable first
            dll_path = os.getenv("LSFG_DLL_PATH")
            if dll_path and dll_path.strip():
                dll_path_str = dll_path.strip()
                if os.path.exists(dll_path_str):
                    return {
                        "detected": True,
                        "path": dll_path_str,
                        "source": "LSFG_DLL_PATH environment variable"
                    }
            
            # Check XDG_DATA_HOME path
            data_dir = os.getenv("XDG_DATA_HOME")
            if data_dir and data_dir.strip():
                dll_path_str = os.path.join(data_dir.strip(), "Steam", "steamapps", "common", "Lossless Scaling", "Lossless.dll")
                if os.path.exists(dll_path_str):
                    return {
                        "detected": True,
                        "path": dll_path_str,
                        "source": "XDG_DATA_HOME Steam directory"
                    }
            
            # Check HOME/.local/share path
            home_dir = os.getenv("HOME")
            if home_dir and home_dir.strip():
                dll_path_str = os.path.join(home_dir.strip(), ".local", "share", "Steam", "steamapps", "common", "Lossless Scaling", "Lossless.dll")
                if os.path.exists(dll_path_str):
                    return {
                        "detected": True,
                        "path": dll_path_str,
                        "source": "HOME/.local/share Steam directory"
                    }
            
            # DLL not found in any expected location
            return {
                "detected": False,
                "path": None,
                "source": None,
                "message": "Lossless Scaling DLL not found in expected locations"
            }
            
        except Exception as e:
            decky.logger.error(f"Error checking Lossless Scaling DLL: {str(e)}")
            return {
                "detected": False,
                "path": None,
                "source": None,
                "error": str(e)
            }
