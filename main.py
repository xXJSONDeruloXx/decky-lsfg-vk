import os
import zipfile
import shutil
import subprocess
import tempfile
from typing import Dict, Any

# The decky plugin module is located at decky-loader/plugin
# For easy intellisense checkout the decky-loader code repo
# and add the `decky-loader/plugin/imports` path to `python.analysis.extraPaths` in `.vscode/settings.json`
import decky
import asyncio


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
            plugin_dir = os.path.dirname(os.path.realpath(__file__))
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


class ConfigurationService:
    """Service for managing lsfg script configuration"""
    
    def __init__(self):
        self.user_home = os.path.expanduser("~")
        self.lsfg_script_path = os.path.join(self.user_home, "lsfg")
    
    async def get_config(self) -> Dict[str, Any]:
        """Read current lsfg script configuration"""
        try:
            if not os.path.exists(self.lsfg_script_path):
                return {
                    "success": False,
                    "error": "lsfg script not found"
                }
            
            with open(self.lsfg_script_path, 'r') as f:
                content = f.read()
            
            # Parse the script content to extract current values
            config = {
                "enable_lsfg": False,
                "multiplier": 2,
                "flow_scale": 1.0,
                "hdr": False,
                "perf_mode": False,
                "immediate_mode": False
            }
            
            lines = content.split('\n')
            for line in lines:
                line = line.strip()
                
                # Handle ENABLE_LSFG - check if it's commented out or not
                if line.startswith('export ENABLE_LSFG='):
                    try:
                        value = line.split('=')[1].strip()
                        config["enable_lsfg"] = value == '1'
                    except:
                        pass
                elif line.startswith('# export ENABLE_LSFG='):
                    config["enable_lsfg"] = False
                
                # Handle LSFG_MULTIPLIER
                elif line.startswith('export LSFG_MULTIPLIER='):
                    try:
                        value = line.split('=')[1].strip()
                        config["multiplier"] = int(value)
                    except:
                        pass
                
                # Handle LSFG_FLOW_SCALE
                elif line.startswith('export LSFG_FLOW_SCALE='):
                    try:
                        value = line.split('=')[1].strip()
                        config["flow_scale"] = float(value)
                    except:
                        pass
                
                # Handle LSFG_HDR - check if it's commented out or not
                elif line.startswith('export LSFG_HDR='):
                    try:
                        value = line.split('=')[1].strip()
                        config["hdr"] = value == '1'
                    except:
                        pass
                elif line.startswith('# export LSFG_HDR='):
                    config["hdr"] = False
                
                # Handle LSFG_PERF_MODE - check if it's commented out or not
                elif line.startswith('export LSFG_PERF_MODE='):
                    try:
                        value = line.split('=')[1].strip()
                        config["perf_mode"] = value == '1'
                    except:
                        pass
                elif line.startswith('# export LSFG_PERF_MODE='):
                    config["perf_mode"] = False
                
                # Handle MESA_VK_WSI_PRESENT_MODE - check if it's commented out or not
                elif line.startswith('export MESA_VK_WSI_PRESENT_MODE='):
                    try:
                        value = line.split('=')[1].strip()
                        # Remove any comments after the value
                        value = value.split('#')[0].strip()
                        config["immediate_mode"] = value == 'immediate'
                    except:
                        pass
                elif line.startswith('# export MESA_VK_WSI_PRESENT_MODE='):
                    config["immediate_mode"] = False
            
            decky.logger.info(f"Parsed lsfg config: {config}")
            
            return {
                "success": True,
                "config": config
            }
            
        except Exception as e:
            decky.logger.error(f"Error reading lsfg config: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def update_config(self, enable_lsfg: bool, multiplier: int, flow_scale: float, 
                          hdr: bool, perf_mode: bool, immediate_mode: bool) -> Dict[str, Any]:
        """Update lsfg script configuration"""
        try:
            # Create script content based on parameters
            script_content = "#!/bin/bash\n\n"
            
            if enable_lsfg:
                script_content += "export ENABLE_LSFG=1\n"
            else:
                script_content += "# export ENABLE_LSFG=1\n"
            
            script_content += f"export LSFG_MULTIPLIER={multiplier}\n"
            script_content += f"export LSFG_FLOW_SCALE={flow_scale}\n"
            
            if hdr:
                script_content += "export LSFG_HDR=1\n"
            else:
                script_content += "# export LSFG_HDR=1\n"
            
            if perf_mode:
                script_content += "export LSFG_PERF_MODE=1\n"
            else:
                script_content += "# export LSFG_PERF_MODE=1\n"
            
            if immediate_mode:
                script_content += "export MESA_VK_WSI_PRESENT_MODE=immediate # - disable vsync\n"
            else:
                script_content += "# export MESA_VK_WSI_PRESENT_MODE=immediate # - disable vsync\n"
            
            # Add the exec line to allow the script to execute passed commands
            script_content += "\n# Execute the passed command with the environment variables set\n"
            script_content += "exec \"$@\"\n"
            
            # Write the updated script
            with open(self.lsfg_script_path, 'w') as f:
                f.write(script_content)
            
            # Make sure it's executable
            os.chmod(self.lsfg_script_path, 0o755)
            
            decky.logger.info(f"Updated lsfg script configuration: enable={enable_lsfg}, multiplier={multiplier}, flow_scale={flow_scale}, hdr={hdr}, perf_mode={perf_mode}, immediate_mode={immediate_mode}")
            
            return {
                "success": True,
                "message": "lsfg configuration updated successfully"
            }
            
        except Exception as e:
            decky.logger.error(f"Error updating lsfg config: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }


class Plugin:
    def __init__(self):
        # Initialize services
        self.installation_service = InstallationService()
        self.dll_detection_service = DllDetectionService()
        self.configuration_service = ConfigurationService()

    # Installation methods
    async def install_lsfg_vk(self) -> dict:
        """Install lsfg-vk by extracting the zip file to ~/.local"""
        return await self.installation_service.install()

    async def check_lsfg_vk_installed(self) -> dict:
        """Check if lsfg-vk is already installed"""
        return await self.installation_service.check_installation()

    async def uninstall_lsfg_vk(self) -> dict:
        """Uninstall lsfg-vk by removing the installed files"""
        return await self.installation_service.uninstall()

    # DLL detection methods
    async def check_lossless_scaling_dll(self) -> dict:
        """Check if Lossless Scaling DLL is available at the expected paths"""
        return await self.dll_detection_service.check_lossless_scaling_dll()

    # Configuration methods
    async def get_lsfg_config(self) -> dict:
        """Read current lsfg script configuration"""
        return await self.configuration_service.get_config()

    async def update_lsfg_config(self, enable_lsfg: bool, multiplier: int, flow_scale: float, 
                               hdr: bool, perf_mode: bool, immediate_mode: bool) -> dict:
        """Update lsfg script configuration"""
        return await self.configuration_service.update_config(
            enable_lsfg, multiplier, flow_scale, hdr, perf_mode, immediate_mode
        )

    # Plugin lifecycle methods
    async def _main(self):
        """Asyncio-compatible long-running code, executed in a task when the plugin is loaded"""
        decky.logger.info("Lossless Scaling loaded!")

    async def _unload(self):
        """Function called first during the unload process"""
        decky.logger.info("Lossless Scaling unloading")

    async def _uninstall(self):
        """Function called after `_unload` during uninstall"""
        decky.logger.info("Lossless Scaling uninstalled - starting cleanup")
        
        # Clean up lsfg-vk files when the plugin is uninstalled
        self.installation_service.cleanup_on_uninstall()
        
        decky.logger.info("Lossless Scaling uninstall cleanup completed")

    async def _migration(self):
        """Migrations that should be performed before entering `_main()`"""
        decky.logger.info("Migrating")
        # Here's a migration example for logs:
        # - `~/.config/decky-template/template.log` will be migrated to `decky.decky_LOG_DIR/template.log`
        decky.migrate_logs(os.path.join(decky.DECKY_USER_HOME,
                                               ".config", "decky-template", "template.log"))
        # Here's a migration example for settings:
        # - `~/homebrew/settings/template.json` is migrated to `decky.decky_SETTINGS_DIR/template.json`
        # - `~/.config/decky-template/` all files and directories under this root are migrated to `decky.decky_SETTINGS_DIR/`
        decky.migrate_settings(
            os.path.join(decky.DECKY_HOME, "settings", "template.json"),
            os.path.join(decky.DECKY_USER_HOME, ".config", "decky-template"))
        # Here's a migration example for runtime data:
        # - `~/homebrew/template/` all files and directories under this root are migrated to `decky.decky_RUNTIME_DIR/`
        # - `~/.local/share/decky-template/` all files and directories under this root are migrated to `decky.decky_RUNTIME_DIR/`
        decky.migrate_runtime(
            os.path.join(decky.DECKY_HOME, "template"),
            os.path.join(decky.DECKY_USER_HOME, ".local", "share", "decky-template"))
