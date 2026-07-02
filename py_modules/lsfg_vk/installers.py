"""
Platform-specific installers.

InstallationService owns the generic installation flow.
Installer implementations perform platform-specific setup.
"""

from __future__ import annotations

import json
from pathlib import Path


class BaseInstaller:
    """
    Base installer.

    Platform installers override whichever hooks they need.
    """

    def __init__(self, service):
        self.service = service
        self.log = service.log

    def before_install(self) -> None:
        pass

    def after_extract(self) -> None:
        pass

    def after_config(self) -> None:
        pass

    def after_install(self) -> None:
        pass


class X86Installer(BaseInstaller):
    """
    Steam Deck / Desktop installer.

    Current x86 installation needs no extra work because the
    runtime itself contains everything required.
    """

    pass


class ARM64Installer(BaseInstaller):
    """
    Armada installer.

    This class owns every ARM64-specific step.

    As development continues this class will also:
      • install overlay mounts
      • install systemd units
      • generate ARM wrapper
      • install Pressure Vessel overrides
      • enable FEX Vulkan thunks
    """

    def after_extract(self) -> None:
        self.enable_fex_vulkan_thunks()

    def enable_fex_vulkan_thunks(self) -> None:
        """
        Enable Vulkan thunk support inside FEX.
        """

        config = Path.home() / ".config" / "fex-emu" / "Config.json"

        data = {}

        if config.exists():
            try:
                with open(config, "r") as f:
                    data = json.load(f)
            except Exception:
                data = {}

        data.setdefault("ThunksDB", {})
        data["ThunksDB"]["Vulkan"] = 1

        config.parent.mkdir(parents=True, exist_ok=True)

        with open(config, "w") as f:
            json.dump(data, f, indent=4)

        self.log.info("Enabled FEX Vulkan thunks")

    def after_config(self) -> None:
        """
        Reserved for future ARM64 configuration.

        Will eventually:
          • install overlay manifests
          • patch launcher
        """
        pass

    def after_install(self) -> None:
        """
        Reserved for future ARM64 installation tasks.

        Will eventually:
          • install overlay service
          • mount pressure-vessel overlay
          • verify native runtime
        """
        pass
