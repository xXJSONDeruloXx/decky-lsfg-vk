"""
Centralized configuration schema for lsfg-vk.

This module defines the complete configuration structure for lsfg-vk, managing TOML-based config files, including:
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
    "dll": ConfigField(
        name="dll",
        field_type=ConfigFieldType.STRING,
        default="",  # Will be populated dynamically based on detection
        description="specify where Lossless.dll is stored"
    ),
    
    "multiplier": ConfigField(
        name="multiplier",
        field_type=ConfigFieldType.INTEGER,
        default=1,
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
        default="fifo",
        description="experimental: override vulkan present mode (fifo/mailbox/immediate)"
    ),
}

# Fields that should ONLY be in the lsfg script, not in TOML config
SCRIPT_ONLY_FIELDS = {
    "dxvk_frame_rate": ConfigField(
        name="dxvk_frame_rate",
        field_type=ConfigFieldType.INTEGER,
        default=0,
        description="base framerate cap for DirectX games, before frame multiplier (0 = disabled, requires game re-launch)"
    ),
    
    "enable_wow64": ConfigField(
        name="enable_wow64",
        field_type=ConfigFieldType.BOOLEAN,
        default=False,
        description="enable PROTON_USE_WOW64=1 for 32-bit games (use with ProtonGE to fix crashing)"
    ),
    
    "disable_steamdeck_mode": ConfigField(
        name="disable_steamdeck_mode",
        field_type=ConfigFieldType.BOOLEAN,
        default=False,
        description="disable Steam Deck mode (unlocks hidden settings in some games)"
    )
}

# Complete configuration schema (TOML + script-only fields)
COMPLETE_CONFIG_SCHEMA = {**CONFIG_SCHEMA, **SCRIPT_ONLY_FIELDS}


class ConfigurationData(TypedDict):
    """Type-safe configuration data structure"""
    dll: str
    multiplier: int
    flow_scale: float
    performance_mode: bool
    hdr_mode: bool
    experimental_present_mode: str
    dxvk_frame_rate: int
    enable_wow64: bool
    disable_steamdeck_mode: bool


class ConfigurationManager:
    """Centralized configuration management"""
    
    @staticmethod
    def get_defaults() -> ConfigurationData:
        """Get default configuration values"""
        return cast(ConfigurationData, {
            field.name: field.default 
            for field in COMPLETE_CONFIG_SCHEMA.values()
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
        return list(COMPLETE_CONFIG_SCHEMA.keys())
    
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
        
        for field_name, field_def in COMPLETE_CONFIG_SCHEMA.items():
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
            # Skip dll field - dll goes in global section
            if field_name == "dll":
                continue
                
            value = config[field_name]
            
            # Add field description comment
            lines.append(f"# {field_def.description}")
            
            # Format value based on type
            if isinstance(value, bool):
                lines.append(f"{field_name} = {str(value).lower()}")
            elif isinstance(value, str) and value:  # Only add non-empty strings
                lines.append(f'{field_name} = "{value}"')
            elif isinstance(value, (int, float)):  # Always include numbers, even if 0 or 1
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
    def create_config_from_args(dll: str, multiplier: int, flow_scale: float, 
                               performance_mode: bool, hdr_mode: bool, 
                               experimental_present_mode: str = "fifo", 
                               dxvk_frame_rate: int = 0,
                               enable_wow64: bool = False,
                               disable_steamdeck_mode: bool = False) -> ConfigurationData:
        """Create configuration from individual arguments"""
        return cast(ConfigurationData, {
            "dll": dll,
            "multiplier": multiplier,
            "flow_scale": flow_scale,
            "performance_mode": performance_mode,
            "hdr_mode": hdr_mode,
            "experimental_present_mode": experimental_present_mode,
            "dxvk_frame_rate": dxvk_frame_rate,
            "enable_wow64": enable_wow64,
            "disable_steamdeck_mode": disable_steamdeck_mode
        })
