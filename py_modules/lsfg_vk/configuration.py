"""
Configuration service for TOML-based lsfg configuration management.
"""

from pathlib import Path
from typing import Dict, Any

from .base_service import BaseService
from .config_schema import ConfigurationManager, ConfigurationData, CONFIG_SCHEMA
from .types import ConfigurationResponse


class ConfigurationService(BaseService):
    """Service for managing TOML-based lsfg configuration"""
    
    def get_config(self) -> ConfigurationResponse:
        """Read current TOML configuration merged with launch script environment variables
        
        Returns:
            ConfigurationResponse with current configuration or error
        """
        try:
            # Get TOML configuration (with defaults if file doesn't exist)
            if not self.config_file_path.exists():
                # Return default configuration with DLL detection if file doesn't exist
                from .dll_detection import DllDetectionService
                dll_service = DllDetectionService(self.log)
                toml_config = ConfigurationManager.get_defaults_with_dll_detection(dll_service)
            else:
                content = self.config_file_path.read_text(encoding='utf-8')
                toml_config = ConfigurationManager.parse_toml_content(content)
            
            # Get script environment variables (if script exists)
            script_values = {}
            if self.lsfg_script_path.exists():
                try:
                    script_content = self.lsfg_script_path.read_text(encoding='utf-8')
                    script_values = ConfigurationManager.parse_script_content(script_content)
                    self.log.info(f"Parsed script values: {script_values}")
                except Exception as e:
                    self.log.warning(f"Failed to parse launch script: {str(e)}")
            
            # Merge TOML config with script values
            config = ConfigurationManager.merge_config_with_script(toml_config, script_values)
            
            return self._success_response(ConfigurationResponse, config=config)
            
        except (OSError, IOError) as e:
            error_msg = f"Error reading lsfg config: {str(e)}"
            self.log.error(error_msg)
            return self._error_response(ConfigurationResponse, str(e), config=None)
        except Exception as e:
            error_msg = f"Error parsing config file: {str(e)}"
            self.log.error(error_msg)
            # Return defaults with DLL detection if parsing fails
            from .dll_detection import DllDetectionService
            dll_service = DllDetectionService(self.log)
            config = ConfigurationManager.get_defaults_with_dll_detection(dll_service)
            return self._success_response(ConfigurationResponse, 
                                        f"Using default configuration due to parse error: {str(e)}", 
                                        config=config)
    
    def update_config(self, dll: str, multiplier: int, flow_scale: float, 
                     performance_mode: bool, hdr_mode: bool, 
                     experimental_present_mode: str = "fifo", 
                     dxvk_frame_rate: int = 0,
                     enable_wow64: bool = False,
                     disable_steamdeck_mode: bool = False,
                     mangohud_workaround: bool = False,
                     disable_vkbasalt: bool = False) -> ConfigurationResponse:
        """Update TOML configuration
        
        Args:
            dll: Path to Lossless.dll
            multiplier: LSFG multiplier value
            flow_scale: LSFG flow scale value
            performance_mode: Whether to enable performance mode
            hdr_mode: Whether to enable HDR mode
            experimental_present_mode: Experimental Vulkan present mode override
            dxvk_frame_rate: Frame rate cap for DirectX games, before frame multiplier (0 = disabled)
            enable_wow64: Whether to enable PROTON_USE_WOW64=1 for 32-bit games
            disable_steamdeck_mode: Whether to disable Steam Deck mode
            mangohud_workaround: Whether to enable MangoHud workaround with transparent overlay
            disable_vkbasalt: Whether to disable vkBasalt layer
            
        Returns:
            ConfigurationResponse with success status
        """
        try:
            # Create configuration from individual arguments
            config = ConfigurationManager.create_config_from_args(
                dll, multiplier, flow_scale, performance_mode, hdr_mode,
                experimental_present_mode, dxvk_frame_rate, enable_wow64, disable_steamdeck_mode,
                mangohud_workaround, disable_vkbasalt
            )
            
            # Generate TOML content using centralized manager
            toml_content = ConfigurationManager.generate_toml_content(config)
            
            # Ensure config directory exists
            self.config_dir.mkdir(parents=True, exist_ok=True)
            
            # Write the updated config directly to preserve inode for file watchers
            self._write_file(self.config_file_path, toml_content, 0o644)
            
            # Update the launch script with the new configuration
            script_result = self.update_lsfg_script(config)
            if not script_result["success"]:
                self.log.warning(f"Failed to update launch script: {script_result['error']}")
            
            self.log.info(f"Updated lsfg TOML configuration: "
                         f"dll='{dll}', multiplier={multiplier}, flow_scale={flow_scale}, "
                         f"performance_mode={performance_mode}, hdr_mode={hdr_mode}, "
                         f"experimental_present_mode='{experimental_present_mode}', "
                         f"dxvk_frame_rate={dxvk_frame_rate}, "
                         f"enable_wow64={enable_wow64}, disable_steamdeck_mode={disable_steamdeck_mode}, "
                         f"mangohud_workaround={mangohud_workaround}, disable_vkbasalt={disable_vkbasalt}")
            
            return self._success_response(ConfigurationResponse,
                                        "lsfg configuration updated successfully",
                                        config=config)
            
        except (OSError, IOError) as e:
            error_msg = f"Error updating lsfg config: {str(e)}"
            self.log.error(error_msg)
            return self._error_response(ConfigurationResponse, str(e), config=None)
        except ValueError as e:
            error_msg = f"Invalid configuration arguments: {str(e)}"
            self.log.error(error_msg)
            return self._error_response(ConfigurationResponse, str(e), config=None)
    
    def update_dll_path(self, dll_path: str) -> ConfigurationResponse:
        """Update just the DLL path in the configuration
        
        Args:
            dll_path: Path to the Lossless.dll file
            
        Returns:
            ConfigurationResponse with success status
        """
        try:
            # Get current merged config (TOML + script)
            current_response = self.get_config()
            if not current_response["success"] or current_response["config"] is None:
                # If we can't read current config, use defaults with DLL detection
                from .dll_detection import DllDetectionService
                dll_service = DllDetectionService(self.log)
                config = ConfigurationManager.get_defaults_with_dll_detection(dll_service)
            else:
                config = current_response["config"]
            
            # Update just the DLL path
            config["dll"] = dll_path
            
            # Generate TOML content and write it
            toml_content = ConfigurationManager.generate_toml_content(config)
            
            # Ensure config directory exists
            self.config_dir.mkdir(parents=True, exist_ok=True)
            
            # Write the updated config directly to preserve inode for file watchers
            self._write_file(self.config_file_path, toml_content, 0o644)
            
            self.log.info(f"Updated DLL path in lsfg configuration: '{dll_path}'")
            
            return self._success_response(ConfigurationResponse,
                                        f"DLL path updated to: {dll_path}",
                                        config=config)
            
        except Exception as e:
            error_msg = f"Error updating DLL path: {str(e)}"
            self.log.error(error_msg)
            return self._error_response(ConfigurationResponse, str(e), config=None)
    
    def update_lsfg_script(self, config: ConfigurationData) -> ConfigurationResponse:
        """Update the ~/lsfg launch script with current configuration
        
        Args:
            config: Configuration data to apply to the script
            
        Returns:
            ConfigurationResponse indicating success or failure
        """
        try:
            script_content = self._generate_script_content(config)
            
            # Write the script file
            self._write_file(self.lsfg_script_path, script_content, 0o755)
            
            self.log.info(f"Updated lsfg launch script at {self.lsfg_script_path}")
            
            return self._success_response(ConfigurationResponse,
                                        "Launch script updated successfully",
                                        config=config)
            
        except Exception as e:
            error_msg = f"Error updating launch script: {str(e)}"
            self.log.error(error_msg)
            return self._error_response(ConfigurationResponse, str(e), config=None)
    
    def _generate_script_content(self, config: ConfigurationData) -> str:
        """Generate the content for the ~/lsfg launch script
        
        Args:
            config: Configuration data to apply to the script
            
        Returns:
            The complete script content as a string
        """
        lines = [
            "#!/bin/bash",
            "# lsfg-vk launch script generated by decky-lossless-scaling-vk plugin",
            "# This script sets up the environment for lsfg-vk to work with the plugin configuration"
        ]
        
        # Add optional export statements based on configuration
        if config.get("enable_wow64", False):
            lines.append("export PROTON_USE_WOW64=1")
        
        if config.get("disable_steamdeck_mode", False):
            lines.append("export SteamDeck=0")
        
        if config.get("mangohud_workaround", False):
            lines.append("export MANGOHUD=1")
            lines.append("export MANGOHUD_CONFIG=alpha=0.01,background_alpha=0.01")
        
        if config.get("disable_vkbasalt", False):
            lines.append("export DISABLE_VKBASALT=1")
        
        # Add DXVK_FRAME_RATE if dxvk_frame_rate is set
        dxvk_frame_rate = config.get("dxvk_frame_rate", 0)
        if dxvk_frame_rate > 0:
            lines.append(f"export DXVK_FRAME_RATE={dxvk_frame_rate}")
        
        # Always add the LSFG_PROCESS export
        lines.append("export LSFG_PROCESS=decky-lsfg-vk")
        
        # Add the execution line
        lines.append('exec "$@"')
        
        return "\n".join(lines) + "\n"
