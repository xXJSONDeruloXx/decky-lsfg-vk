from pathlib import Path

LOCAL_BIN = ".local/bin"
LOCAL_LIB = ".local/lib"
VULKAN_LAYER_DIR = ".local/share/vulkan/implicit_layer.d"
CONFIG_DIR = ".config/lsfg-vk"

SCRIPT_NAME = "lsfg"
CONFIG_FILENAME = "conf.toml"
ARCHIVE_FILENAME = "lsfg-vk-2.0.0.tar.xz"
LIB_FILENAME = "liblsfg-vk-layer.so"
LIB_X86_FILENAME = "liblsfg-vk-layer.x86.so"
JSON_FILENAME = "VkLayer_LSFGVK_frame_generation.json"
JSON_X86_FILENAME = "VkLayer_LSFGVK_frame_generation.x86.json"
CLI_FILENAME = "lsfg-vk-cli"

LEGACY_LIB_FILENAME = "liblsfg-vk.so"
LEGACY_JSON_FILENAME = "VkLayer_LS_frame_generation.json"

BIN_DIR = "bin"

STEAM_COMMON_PATH = Path("steamapps/common/Lossless Scaling")
LOSSLESS_DLL_NAME = "lsfg-vk.dll"

ENV_LSFG_DLL_PATH = "LSFGVK_DLL_PATH"
ENV_XDG_DATA_HOME = "XDG_DATA_HOME"
ENV_HOME = "HOME"
