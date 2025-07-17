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
        """Read current TOML configuration
        
        Returns:
            ConfigurationResponse with current configuration or error
        """
        try:
            if not self.config_file_path.exists():
                # Return default configuration if file doesn't exist
                config = ConfigurationManager.get_defaults()
                return {
                    "success": True,
                    "config": config,
                    "message": "Using default configuration (config file not found)",
                    "error": None
                }
            
            content = self.config_file_path.read_text(encoding='utf-8')
            config = ConfigurationManager.parse_toml_content(content)
            
            return {
                "success": True,
                "config": config,
                "message": None,
                "error": None
            }
            
        except (OSError, IOError) as e:
            error_msg = f"Error reading lsfg config: {str(e)}"
            self.log.error(error_msg)
            return {
                "success": False,
                "config": None,
                "message": None,
                "error": str(e)
            }
        except Exception as e:
            error_msg = f"Error parsing config file: {str(e)}"
            self.log.error(error_msg)
            # Return defaults if parsing fails
            config = ConfigurationManager.get_defaults()
            return {
                "success": True,
                "config": config,
                "message": f"Using default configuration due to parse error: {str(e)}",
                "error": None
            }
    
    def update_config(self, enable: bool, dll: str, multiplier: int, flow_scale: float, 
                     performance_mode: bool, hdr_mode: bool) -> ConfigurationResponse:
        """Update TOML configuration
        
        Args:
            enable: Whether to enable LSFG
            dll: Path to Lossless.dll
            multiplier: LSFG multiplier value
            flow_scale: LSFG flow scale value
            performance_mode: Whether to enable performance mode
            hdr_mode: Whether to enable HDR mode
            
        Returns:
            ConfigurationResponse with success status
        """
        try:
            # Create configuration from individual arguments
            config = ConfigurationManager.create_config_from_args(
                enable, dll, multiplier, flow_scale, performance_mode, hdr_mode
            )
            
            # Generate TOML content using centralized manager
            toml_content = ConfigurationManager.generate_toml_content(config)
            
            # Ensure config directory exists
            self.config_dir.mkdir(parents=True, exist_ok=True)
            
            # Write the updated config atomically
            self._atomic_write(self.config_file_path, toml_content, 0o644)
            
            self.log.info(f"Updated lsfg TOML configuration: enable={enable}, "
                         f"dll='{dll}', multiplier={multiplier}, flow_scale={flow_scale}, "
                         f"performance_mode={performance_mode}, hdr_mode={hdr_mode}")
            
            return {
                "success": True,
                "config": config,
                "message": "lsfg configuration updated successfully",
                "error": None
            }
            
        except (OSError, IOError) as e:
            error_msg = f"Error updating lsfg config: {str(e)}"
            self.log.error(error_msg)
            return {
                "success": False,
                "config": None,
                "message": None,
                "error": str(e)
            }
        except ValueError as e:
            error_msg = f"Invalid configuration arguments: {str(e)}"
            self.log.error(error_msg)
            return {
                "success": False,
                "config": None,
                "message": None,
                "error": str(e)
            }
    
    def update_dll_path(self, dll_path: str) -> ConfigurationResponse:
        """Update just the DLL path in the configuration
        
        Args:
            dll_path: Path to the Lossless.dll file
            
        Returns:
            ConfigurationResponse with success status
        """
        try:
            # Get current config
            current_response = self.get_config()
            if not current_response["success"] or current_response["config"] is None:
                # If we can't read current config, use defaults
                config = ConfigurationManager.get_defaults()
            else:
                config = current_response["config"]
            
            # Update just the DLL path
            config["dll"] = dll_path
            
            # Generate TOML content and write it
            toml_content = ConfigurationManager.generate_toml_content(config)
            
            # Ensure config directory exists
            self.config_dir.mkdir(parents=True, exist_ok=True)
            
            # Write the updated config atomically
            self._atomic_write(self.config_file_path, toml_content, 0o644)
            
            self.log.info(f"Updated DLL path in lsfg configuration: '{dll_path}'")
            
            return {
                "success": True,
                "config": config,
                "message": f"DLL path updated to: {dll_path}",
                "error": None
            }
            
        except Exception as e:
            error_msg = f"Error updating DLL path: {str(e)}"
            self.log.error(error_msg)
            return {
                "success": False,
                "config": None,
                "message": None,
                "error": str(e)
            }
