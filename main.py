import os
import tarfile
import shutil
import subprocess
import tempfile

# The decky plugin module is located at decky-loader/plugin
# For easy intellisense checkout the decky-loader code repo
# and add the `decky-loader/plugin/imports` path to `python.analysis.extraPaths` in `.vscode/settings.json`
import decky
import asyncio

class Plugin:
    async def install_lsfg_vk(self) -> dict:
        """Install lsfg-vk by extracting the tar.gz file to ~/.local"""
        try:
            # Get the path to the lsfg-vk-latest.tar.gz file in the bin directory
            plugin_dir = os.path.dirname(os.path.realpath(__file__))
            tar_path = os.path.join(plugin_dir, "bin", "lsfg-vk-latest.tar.gz")
            
            # Check if the tar.gz file exists
            if not os.path.exists(tar_path):
                decky.logger.error(f"lsfg-vk-latest.tar.gz not found at {tar_path}")
                return {"success": False, "error": "lsfg-vk-latest.tar.gz file not found"}
            
            # Get the user's home directory
            user_home = os.path.expanduser("~")
            local_lib_dir = os.path.join(user_home, ".local", "lib")
            local_share_dir = os.path.join(user_home, ".local", "share", "vulkan", "implicit_layer.d")
            
            # Create directories if they don't exist
            os.makedirs(local_lib_dir, exist_ok=True)
            os.makedirs(local_share_dir, exist_ok=True)
            
            # Extract the tar.gz file
            with tarfile.open(tar_path, 'r:gz') as tar_ref:
                # Use /tmp for temporary extraction since we may not have write permissions in plugin dir
                with tempfile.TemporaryDirectory() as temp_dir:
                    tar_ref.extractall(temp_dir)
                    
                    # Look for the extracted files and copy them to the correct locations
                    for root, dirs, files in os.walk(temp_dir):
                        for file in files:
                            src_file = os.path.join(root, file)
                            if file.endswith('.so'):
                                # Copy library files to ~/.local/lib
                                dst_file = os.path.join(local_lib_dir, file)
                                shutil.copy2(src_file, dst_file)
                                decky.logger.info(f"Copied {file} to {dst_file}")
                            elif file.endswith('.json'):
                                # Copy JSON files to ~/.local/share/vulkan/implicit_layer.d
                                dst_file = os.path.join(local_share_dir, file)
                                shutil.copy2(src_file, dst_file)
                                decky.logger.info(f"Copied {file} to {dst_file}")
                    
                    # temp_dir will be automatically cleaned up
            
            decky.logger.info("lsfg-vk installed successfully")
            return {"success": True, "message": "lsfg-vk installed successfully"}
            
        except Exception as e:
            decky.logger.error(f"Error installing lsfg-vk: {str(e)}")
            return {"success": False, "error": str(e)}

    async def check_lsfg_vk_installed(self) -> dict:
        """Check if lsfg-vk is already installed"""
        try:
            user_home = os.path.expanduser("~")
            lib_file = os.path.join(user_home, ".local", "lib", "liblsfg-vk.so")
            json_file = os.path.join(user_home, ".local", "share", "vulkan", "implicit_layer.d", "VkLayer_LS_frame_generation.json")
            
            lib_exists = os.path.exists(lib_file)
            json_exists = os.path.exists(json_file)
            
            return {
                "installed": lib_exists and json_exists,
                "lib_exists": lib_exists,
                "json_exists": json_exists,
                "lib_path": lib_file,
                "json_path": json_file
            }
            
        except Exception as e:
            decky.logger.error(f"Error checking lsfg-vk installation: {str(e)}")
            return {"installed": False, "error": str(e)}

    async def uninstall_lsfg_vk(self) -> dict:
        """Uninstall lsfg-vk by removing the installed files"""
        try:
            user_home = os.path.expanduser("~")
            lib_file = os.path.join(user_home, ".local", "lib", "liblsfg-vk.so")
            json_file = os.path.join(user_home, ".local", "share", "vulkan", "implicit_layer.d", "VkLayer_LS_frame_generation.json")
            
            removed_files = []
            
            # Remove library file if it exists
            if os.path.exists(lib_file):
                os.remove(lib_file)
                removed_files.append(lib_file)
                decky.logger.info(f"Removed {lib_file}")
            
            # Remove JSON file if it exists
            if os.path.exists(json_file):
                os.remove(json_file)
                removed_files.append(json_file)
                decky.logger.info(f"Removed {json_file}")
            
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

    async def check_lossless_scaling_dll(self) -> dict:
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

    # Asyncio-compatible long-running code, executed in a task when the plugin is loaded
    async def _main(self):
        decky.logger.info("lsfg-vk Installer loaded!")

    # Function called first during the unload process, utilize this to handle your plugin being stopped, but not
    # completely removed
    async def _unload(self):
        decky.logger.info("lsfg-vk Installer unloading")
        pass

    # Function called after `_unload` during uninstall, utilize this to clean up processes and other remnants of your
    # plugin that may remain on the system
    async def _uninstall(self):
        decky.logger.info("lsfg-vk Installer uninstalled")
        pass

    # Migrations that should be performed before entering `_main()`.
    async def _migration(self):
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
