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

# Environment variable names
ENV_LSFG_DLL_PATH = "LSFG_DLL_PATH"
ENV_XDG_DATA_HOME = "XDG_DATA_HOME"
ENV_HOME = "HOME"
