from pathlib import Path

from .runtime import Runtime


class RuntimeValidation:

    @staticmethod
    def validate(runtime: Runtime,
                 lib: Path,
                 manifest: Path):

        if not lib.exists():
            raise RuntimeError(
                f"Missing runtime library:\n{lib}"
            )

        if not manifest.exists():
            raise RuntimeError(
                f"Missing Vulkan manifest:\n{manifest}"
            )
