"""
Centralized configuration schema for lsfg-vk.

This module defines the complete configuration structure for TOML-based config files, including:
- Field definitions with types, defaults, and metadata
- TOML generation logic
- Validation rules
- Type definitions
"""

import re
from typing import TypedDict, Dict, Any, Union, cast
from dataclasses import dataclass
from enum import Enum
from pathlib import Path


class ConfigFieldType(Enum):
    """Supported configuration field types"""
    BOOLEAN = "boolean"
    INTEGER = "integer"
    FLOAT = "float"
    STRING = "string"


@dataclass
class ConfigField:
    """Configuration field definition"""
    name: str
    field_type: ConfigFieldType
    default: Union[bool, int, float, str]
    description: str
    
    def get_toml_value(self, value: Union[bool, int, float, str]) -> Union[bool, int, float, str]:
        """Get the value for TOML output"""
        return value


# Configuration schema definition
CONFIG_SCHEMA: Dict[str, ConfigField] = {
    "enable": ConfigField(
        name="enable",
        field_type=ConfigFieldType.BOOLEAN,
        default=True,
        description="enable/disable lsfg on every game"
    ),
    
    "dll": ConfigField(
        name="dll",
        field_type=ConfigFieldType.STRING,
        default="",  # Will be populated dynamically based on detection
        description="specify where Lossless.dll is stored"
    ),
    
    "multiplier": ConfigField(
        name="multiplier",
        field_type=ConfigFieldType.INTEGER,
        default=2,
        description="change the fps multiplier"
    ),
    
    "flow_scale": ConfigField(
        name="flow_scale",
        field_type=ConfigFieldType.FLOAT,
        default=0.8,
        description="change the flow scale"
    ),
    
    "performance_mode": ConfigField(
        name="performance_mode",
        field_type=ConfigFieldType.BOOLEAN,
        default=True,
        description="toggle performance mode"
    ),
    
    "hdr_mode": ConfigField(
        name="hdr_mode",
        field_type=ConfigFieldType.BOOLEAN,
        default=False,
        description="enable hdr mode"
    ),
    
    "experimental_present_mode": ConfigField(
        name="experimental_present_mode",
        field_type=ConfigFieldType.STRING,
        default="",
        description="experimental: override vulkan present mode (empty/fifo/vsync/mailbox/immediate)"
    ),
    
    "experimental_fps_limit": ConfigField(
        name="experimental_fps_limit",
        field_type=ConfigFieldType.INTEGER,
        default=0,
        description="experimental: base framerate cap for dxvk games, before frame multiplier (0 = disabled)"
    )
}


class ConfigurationData(TypedDict):
    """Type-safe configuration data structure"""
    enable: bool
    dll: str
    multiplier: int
    flow_scale: float
    performance_mode: bool
    hdr_mode: bool
    experimental_present_mode: str
    experimental_fps_limit: int


