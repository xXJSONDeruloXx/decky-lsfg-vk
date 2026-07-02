"""
Runtime definitions for lsfg-vk.

This module abstracts architecture-specific installation details so the
installer does not need to know whether it is installing the x86 or ARM64
runtime.
"""

from .runtime import current_runtime
from dataclasses import dataclass

from .platform import Architecture, architecture
from .paths import LIB_DIR


@dataclass(frozen=True)
class Runtime:
    name: str

    # bundled archive
    archive_name: str

    # installed library
    library_name: str

    # Vulkan manifest
    manifest_name: str

    # value written into library_path
    manifest_library_path: str


X86_RUNTIME = Runtime(
    name="x86_64",
    archive_name="lsfg-vk_noui.zip",
    library_name="liblsfg-vk.so",
    manifest_name="VkLayer_LS_frame_generation.json",
    manifest_library_path="../../../lib/liblsfg-vk.so",
)

ARM64_RUNTIME = Runtime(
    name="arm64",
    archive_name="lsfg-vk-arm64.tar.gz",
    library_name="liblsfg-vk-arm64.so",
    manifest_name="VkLayer_LSFGVK_frame_generation.json",
    manifest_library_path=str(LIB_DIR / "liblsfg-vk-arm64.so"),
)


def current_runtime() -> Runtime:
    """Return the runtime appropriate for this machine."""

    if architecture() == Architecture.ARM64:
        return ARM64_RUNTIME

    return X86_RUNTIME
