from pathlib import Path
import json
import shutil


class OverlayManager:

    def __init__(self, service):
        self.service = service

        home = Path.home()

        self.upper = home / ".local/share/lsfg-vk/overlay"
        self.lower = Path("/usr/lib")
        self.work = home / ".local/share/lsfg-vk/work"

        self.override = (
            self.upper
            / "pressure-vessel"
            / "overrides"
            / "share"
            / "vulkan"
            / "implicit_layer.d"
        )

    def install(self):

        self.override.mkdir(parents=True, exist_ok=True)

        self.service.log.info(
            f"Created overlay directory {self.override}"
        )

    def uninstall(self):

        shutil.rmtree(self.upper, ignore_errors=True)
        shutil.rmtree(self.work, ignore_errors=True)
