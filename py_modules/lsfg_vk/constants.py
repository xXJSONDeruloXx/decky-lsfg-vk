"""Constants for the lsfg-vk Decky plugin."""

from pathlib import Path

LOCAL_LIB = ".local/lib"
VULKAN_LAYER_DIR = ".local/share/vulkan/implicit_layer.d"
CONFIG_DIR = ".config/lsfg-vk"

SCRIPT_NAME = "lsfg"
CONFIG_FILENAME = "conf.toml"
LIB_FILENAME = "liblsfg-vk-layer.so"
JSON_FILENAME = "VkLayer_LSFGVK_frame_generation.json"
LAYER_ARCHIVE_X86_64 = "lsfg-vk-layer-x86_64.tar.xz"
LAYER_ARCHIVE_AARCH64 = "lsfg-vk-layer-aarch64.tar.xz"
CLI_FILENAME = "lsfg-vk-cli"

LEGACY_LIB_FILENAME = "liblsfg-vk.so"
LEGACY_JSON_FILENAME = "VkLayer_LS_frame_generation.json"

FLATPAK_23_08_FILENAME = "org.freedesktop.Platform.VulkanLayer.lsfg_vk_23.08.flatpak"
FLATPAK_24_08_FILENAME = "org.freedesktop.Platform.VulkanLayer.lsfg_vk_24.08.flatpak"
FLATPAK_25_08_FILENAME = "org.freedesktop.Platform.VulkanLayer.lsfg_vk_25.08.flatpak"

BIN_DIR = "bin"

ARMADA_DEVICE_ENV = Path("/usr/libexec/armada/device-env")
ARMADA_GAME_LAUNCH = Path("/usr/libexec/armada/armada-game-launch")

STEAM_COMMON_PATH = Path("steamapps/common/Lossless Scaling")
LOSSLESS_DLL_NAME = "Lossless.dll"

ENV_LSFG_DLL_PATH = "LSFG_DLL_PATH"
ENV_XDG_DATA_HOME = "XDG_DATA_HOME"
ENV_HOME = "HOME"


def get_layer_archive_filename(is_arm: bool) -> str:
    """Return the v2 layer archive appropriate for the native game host."""
    return LAYER_ARCHIVE_AARCH64 if is_arm else LAYER_ARCHIVE_X86_64
