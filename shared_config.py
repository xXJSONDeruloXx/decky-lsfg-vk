"""
Shared configuration schema constants.

This file contains the canonical configuration schema that should be used
by both Python and TypeScript code. Any changes to the configuration
structure should be made here first.
"""

from typing import Dict, Any, Union
from enum import Enum


class ConfigFieldType(str, Enum):
    """Configuration field types - must match TypeScript enum"""
    BOOLEAN = "boolean"
    INTEGER = "integer"
    FLOAT = "float"
    STRING = "string"


# Canonical configuration schema - source of truth
CONFIG_SCHEMA_DEF = {
    "dll": {
        "name": "dll",
        "fieldType": ConfigFieldType.STRING,
        "default": "/games/Lossless Scaling/Lossless.dll",
        "description": "specify where Lossless.dll is stored",
        "location": "toml"  # where this field is stored/used
    },
    
    "multiplier": {
        "name": "multiplier",
        "fieldType": ConfigFieldType.INTEGER,
        "default": 1,
        "description": "change the fps multiplier",
        "location": "toml"
    },
    
    "flow_scale": {
        "name": "flow_scale",
        "fieldType": ConfigFieldType.FLOAT,
        "default": 0.8,
        "description": "change the flow scale",
        "location": "toml"
    },
    
    "performance_mode": {
        "name": "performance_mode",
        "fieldType": ConfigFieldType.BOOLEAN,
        "default": True,
        "description": "use a lighter model for FG (recommended for most games)",
        "location": "toml"
    },
    
    "hdr_mode": {
        "name": "hdr_mode",
        "fieldType": ConfigFieldType.BOOLEAN,
        "default": False,
        "description": "enable HDR mode (only for games that support HDR)",
        "location": "toml"
    },
    
    "experimental_present_mode": {
        "name": "experimental_present_mode",
        "fieldType": ConfigFieldType.STRING,
        "default": "fifo",
        "description": "override Vulkan present mode (may cause crashes)",
        "location": "toml"
    },
    
    "dxvk_frame_rate": {
        "name": "dxvk_frame_rate",
        "fieldType": ConfigFieldType.INTEGER,
        "default": 0,
        "description": "base framerate cap for DirectX games before frame multiplier",
        "location": "script"  # script-only field
    },
    
    "enable_wow64": {
        "name": "enable_wow64",
        "fieldType": ConfigFieldType.BOOLEAN,
        "default": False,
        "description": "enable PROTON_USE_WOW64=1 for 32-bit games (use with ProtonGE to fix crashing)",
        "location": "script"
    },
    
    "disable_steamdeck_mode": {
        "name": "disable_steamdeck_mode",
        "fieldType": ConfigFieldType.BOOLEAN,
        "default": False,
        "description": "disable Steam Deck mode (unlocks hidden settings in some games)",
        "location": "script"
    },
    
    "mangohud_workaround": {
        "name": "mangohud_workaround",
        "fieldType": ConfigFieldType.BOOLEAN,
        "default": False,
        "description": "Enables a transparent mangohud overlay, sometimes fixes issues with 2X multiplier in game mode",
        "location": "script"
    },
    
    "disable_vkbasalt": {
        "name": "disable_vkbasalt",
        "fieldType": ConfigFieldType.BOOLEAN,
        "default": False,
        "description": "Disables vkBasalt layer which can conflict with LSFG (Reshade, some Decky plugins)",
        "location": "script"
    },
    
    "force_enable_vkbasalt": {
        "name": "force_enable_vkbasalt",
        "fieldType": ConfigFieldType.BOOLEAN,
        "default": False,
        "description": "Force vkBasalt to engage to fix framepacing issues in gamemode",
        "location": "script"
    },
    
    "gamescope_frame_pacing": {
        "name": "gamescope_frame_pacing",
        "fieldType": ConfigFieldType.BOOLEAN,
        "default": False,
        "description": "Enable gamescope frame pacing workaround for timing issues",
        "location": "script"
    },
    
    "frame_pacing_target_ms": {
        "name": "frame_pacing_target_ms",
        "fieldType": ConfigFieldType.INTEGER,
        "default": 25,
        "description": "Target frame time in milliseconds for frame pacing (25ms = 40fps)",
        "location": "script"
    }
}


def get_field_names() -> list[str]:
    """Get ordered list of configuration field names"""
    return list(CONFIG_SCHEMA_DEF.keys())


def get_defaults() -> Dict[str, Union[bool, int, float, str]]:
    """Get default configuration values"""
    return {
        field_name: field_def["default"]
        for field_name, field_def in CONFIG_SCHEMA_DEF.items()
    }


def get_field_types() -> Dict[str, str]:
    """Get field type mapping"""
    return {
        field_name: field_def["fieldType"].value
        for field_name, field_def in CONFIG_SCHEMA_DEF.items()
    }
