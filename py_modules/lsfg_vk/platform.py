from enum import Enum
from pathlib import Path
import platform


class Platform(Enum):
    STEAMDECK = "steamdeck"
    ARMADA = "armada"
    DESKTOP = "desktop"


class Architecture(Enum):
    X86_64 = "x86_64"
    ARM64 = "arm64"


def architecture() -> Architecture:
    m = platform.machine().lower()

    if m in ("aarch64", "arm64"):
        return Architecture.ARM64

    return Architecture.X86_64


def detect_platform() -> Platform:

    if architecture() == Architecture.ARM64:

        if Path("/usr/bin/fex").exists() or Path("/usr/bin/FEXInterpreter").exists():
            return Platform.ARMADA

    return Platform.DESKTOP