class ConfigurationManager:
    """Centralized configuration management"""
    
    @staticmethod
    def get_defaults() -> ConfigurationData:
        """Get default configuration values"""
        return cast(ConfigurationData, {
            field.name: field.default 
            for field in CONFIG_SCHEMA.values()
        })
    
    @staticmethod
    def get_defaults_with_dll_detection(dll_detection_service=None) -> ConfigurationData:
        """Get default configuration values with DLL path detection
        
        Args:
            dll_detection_service: Optional DLL detection service instance
            
        Returns:
            ConfigurationData with detected DLL path if available
        """
        defaults = ConfigurationManager.get_defaults()
        
        # Try to detect DLL path if service provided
        if dll_detection_service:
            try:
                dll_result = dll_detection_service.check_lossless_scaling_dll()
                if dll_result.get("detected") and dll_result.get("path"):
                    defaults["dll"] = dll_result["path"]
            except Exception:
                # If detection fails, keep empty default
                pass
        
        # If DLL path is still empty, use a reasonable fallback
        if not defaults["dll"]:
            defaults["dll"] = "/home/deck/.local/share/Steam/steamapps/common/Lossless Scaling/Lossless.dll"
        
        return defaults
    
    @staticmethod
    def get_field_names() -> list[str]:
        """Get ordered list of configuration field names"""
        return list(CONFIG_SCHEMA.keys())
    
    @staticmethod
    def get_field_types() -> Dict[str, ConfigFieldType]:
        """Get field type mapping"""
        return {
            field.name: field.field_type 
            for field in CONFIG_SCHEMA.values()
        }
    
    @staticmethod
    def validate_config(config: Dict[str, Any]) -> ConfigurationData:
        """Validate and convert configuration data"""
        validated = {}
        
        for field_name, field_def in CONFIG_SCHEMA.items():
            value = config.get(field_name, field_def.default)
            
            # Type validation and conversion
            if field_def.field_type == ConfigFieldType.BOOLEAN:
                validated[field_name] = bool(value)
            elif field_def.field_type == ConfigFieldType.INTEGER:
                validated[field_name] = int(value)
            elif field_def.field_type == ConfigFieldType.FLOAT:
                validated[field_name] = float(value)
            elif field_def.field_type == ConfigFieldType.STRING:
                validated[field_name] = str(value)
            else:
                validated[field_name] = value
        
        return cast(ConfigurationData, validated)
    
    @staticmethod
    def generate_toml_content(config: ConfigurationData) -> str:
        """Generate TOML configuration file content using the new game-specific format"""
        lines = ["version = 1"]
        lines.append("")
        
        # Add global section with DLL path only (if specified)
        if config.get("dll"):
            lines.append("[global]")
            lines.append(f"# specify where Lossless.dll is stored")
            lines.append(f'dll = "{config["dll"]}"')
            lines.append("")
        
        # Add game section with process name for LSFG_PROCESS approach
        lines.append("[[game]]")
        lines.append("# Plugin-managed game entry (uses LSFG_PROCESS=decky-lsfg-vk)")
        lines.append('exe = "decky-lsfg-vk"')
        lines.append("")
        
        # Add all configuration fields to the game section
        for field_name, field_def in CONFIG_SCHEMA.items():
            # Skip dll and enable fields - dll goes in global, enable is handled via multiplier
            if field_name in ["dll", "enable"]:
                continue
                
            value = config[field_name]
            
            # Handle enable field by setting multiplier to 1 when disabled
            if field_name == "multiplier" and not config.get("enable", True):
                value = 1
                lines.append(f"# LSFG disabled via plugin - multiplier set to 1")
            else:
                lines.append(f"# {field_def.description}")
            
            # Format value based on type
            if isinstance(value, bool):
                lines.append(f"{field_name} = {str(value).lower()}")
            elif isinstance(value, str) and value:  # Only add non-empty strings
                lines.append(f'{field_name} = "{value}"')
            elif isinstance(value, (int, float)) and value != 0:  # Only add non-zero numbers
                lines.append(f"{field_name} = {value}")
            
            lines.append("")  # Empty line for readability
        
        return "\n".join(lines)
    
    @staticmethod
    def parse_toml_content(content: str) -> ConfigurationData:
        """Parse TOML content into configuration data using simple regex parsing"""
        config = ConfigurationManager.get_defaults()
        
        try:
            # Look for both [global] and [[game]] sections
            lines = content.split('\n')
            in_global_section = False
            in_game_section = False
            current_game_exe = None
            
            for line in lines:
                line = line.strip()
                
                # Skip comments and empty lines
                if not line or line.startswith('#'):
                    continue
                
                # Check for section headers
                if line.startswith('[') and line.endswith(']'):
                    if line == '[global]':
                        in_global_section = True
                        in_game_section = False
                    elif line == '[[game]]':
                        in_global_section = False
                        in_game_section = True
                        current_game_exe = None
                    else:
                        in_global_section = False
                        in_game_section = False
                    continue
                
                # Parse key = value lines
                if '=' in line:
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip()
                    
                    # Remove quotes from string values
                    if value.startswith('"') and value.endswith('"'):
                        value = value[1:-1]
                    elif value.startswith("'") and value.endswith("'"):
                        value = value[1:-1]
                    
                    # Handle global section (dll only)
                    if in_global_section and key == "dll":
                        config["dll"] = value
                    
                    # Handle game section
                    elif in_game_section:
                        # Track the exe for this game section
                        if key == "exe":
                            current_game_exe = value
                        # Only parse config for our plugin-managed game entry
                        elif current_game_exe == "decky-lsfg-vk" and key in CONFIG_SCHEMA:
                            field_def = CONFIG_SCHEMA[key]
                            try:
                                if field_def.field_type == ConfigFieldType.BOOLEAN:
                                    config[key] = value.lower() in ('true', '1', 'yes', 'on')
                                elif field_def.field_type == ConfigFieldType.INTEGER:
                                    parsed_value = int(value)
                                    # Handle enable field via multiplier
                                    if key == "multiplier":
                                        config[key] = parsed_value
                                        config["enable"] = parsed_value != 1
                                    else:
                                        config[key] = parsed_value
                                elif field_def.field_type == ConfigFieldType.FLOAT:
                                    config[key] = float(value)
                                elif field_def.field_type == ConfigFieldType.STRING:
                                    config[key] = value
                            except (ValueError, TypeError):
                                # If conversion fails, keep default value
                                pass
            
            return config
            
        except Exception:
            # If parsing fails completely, return defaults
            return ConfigurationManager.get_defaults()
    
    @staticmethod
    def create_config_from_args(enable: bool, dll: str, multiplier: int, flow_scale: float, 
                               performance_mode: bool, hdr_mode: bool, 
                               experimental_present_mode: str = "", 
                               experimental_fps_limit: int = 0) -> ConfigurationData:
        """Create configuration from individual arguments"""
        return cast(ConfigurationData, {
            "enable": enable,
            "dll": dll,
            "multiplier": multiplier,
            "flow_scale": flow_scale,
            "performance_mode": performance_mode,
            "hdr_mode": hdr_mode,
            "experimental_present_mode": experimental_present_mode,
            "experimental_fps_limit": experimental_fps_limit
        })
