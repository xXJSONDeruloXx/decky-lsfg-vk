"""
Configuration service for TOML-based lsfg configuration management.
"""

from pathlib import Path
from typing import Dict, Any

from .base_service import BaseService
from .config_schema import ConfigurationManager, CONFIG_SCHEMA
from .config_schema_generated import ConfigurationData, get_script_generation_logic
from .configuration_helpers_generated import log_configuration_update
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
    
    def update_config_from_dict(self, config: ConfigurationData) -> ConfigurationResponse:
        """Update TOML configuration from configuration dictionary (eliminates parameter duplication)
        
        Args:
            config: Complete configuration data dictionary
            
        Returns:
            ConfigurationResponse with success status
        """
        try:
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
            
            # Log with dynamic field listing
            field_values = ", ".join(f"{k}={repr(v)}" for k, v in config.items())
            self.log.info(f"Updated lsfg configuration: {field_values}")
            
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
    
    def update_config(self, **kwargs) -> ConfigurationResponse:
        """Update TOML configuration using generated schema - SIMPLIFIED WITH GENERATED CODE
        
        Args:
            **kwargs: Configuration field values (see shared_config.py for available fields)
            
        Returns:
            ConfigurationResponse with success status
        """
        try:
            # Create configuration from keyword arguments using generated function
            config = ConfigurationManager.create_config_from_args(**kwargs)
            
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
            
            # Use auto-generated logging
            log_configuration_update(self.log, config)
            
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
            
            # Update just the DLL path - USE GENERATED CONSTANTS
            from .config_schema_generated import DLL
            config[DLL] = dll_path
            
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
        
        # Use auto-generated script generation logic
        generate_script_lines = get_script_generation_logic()
        lines.extend(generate_script_lines(config))
        
        # Always add the LSFG_PROCESS export and execution line
        lines.extend([
            "export LSFG_PROCESS=decky-lsfg-vk",
            'exec "$@"'
        ])
        
        return "\n".join(lines) + "\n"
