"""
Centralized configuration schema for lsfg-vk.

This module defines the complete configuration structure, including:
- Field definitions with types, defaults, and metadata
- Script generation logic
- Validation rules
- Type definitions
"""

from typing import TypedDict, Dict, Any, Union, Callable, cast
from dataclasses import dataclass, field
from enum import Enum


class ConfigFieldType(Enum):
    """Supported configuration field types"""
    BOOLEAN = "boolean"
    INTEGER = "integer"
    FLOAT = "float"


@dataclass
class ConfigField:
    """Configuration field definition"""
    name: str
    field_type: ConfigFieldType
    default: Union[bool, int, float]
    description: str
    script_template: str  # Template for script generation
    script_comment: str = ""  # Comment to add when disabled
    
    def get_script_line(self, value: Union[bool, int, float]) -> str:
        """Generate script line for this field"""
        if self.field_type == ConfigFieldType.BOOLEAN:
            if value:
                return self.script_template.format(value=1)
            else:
                return f"# {self.script_template.format(value=1)}"
        else:
            return self.script_template.format(value=value)


# Configuration schema definition
CONFIG_SCHEMA: Dict[str, ConfigField] = {
    "enable_lsfg": ConfigField(
        name="enable_lsfg",
        field_type=ConfigFieldType.BOOLEAN,
        default=True,
        description="Enables the frame generation layer",
        script_template="export ENABLE_LSFG={value}",
        script_comment="# export ENABLE_LSFG=1"
    ),
    
    "multiplier": ConfigField(
        name="multiplier",
        field_type=ConfigFieldType.INTEGER,
        default=2,
        description="Traditional FPS multiplier value",
        script_template="export LSFG_MULTIPLIER={value}"
    ),
    
    "flow_scale": ConfigField(
        name="flow_scale",
        field_type=ConfigFieldType.FLOAT,
        default=0.8,
        description="Lowers the internal motion estimation resolution",
        script_template="export LSFG_FLOW_SCALE={value}"
    ),
    
    "hdr": ConfigField(
        name="hdr",
        field_type=ConfigFieldType.BOOLEAN,
        default=False,
        description="Enable HDR mode (only if Game supports HDR)",
        script_template="export LSFG_HDR={value}",
        script_comment="# export LSFG_HDR=1"
    ),
    
    "perf_mode": ConfigField(
        name="perf_mode",
        field_type=ConfigFieldType.BOOLEAN,
        default=True,
        description="Use lighter model for FG",
        script_template="export LSFG_PERF_MODE={value}",
        script_comment="# export LSFG_PERF_MODE=1"
    ),
    
    "immediate_mode": ConfigField(
        name="immediate_mode",
        field_type=ConfigFieldType.BOOLEAN,
        default=False,
        description="Reduce input lag (Experimental, will cause issues in many games)",
        script_template="export MESA_VK_WSI_PRESENT_MODE=immediate # - disable vsync",
        script_comment="# export MESA_VK_WSI_PRESENT_MODE=immediate # - disable vsync"
    ),
    
    "disable_vkbasalt": ConfigField(
        name="disable_vkbasalt",
        field_type=ConfigFieldType.BOOLEAN,
        default=True,
        description="Some plugins add vkbasalt layer, which can break lsfg. Toggling on fixes this",
        script_template="export DISABLE_VKBASALT={value}",
        script_comment="# export DISABLE_VKBASALT=1"
    ),
    
    "frame_cap": ConfigField(
        name="frame_cap",
        field_type=ConfigFieldType.INTEGER,
        default=0,
        description="Limit base game FPS (0 = disabled)",
        script_template="export DXVK_FRAME_RATE={value}",
        script_comment="# export DXVK_FRAME_RATE=60"
    )
}


class ConfigurationData(TypedDict):
    """Type-safe configuration data structure"""
    enable_lsfg: bool
    multiplier: int
    flow_scale: float
    hdr: bool
    perf_mode: bool
    immediate_mode: bool
    disable_vkbasalt: bool
    frame_cap: int


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
            else:
                validated[field_name] = value
        
        return cast(ConfigurationData, validated)
    
    @staticmethod
    def generate_script_content(config: ConfigurationData) -> str:
        """Generate lsfg script content from configuration"""
        script_lines = ["#!/bin/bash", ""]
        
        # Generate script lines for each field
        for field_name in CONFIG_SCHEMA.keys():
            field_def = CONFIG_SCHEMA[field_name]
            value = config[field_name]
            
            if field_def.field_type == ConfigFieldType.BOOLEAN:
                if value:
                    script_lines.append(field_def.script_template.format(value=1))
                else:
                    script_lines.append(field_def.script_comment)
            else:
                # For frame_cap, special handling for 0 value
                if field_name == "frame_cap" and value == 0:
                    script_lines.append(field_def.script_comment)
                else:
                    script_lines.append(field_def.script_template.format(value=value))
        
        # Add script footer
        script_lines.extend([
            "",
            "# Execute the passed command with the environment variables set",
            'exec "$@"'
        ])
        
        return "\n".join(script_lines)
    
    @staticmethod
    def get_update_signature() -> list[tuple[str, type]]:
        """Get the function signature for update_config method"""
        signature = []
        for field_name, field_def in CONFIG_SCHEMA.items():
            if field_def.field_type == ConfigFieldType.BOOLEAN:
                signature.append((field_name, bool))
            elif field_def.field_type == ConfigFieldType.INTEGER:
                signature.append((field_name, int))
            elif field_def.field_type == ConfigFieldType.FLOAT:
                signature.append((field_name, float))
        return signature
    
    @staticmethod
    def create_config_from_args(*args) -> ConfigurationData:
        """Create configuration from ordered arguments"""
        field_names = ConfigurationManager.get_field_names()
        if len(args) != len(field_names):
            raise ValueError(f"Expected {len(field_names)} arguments, got {len(args)}")
        
        return cast(ConfigurationData, {
            field_name: args[i] 
            for i, field_name in enumerate(field_names)
        })
