"""
Installation service for lsfg-vk.
"""

import os
import shutil
import zipfile
import tempfile
from pathlib import Path
from typing import Dict, Any

from .base_service import BaseService
from .constants import (
    LIB_FILENAME, JSON_FILENAME, ZIP_FILENAME, BIN_DIR,
    SO_EXT, JSON_EXT, LSFG_SCRIPT_TEMPLATE,
    DEFAULT_MULTIPLIER, DEFAULT_FLOW_SCALE, DEFAULT_ENABLE_LSFG,
    DEFAULT_HDR, DEFAULT_PERF_MODE, DEFAULT_IMMEDIATE_MODE, DEFAULT_DISABLE_VKBASALT,
    DEFAULT_FRAME_CAP
)
from .types import InstallationResponse, UninstallationResponse, InstallationCheckResponse


class InstallationService(BaseService):
    """Service for handling lsfg-vk installation and uninstallation"""
    
    def __init__(self, logger=None):
        super().__init__(logger)
        
        # File paths using constants
        self.lib_file = self.local_lib_dir / LIB_FILENAME
        self.json_file = self.local_share_dir / JSON_FILENAME
    
    def install(self) -> InstallationResponse:
        """Install lsfg-vk by extracting the zip file to ~/.local
        
        Returns:
            InstallationResponse with success status and message/error
        """
        try:
            # Get the path to the zip file - need to go up to plugin root from py_modules/lsfg_vk/
            plugin_dir = Path(__file__).parent.parent.parent
            zip_path = plugin_dir / BIN_DIR / ZIP_FILENAME
            
            # Check if the zip file exists
            if not zip_path.exists():
                error_msg = f"{ZIP_FILENAME} not found at {zip_path}"
                self.log.error(error_msg)
                return {"success": False, "error": error_msg, "message": ""}
            
            # Create directories if they don't exist
            self._ensure_directories()
            
            # Extract and install files
            self._extract_and_install_files(zip_path)
            
            # Create the lsfg script
            self._create_lsfg_script()
            
            self.log.info("lsfg-vk installed successfully")
            return {"success": True, "message": "lsfg-vk installed successfully", "error": None}
            
        except (OSError, zipfile.BadZipFile, shutil.Error) as e:
            error_msg = f"Error installing lsfg-vk: {str(e)}"
            self.log.error(error_msg)
            return {"success": False, "error": str(e), "message": ""}
        except Exception as e:
            # Catch unexpected errors but log them separately
            error_msg = f"Unexpected error installing lsfg-vk: {str(e)}"
            self.log.error(error_msg)
            return {"success": False, "error": str(e), "message": ""}
    
    def _extract_and_install_files(self, zip_path: Path) -> None:
        """Extract zip file and install files to appropriate locations
        
        Args:
            zip_path: Path to the zip file to extract
            
        Raises:
            zipfile.BadZipFile: If zip file is corrupted
            OSError: If file operations fail
        """
        # Destination mapping for file types
        dest_map = {
            SO_EXT: self.local_lib_dir,
            JSON_EXT: self.local_share_dir
        }
        
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            with tempfile.TemporaryDirectory() as temp_dir:
                temp_path = Path(temp_dir)
                zip_ref.extractall(temp_path)
                
                # Process extracted files
                for root, dirs, files in os.walk(temp_path):
                    root_path = Path(root)
                    for file in files:
                        src_file = root_path / file
                        file_path = Path(file)
                        
                        # Check if we know where this file type should go
                        dst_dir = dest_map.get(file_path.suffix)
                        if dst_dir:
                            dst_file = dst_dir / file
                            shutil.copy2(src_file, dst_file)
                            self.log.info(f"Copied {file} to {dst_file}")
    
    def _create_lsfg_script(self) -> None:
        """Create the lsfg script in home directory with default configuration"""
        script_content = LSFG_SCRIPT_TEMPLATE.format(
            enable_lsfg="export ENABLE_LSFG=1" if DEFAULT_ENABLE_LSFG else "# export ENABLE_LSFG=1",
            multiplier=DEFAULT_MULTIPLIER,
            flow_scale=DEFAULT_FLOW_SCALE,
            hdr="export LSFG_HDR=1" if DEFAULT_HDR else "# export LSFG_HDR=1",
            perf_mode="export LSFG_PERF_MODE=1" if DEFAULT_PERF_MODE else "# export LSFG_PERF_MODE=1",
            immediate_mode="export MESA_VK_WSI_PRESENT_MODE=immediate # - disable vsync" if DEFAULT_IMMEDIATE_MODE else "# export MESA_VK_WSI_PRESENT_MODE=immediate # - disable vsync",
            disable_vkbasalt="export DISABLE_VKBASALT=1" if DEFAULT_DISABLE_VKBASALT else "# export DISABLE_VKBASALT=1",
            frame_cap=f"export DXVK_FRAME_RATE={DEFAULT_FRAME_CAP}" if DEFAULT_FRAME_CAP > 0 else "# export DXVK_FRAME_RATE=60"
        )
        
        # Use atomic write to prevent corruption
        self._atomic_write(self.lsfg_script_path, script_content, 0o755)
        self.log.info(f"Created executable lsfg script at {self.lsfg_script_path}")
    
    def check_installation(self) -> InstallationCheckResponse:
        """Check if lsfg-vk is already installed
        
        Returns:
            InstallationCheckResponse with installation status and file paths
        """
        try:
            lib_exists = self.lib_file.exists()
            json_exists = self.json_file.exists()
            script_exists = self.lsfg_script_path.exists()
            
            self.log.info(f"Installation check: lib={lib_exists}, json={json_exists}, script={script_exists}")
            
            return {
                "installed": lib_exists and json_exists,
                "lib_exists": lib_exists,
                "json_exists": json_exists,
                "script_exists": script_exists,
                "lib_path": str(self.lib_file),
                "json_path": str(self.json_file),
                "script_path": str(self.lsfg_script_path),
                "error": None
            }
            
        except Exception as e:
            error_msg = f"Error checking lsfg-vk installation: {str(e)}"
            self.log.error(error_msg)
            return {
                "installed": False,
                "lib_exists": False,
                "json_exists": False,
                "script_exists": False,
                "lib_path": str(self.lib_file),
                "json_path": str(self.json_file),
                "script_path": str(self.lsfg_script_path),
                "error": str(e)
            }
    
    def uninstall(self) -> UninstallationResponse:
        """Uninstall lsfg-vk by removing the installed files
        
        Returns:
            UninstallationResponse with success status and removed files list
        """
        try:
            removed_files = []
            files_to_remove = [self.lib_file, self.json_file, self.lsfg_script_path]
            
            for file_path in files_to_remove:
                if self._remove_if_exists(file_path):
                    removed_files.append(str(file_path))
            
            if not removed_files:
                return {
                    "success": True, 
                    "message": "No lsfg-vk files found to remove",
                    "removed_files": None,
                    "error": None
                }
            
            self.log.info("lsfg-vk uninstalled successfully")
            return {
                "success": True, 
                "message": f"lsfg-vk uninstalled successfully. Removed {len(removed_files)} files.",
                "removed_files": removed_files,
                "error": None
            }
            
        except OSError as e:
            error_msg = f"Error uninstalling lsfg-vk: {str(e)}"
            self.log.error(error_msg)
            return {
                "success": False, 
                "message": "",
                "removed_files": None,
                "error": str(e)
            }
    
    def cleanup_on_uninstall(self) -> None:
        """Clean up lsfg-vk files when the plugin is uninstalled"""
        try:
            self.log.info("Checking for lsfg-vk files to clean up:")
            self.log.info(f"  Library file: {self.lib_file}")
            self.log.info(f"  JSON file: {self.json_file}")
            self.log.info(f"  lsfg script: {self.lsfg_script_path}")
            
            removed_files = []
            files_to_remove = [self.lib_file, self.json_file, self.lsfg_script_path]
            
            for file_path in files_to_remove:
                try:
                    if self._remove_if_exists(file_path):
                        removed_files.append(str(file_path))
                except OSError as e:
                    self.log.error(f"Failed to remove {file_path}: {e}")
            
            if removed_files:
                self.log.info(f"Cleaned up {len(removed_files)} lsfg-vk files during plugin uninstall: {removed_files}")
            else:
                self.log.info("No lsfg-vk files found to clean up during plugin uninstall")
                
        except Exception as e:
            self.log.error(f"Error cleaning up lsfg-vk files during uninstall: {str(e)}")
            import traceback
            self.log.error(f"Traceback: {traceback.format_exc()}")
