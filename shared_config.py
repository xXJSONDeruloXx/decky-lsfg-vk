"""Canonical Decky configuration schema for lsfg-vk v2."""

from typing import Dict, Union
from enum import Enum


class ConfigFieldType(str, Enum):
    BOOLEAN = "boolean"
    INTEGER = "integer"
    FLOAT = "float"
    STRING = "string"


CONFIG_SCHEMA_DEF = {
    "dll": {
        "name": "dll",
        "fieldType": ConfigFieldType.STRING,
        "default": "",
        "description": "optional full path to Lossless.dll; leave blank for automatic discovery",
        "location": "global",
    },
    "allow_fp16": {
        "name": "allow_fp16",
        "fieldType": ConfigFieldType.BOOLEAN,
        "default": True,
        "description": "allow FP16 acceleration (disable on older NVIDIA GPUs)",
        "location": "global",
    },
    "multiplier": {
        "name": "multiplier",
        "fieldType": ConfigFieldType.INTEGER,
        "default": 2,
        "description": "frame generation multiplier",
        "location": "profile",
    },
    "flow_scale": {
        "name": "flow_scale",
        "fieldType": ConfigFieldType.FLOAT,
        "default": 0.9,
        "description": "motion-estimation resolution scale",
        "location": "profile",
    },
    "performance_mode": {
        "name": "performance_mode",
        "fieldType": ConfigFieldType.BOOLEAN,
        "default": False,
        "description": "use the lighter frame-generation model",
        "location": "profile",
    },
    "pacing": {
        "name": "pacing",
        "fieldType": ConfigFieldType.STRING,
        "default": "none",
        "description": "frame pacing mode (currently only none is supported)",
        "location": "profile",
    },
    "active_in": {
        "name": "active_in",
        "fieldType": ConfigFieldType.STRING,
        "default": "",
        "description": "optional executable or process names, separated by commas",
        "location": "profile",
    },
    "use_native_matching": {
        "name": "use_native_matching",
        "fieldType": ConfigFieldType.BOOLEAN,
        "default": False,
        "description": "let lsfg-vk choose a profile from Active In instead of forcing the selected profile",
        "location": "script",
    },
    "gpu": {
        "name": "gpu",
        "fieldType": ConfigFieldType.STRING,
        "default": "",
        "description": "optional GPU name, vendor:device ID, or PCI bus ID",
        "location": "profile",
    },
    "dxvk_frame_rate": {
        "name": "dxvk_frame_rate",
        "fieldType": ConfigFieldType.INTEGER,
        "default": 0,
        "description": "base framerate cap for DirectX games before frame multiplier",
        "location": "script",
    },
    "enable_wow64": {
        "name": "enable_wow64",
        "fieldType": ConfigFieldType.BOOLEAN,
        "default": False,
        "description": "enable PROTON_USE_WOW64=1 for 32-bit games",
        "location": "script",
    },
    "disable_steamdeck_mode": {
        "name": "disable_steamdeck_mode",
        "fieldType": ConfigFieldType.BOOLEAN,
        "default": False,
        "description": "disable Steam Deck mode",
        "location": "script",
    },
    "mangohud_workaround": {
        "name": "mangohud_workaround",
        "fieldType": ConfigFieldType.BOOLEAN,
        "default": False,
        "description": "enable a transparent MangoHud overlay workaround",
        "location": "script",
    },
    "disable_vkbasalt": {
        "name": "disable_vkbasalt",
        "fieldType": ConfigFieldType.BOOLEAN,
        "default": False,
        "description": "disable vkBasalt for games where it conflicts with lsfg-vk",
        "location": "script",
    },
    "force_enable_vkbasalt": {
        "name": "force_enable_vkbasalt",
        "fieldType": ConfigFieldType.BOOLEAN,
        "default": False,
        "description": "force-enable vkBasalt for games that require it",
        "location": "script",
    },
    "enable_wsi": {
        "name": "enable_wsi",
        "fieldType": ConfigFieldType.BOOLEAN,
        "default": False,
        "description": "enable the Gamescope WSI layer",
        "location": "script",
    },
    "enable_zink": {
        "name": "enable_zink",
        "fieldType": ConfigFieldType.BOOLEAN,
        "default": False,
        "description": "enable Zink for OpenGL games",
        "location": "script",
    },
}


def get_field_names() -> list[str]:
    return list(CONFIG_SCHEMA_DEF.keys())


def get_defaults() -> Dict[str, Union[bool, int, float, str]]:
    return {name: definition["default"] for name, definition in CONFIG_SCHEMA_DEF.items()}


def get_field_types() -> Dict[str, str]:
    return {name: definition["fieldType"].value for name, definition in CONFIG_SCHEMA_DEF.items()}
