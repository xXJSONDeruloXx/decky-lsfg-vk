"""
Constants for the lsfg-vk plugin.
"""

from pathlib import Path

# Directory paths
LOCAL_LIB = ".local/lib"
LOCAL_SHARE_BASE = ".local/share"
VULKAN_LAYER_DIR = ".local/share/vulkan/implicit_layer.d"

# File names
SCRIPT_NAME = "lsfg"
LIB_FILENAME = "liblsfg-vk.so"
JSON_FILENAME = "VkLayer_LS_frame_generation.json"
ZIP_FILENAME = "lsfg-vk_archlinux.zip"

# File extensions
SO_EXT = ".so"
JSON_EXT = ".json"

# Directory for the zip file
BIN_DIR = "bin"

# Lossless Scaling paths
STEAM_COMMON_PATH = Path("steamapps/common/Lossless Scaling")
LOSSLESS_DLL_NAME = "Lossless.dll"

# Script template
LSFG_SCRIPT_TEMPLATE = """#!/bin/bash

{enable_lsfg}
export DISABLE_VKBASALT=1
export LSFG_MULTIPLIER={multiplier}
export LSFG_FLOW_SCALE={flow_scale}
{hdr}
{perf_mode}
{immediate_mode}

# Execute the passed command with the environment variables set
exec "$@"
"""

# Environment variable names
ENV_LSFG_DLL_PATH = "LSFG_DLL_PATH"
ENV_XDG_DATA_HOME = "XDG_DATA_HOME"
ENV_HOME = "HOME"

# Default configuration values
DEFAULT_MULTIPLIER = 2
DEFAULT_FLOW_SCALE = 1.0
DEFAULT_ENABLE_LSFG = True
DEFAULT_HDR = False
DEFAULT_PERF_MODE = False
DEFAULT_IMMEDIATE_MODE = False
