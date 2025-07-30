"""
Installation service for lsfg-vk.
"""

import os
import shutil
import zipfile
import tempfile
import json
from pathlib import Path
from typing import Dict, Any

from .base_service import BaseService
from .constants import (
    LIB_FILENAME, JSON_FILENAME, ZIP_FILENAME, BIN_DIR,
    SO_EXT, JSON_EXT
)
from .config_schema import ConfigurationManager
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
                return self._error_response(InstallationResponse, error_msg, message="")
            
            # Create directories if they don't exist
            self._ensure_directories()
            
            # Extract and install files
            self._extract_and_install_files(zip_path)
            
            # Create the config file
            self._create_config_file()
            
            # Create the lsfg launch script
            self._create_lsfg_launch_script()
            
            self.log.info("lsfg-vk installed successfully")
            return self._success_response(InstallationResponse, "lsfg-vk installed successfully")
            
        except (OSError, zipfile.BadZipFile, shutil.Error) as e:
            error_msg = f"Error installing lsfg-vk: {str(e)}"
            self.log.error(error_msg)
            return self._error_response(InstallationResponse, str(e), message="")
        except Exception as e:
            # Catch unexpected errors but log them separately
            error_msg = f"Unexpected error installing lsfg-vk: {str(e)}"
            self.log.error(error_msg)
            return self._error_response(InstallationResponse, str(e), message="")
    
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
                            
                            # Special handling for JSON files - need to modify library_path
                            if file_path.suffix == JSON_EXT and file == JSON_FILENAME:
                                self._copy_and_fix_json_file(src_file, dst_file)
                            else:
                                shutil.copy2(src_file, dst_file)
                            
                            self.log.info(f"Copied {file} to {dst_file}")
    
    def _copy_and_fix_json_file(self, src_file: Path, dst_file: Path) -> None:
        """Copy JSON file and fix the library_path to use relative path
        
        Args:
            src_file: Source JSON file path
            dst_file: Destination JSON file path
        """
        try:
            # Read the JSON file
            with open(src_file, 'r') as f:
                json_data = json.load(f)
            
            # Fix the library_path from "liblsfg-vk.so" to "../../../lib/liblsfg-vk.so"
            if 'layer' in json_data and 'library_path' in json_data['layer']:
                current_path = json_data['layer']['library_path']
                if current_path == "liblsfg-vk.so":
                    json_data['layer']['library_path'] = "../../../lib/liblsfg-vk.so"
                    self.log.info(f"Fixed library_path from '{current_path}' to '../../../lib/liblsfg-vk.so'")
            
            # Write the modified JSON file
            with open(dst_file, 'w') as f:
                json.dump(json_data, f, indent=2)
                
        except (json.JSONDecodeError, KeyError, OSError) as e:
            self.log.error(f"Error fixing JSON file {src_file}: {e}")
            # Fallback to simple copy if JSON modification fails
            shutil.copy2(src_file, dst_file)
    
    def _create_config_file(self) -> None:
        """Create the TOML config file in ~/.config/lsfg-vk with default configuration and detected DLL path"""
        # Import here to avoid circular imports
        from .dll_detection import DllDetectionService
        
        # Try to detect DLL path
        dll_service = DllDetectionService(self.log)
        config = ConfigurationManager.get_defaults_with_dll_detection(dll_service)
        
        # Generate TOML content using centralized manager
        toml_content = ConfigurationManager.generate_toml_content(config)
        
        # Write initial config file
        self._write_file(self.config_file_path, toml_content, 0o644)
        self.log.info(f"Created config file at {self.config_file_path}")
        
        # Log detected DLL path if found - USE GENERATED CONSTANTS
        from .config_schema_generated import DLL
        if config[DLL]:
            self.log.info(f"Configured DLL path: {config[DLL]}")
    
    def _create_lsfg_launch_script(self) -> None:
        """Create the ~/lsfg launch script for easier game setup"""
        # Use the default configuration for the initial script
        from .config_schema import ConfigurationManager
        default_config = ConfigurationManager.get_defaults()
        
        # Create configuration service to generate the script
        from .configuration import ConfigurationService
        config_service = ConfigurationService(logger=self.log)
        config_service.user_home = self.user_home
        config_service.lsfg_script_path = self.lsfg_launch_script_path
        
        # Generate script content with default configuration
        script_content = config_service._generate_script_content(default_config)
        
        # Write the script file
        self._write_file(self.lsfg_launch_script_path, script_content, 0o755)
        self.log.info(f"Created lsfg launch script at {self.lsfg_launch_script_path}")
    
    def check_installation(self) -> InstallationCheckResponse:
        """Check if lsfg-vk is already installed
        
        Returns:
            InstallationCheckResponse with installation status and file paths
        """
        try:
            lib_exists = self.lib_file.exists()
            json_exists = self.json_file.exists()
            config_exists = self.config_file_path.exists()
            
            self.log.info(f"Installation check: lib={lib_exists}, json={json_exists}, config={config_exists}")
            
            return {
                "installed": lib_exists and json_exists,
                "lib_exists": lib_exists,
                "json_exists": json_exists,
                "script_exists": config_exists,  # Keep script_exists for backward compatibility
                "lib_path": str(self.lib_file),
                "json_path": str(self.json_file),
                "script_path": str(self.config_file_path),  # Keep script_path for backward compatibility
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
                "script_path": str(self.config_file_path),
                "error": str(e)
            }
    
    def uninstall(self) -> UninstallationResponse:
        """Uninstall lsfg-vk by removing the installed files
        
        Returns:
            UninstallationResponse with success status and removed files list
        """
        try:
            removed_files = []
            files_to_remove = [self.lib_file, self.json_file, self.config_file_path, self.lsfg_launch_script_path]
            
            for file_path in files_to_remove:
                if self._remove_if_exists(file_path):
                    removed_files.append(str(file_path))
            
            # Also try to remove the old script file if it exists (for backward compatibility)
            if self._remove_if_exists(self.lsfg_script_path):
                removed_files.append(str(self.lsfg_script_path))
            
            # Remove config directory if it's empty
            try:
                if self.config_dir.exists() and not any(self.config_dir.iterdir()):
                    self.config_dir.rmdir()
                    removed_files.append(str(self.config_dir))
            except OSError:
                pass  # Directory not empty or other error, ignore
            
            if not removed_files:
                return self._success_response(UninstallationResponse,
                                            "No lsfg-vk files found to remove",
                                            removed_files=None)
            
            self.log.info("lsfg-vk uninstalled successfully")
            return self._success_response(UninstallationResponse, 
                                        f"lsfg-vk uninstalled successfully. Removed {len(removed_files)} files.",
                                        removed_files=removed_files)
            
        except OSError as e:
            error_msg = f"Error uninstalling lsfg-vk: {str(e)}"
            self.log.error(error_msg)
            return self._error_response(UninstallationResponse, str(e), 
                                      message="", removed_files=None)
    
    def cleanup_on_uninstall(self) -> None:
        """Clean up lsfg-vk files when the plugin is uninstalled"""
        try:
            self.log.info("Checking for lsfg-vk files to clean up:")
            self.log.info(f"  Library file: {self.lib_file}")
            self.log.info(f"  JSON file: {self.json_file}")
            self.log.info(f"  Config file: {self.config_file_path}")
            self.log.info(f"  Launch script: {self.lsfg_launch_script_path}")
            self.log.info(f"  Old script file: {self.lsfg_script_path}")
            
            removed_files = []
            files_to_remove = [self.lib_file, self.json_file, self.config_file_path, self.lsfg_launch_script_path, self.lsfg_script_path]
            
            for file_path in files_to_remove:
                try:
                    if self._remove_if_exists(file_path):
                        removed_files.append(str(file_path))
                except OSError as e:
                    self.log.error(f"Failed to remove {file_path}: {e}")
            
            # Try to remove config directory if empty
            try:
                if self.config_dir.exists() and not any(self.config_dir.iterdir()):
                    self.config_dir.rmdir()
                    removed_files.append(str(self.config_dir))
            except OSError:
                pass  # Directory not empty or other error, ignore
            
            if removed_files:
                self.log.info(f"Cleaned up {len(removed_files)} lsfg-vk files during plugin uninstall: {removed_files}")
            else:
                self.log.info("No lsfg-vk files found to clean up during plugin uninstall")
                
        except Exception as e:
            self.log.error(f"Error cleaning up lsfg-vk files during uninstall: {str(e)}")
            import traceback
            self.log.error(f"Traceback: {traceback.format_exc()}")
