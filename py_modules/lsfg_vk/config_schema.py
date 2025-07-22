"""
Centralized configuration schema for lsfg-vk.

This module defines the complete configuration structure for lsfg-vk, managing TOML-based config files, including:
- Field definitions with types, defaults, and metadata
- TOML generation logic
- Validation rules
- Type definitions
"""

import re
import sys
from typing import TypedDict, Dict, Any, Union, cast
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

# Import shared configuration constants
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from shared_config import CONFIG_SCHEMA_DEF, ConfigFieldType, get_field_names, get_defaults, get_field_types


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


# Use shared configuration schema as source of truth
CONFIG_SCHEMA: Dict[str, ConfigField] = {
    field_name: ConfigField(
        name=field_def["name"],
        field_type=ConfigFieldType(field_def["fieldType"]),
        default=field_def["default"],
        description=field_def["description"]
    )
    for field_name, field_def in CONFIG_SCHEMA_DEF.items()
}

# Override DLL default to empty (will be populated dynamically)
CONFIG_SCHEMA["dll"] = ConfigField(
    name="dll",
    field_type=ConfigFieldType.STRING,
    default="",  # Will be populated dynamically based on detection
    description="specify where Lossless.dll is stored"
)

# Get script-only fields dynamically from shared config
SCRIPT_ONLY_FIELDS = {
    field_name: ConfigField(
        name=field_def["name"],
        field_type=ConfigFieldType(field_def["fieldType"]),
        default=field_def["default"],
        description=field_def["description"]
    )
    for field_name, field_def in CONFIG_SCHEMA_DEF.items()
    if field_def.get("location") == "script"
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
    mangohud_workaround: bool
    disable_vkbasalt: bool


class ConfigurationManager:
    """Centralized configuration management"""
    
    @staticmethod
    def get_defaults() -> ConfigurationData:
        """Get default configuration values"""
        # Use shared defaults and add script-only fields
        shared_defaults = get_defaults()
        
        # Add script-only fields that aren't in the shared schema
        script_defaults = {
            field.name: field.default 
            for field in SCRIPT_ONLY_FIELDS.values()
        }
        
        return cast(ConfigurationData, {**shared_defaults, **script_defaults})
    
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
        # Use shared field names and add script-only fields
        shared_names = get_field_names()
        script_names = list(SCRIPT_ONLY_FIELDS.keys())
        return shared_names + script_names
    
    @staticmethod
    def get_field_types() -> Dict[str, ConfigFieldType]:
        """Get field type mapping"""
        # Use shared field types and add script-only field types
        shared_types = {name: ConfigFieldType(type_str) for name, type_str in get_field_types().items()}
        script_types = {field.name: field.field_type for field in SCRIPT_ONLY_FIELDS.values()}
        return {**shared_types, **script_types}
    
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
    def parse_script_content(script_content: str) -> Dict[str, Union[bool, int, str]]:
        """Parse launch script content to extract environment variable values
        
        Args:
            script_content: Content of the launch script file
            
        Returns:
            Dict containing parsed script-only field values
        """
        script_values = {}
        
        try:
            lines = script_content.split('\n')
            
            for line in lines:
                line = line.strip()
                
                # Skip comments, empty lines, and non-export lines
                if not line or line.startswith('#') or not line.startswith('export '):
                    continue
                
                # Parse export statements: export VAR=value
                if '=' in line:
                    # Remove 'export ' prefix
                    export_line = line[len('export '):]
                    key, value = export_line.split('=', 1)
                    key = key.strip()
                    value = value.strip()
                    
                    # Map environment variables to config field names
                    if key == "DXVK_FRAME_RATE":
                        try:
                            script_values["dxvk_frame_rate"] = int(value)
                        except ValueError:
                            pass
                    elif key == "PROTON_USE_WOW64":
                        script_values["enable_wow64"] = value == "1"
                    elif key == "SteamDeck":
                        script_values["disable_steamdeck_mode"] = value == "0"
                    elif key == "MANGOHUD":
                        script_values["mangohud_workaround"] = value == "1"
                    elif key == "DISABLE_VKBASALT":
                        script_values["disable_vkbasalt"] = value == "1"
            
        except (ValueError, KeyError, IndexError) as e:
            # If parsing fails, log the error and return empty dict (will use defaults)
            print(f"Error parsing script content: {e}")
        
        return script_values
    
    @staticmethod
    def merge_config_with_script(toml_config: ConfigurationData, script_values: Dict[str, Union[bool, int, str]]) -> ConfigurationData:
        """Merge TOML configuration with script environment variable values
        
        Args:
            toml_config: Configuration loaded from TOML file
            script_values: Environment variable values parsed from script
            
        Returns:
            Complete configuration with script values overlaid on TOML config
        """
        merged_config = dict(toml_config)
        
        # Update script-only fields with values from script
        for field_name in SCRIPT_ONLY_FIELDS.keys():
            if field_name in script_values:
                merged_config[field_name] = script_values[field_name]
        
        return cast(ConfigurationData, merged_config)

    @staticmethod
    def create_config_from_args(dll: str, multiplier: int, flow_scale: float, 
                               performance_mode: bool, hdr_mode: bool, 
                               experimental_present_mode: str = "fifo", 
                               dxvk_frame_rate: int = 0,
                               enable_wow64: bool = False,
                               disable_steamdeck_mode: bool = False,
                               mangohud_workaround: bool = False,
                               disable_vkbasalt: bool = False) -> ConfigurationData:
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
            "disable_steamdeck_mode": disable_steamdeck_mode,
            "mangohud_workaround": mangohud_workaround,
            "disable_vkbasalt": disable_vkbasalt
        })
