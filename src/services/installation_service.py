import os
import zipfile
import shutil
import tempfile
from typing import Dict, Any
import decky


class InstallationService:
    """Service for handling lsfg-vk installation and uninstallation"""
    
    def __init__(self):
        self.user_home = os.path.expanduser("~")
        self.local_lib_dir = os.path.join(self.user_home, ".local", "lib")
        self.local_share_dir = os.path.join(self.user_home, ".local", "share", "vulkan", "implicit_layer.d")
        self.lsfg_script_path = os.path.join(self.user_home, "lsfg")
        
        # File paths
        self.lib_file = os.path.join(self.local_lib_dir, "liblsfg-vk.so")
        self.json_file = os.path.join(self.local_share_dir, "VkLayer_LS_frame_generation.json")
    
    async def install(self) -> Dict[str, Any]:
        """Install lsfg-vk by extracting the zip file to ~/.local"""
        try:
            # Get the path to the lsfg-vk_archlinux.zip file in the bin directory
            plugin_dir = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
            zip_path = os.path.join(plugin_dir, "bin", "lsfg-vk_archlinux.zip")
            
            # Check if the zip file exists
            if not os.path.exists(zip_path):
                decky.logger.error(f"lsfg-vk_archlinux.zip not found at {zip_path}")
                return {"success": False, "error": "lsfg-vk_archlinux.zip file not found"}
            
            # Create directories if they don't exist
            os.makedirs(self.local_lib_dir, exist_ok=True)
            os.makedirs(self.local_share_dir, exist_ok=True)
            
            # Extract the zip file
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                # Use /tmp for temporary extraction since we may not have write permissions in plugin dir
                with tempfile.TemporaryDirectory() as temp_dir:
                    zip_ref.extractall(temp_dir)
                    
                    # Look for the extracted files and copy them to the correct locations
                    for root, dirs, files in os.walk(temp_dir):
                        for file in files:
                            src_file = os.path.join(root, file)
                            if file.endswith('.so'):
                                # Copy library files to ~/.local/lib
                                dst_file = os.path.join(self.local_lib_dir, file)
                                shutil.copy2(src_file, dst_file)
                                decky.logger.info(f"Copied {file} to {dst_file}")
                            elif file.endswith('.json'):
                                # Copy JSON files to ~/.local/share/vulkan/implicit_layer.d
                                dst_file = os.path.join(self.local_share_dir, file)
                                shutil.copy2(src_file, dst_file)
                                decky.logger.info(f"Copied {file} to {dst_file}")
            
            # Create the lsfg script
            self._create_lsfg_script()
            
            decky.logger.info("lsfg-vk installed successfully")
            return {"success": True, "message": "lsfg-vk installed successfully"}
            
        except Exception as e:
            decky.logger.error(f"Error installing lsfg-vk: {str(e)}")
            return {"success": False, "error": str(e)}
    
    def _create_lsfg_script(self):
        """Create the lsfg script in home directory"""
        script_content = """#!/bin/bash

export ENABLE_LSFG=1
export LSFG_MULTIPLIER=2
export LSFG_FLOW_SCALE=1.0
# export LSFG_HDR=1
# export LSFG_PERF_MODE=1
# export MESA_VK_WSI_PRESENT_MODE=immediate # - disable vsync

# Execute the passed command with the environment variables set
exec "$@"
"""
        
        with open(self.lsfg_script_path, 'w') as script_file:
            script_file.write(script_content)
        
        # Make the script executable
        os.chmod(self.lsfg_script_path, 0o755)
        decky.logger.info(f"Created executable lsfg script at {self.lsfg_script_path}")
    
    async def check_installation(self) -> Dict[str, Any]:
        """Check if lsfg-vk is already installed"""
        try:
            lib_exists = os.path.exists(self.lib_file)
            json_exists = os.path.exists(self.json_file)
            script_exists = os.path.exists(self.lsfg_script_path)
            
            decky.logger.info(f"Installation check: lib={lib_exists}, json={json_exists}, script={script_exists}")
            
            return {
                "installed": lib_exists and json_exists,
                "lib_exists": lib_exists,
                "json_exists": json_exists,
                "script_exists": script_exists,
                "lib_path": self.lib_file,
                "json_path": self.json_file,
                "script_path": self.lsfg_script_path
            }
            
        except Exception as e:
            decky.logger.error(f"Error checking lsfg-vk installation: {str(e)}")
            return {"installed": False, "error": str(e)}
    
    async def uninstall(self) -> Dict[str, Any]:
        """Uninstall lsfg-vk by removing the installed files"""
        try:
            removed_files = []
            
            # Remove library file if it exists
            if os.path.exists(self.lib_file):
                os.remove(self.lib_file)
                removed_files.append(self.lib_file)
                decky.logger.info(f"Removed {self.lib_file}")
            
            # Remove JSON file if it exists
            if os.path.exists(self.json_file):
                os.remove(self.json_file)
                removed_files.append(self.json_file)
                decky.logger.info(f"Removed {self.json_file}")
            
            # Remove lsfg script if it exists
            if os.path.exists(self.lsfg_script_path):
                os.remove(self.lsfg_script_path)
                removed_files.append(self.lsfg_script_path)
                decky.logger.info(f"Removed {self.lsfg_script_path}")
            
            if not removed_files:
                return {"success": True, "message": "No lsfg-vk files found to remove"}
            
            decky.logger.info("lsfg-vk uninstalled successfully")
            return {
                "success": True, 
                "message": f"lsfg-vk uninstalled successfully. Removed {len(removed_files)} files.",
                "removed_files": removed_files
            }
            
        except Exception as e:
            decky.logger.error(f"Error uninstalling lsfg-vk: {str(e)}")
            return {"success": False, "error": str(e)}
    
    def cleanup_on_uninstall(self) -> None:
        """Clean up lsfg-vk files when the plugin is uninstalled"""
        try:
            decky.logger.info(f"Checking for lsfg-vk files to clean up:")
            decky.logger.info(f"  Library file: {self.lib_file}")
            decky.logger.info(f"  JSON file: {self.json_file}")
            decky.logger.info(f"  lsfg script: {self.lsfg_script_path}")
            
            removed_files = []
            
            # Remove library file if it exists
            if os.path.exists(self.lib_file):
                decky.logger.info(f"Found library file, attempting to remove: {self.lib_file}")
                try:
                    os.remove(self.lib_file)
                    removed_files.append(self.lib_file)
                    decky.logger.info(f"Successfully removed {self.lib_file}")
                except Exception as e:
                    decky.logger.error(f"Failed to remove {self.lib_file}: {str(e)}")
            else:
                decky.logger.info(f"Library file not found: {self.lib_file}")
            
            # Remove JSON file if it exists
            if os.path.exists(self.json_file):
                decky.logger.info(f"Found JSON file, attempting to remove: {self.json_file}")
                try:
                    os.remove(self.json_file)
                    removed_files.append(self.json_file)
                    decky.logger.info(f"Successfully removed {self.json_file}")
                except Exception as e:
                    decky.logger.error(f"Failed to remove {self.json_file}: {str(e)}")
            else:
                decky.logger.info(f"JSON file not found: {self.json_file}")
            
            # Remove lsfg script if it exists
            if os.path.exists(self.lsfg_script_path):
                decky.logger.info(f"Found lsfg script, attempting to remove: {self.lsfg_script_path}")
                try:
                    os.remove(self.lsfg_script_path)
                    removed_files.append(self.lsfg_script_path)
                    decky.logger.info(f"Successfully removed {self.lsfg_script_path}")
                except Exception as e:
                    decky.logger.error(f"Failed to remove {self.lsfg_script_path}: {str(e)}")
            else:
                decky.logger.info(f"lsfg script not found: {self.lsfg_script_path}")
            
            if removed_files:
                decky.logger.info(f"Cleaned up {len(removed_files)} lsfg-vk files during plugin uninstall: {removed_files}")
            else:
                decky.logger.info("No lsfg-vk files found to clean up during plugin uninstall")
                
        except Exception as e:
            decky.logger.error(f"Error cleaning up lsfg-vk files during uninstall: {str(e)}")
            import traceback
            decky.logger.error(f"Traceback: {traceback.format_exc()}")
