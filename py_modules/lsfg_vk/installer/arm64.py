from pathlib import Path
from .armada import ArmadaRuntime
from .overlay import OverlayManager


class ARM64Installer:
    def __init__(self, service):
        self.service = service

    def before_install(self):
        pass

    def after_extract(self):
        runtime = ArmadaRuntime(self)

        runtime.install_layer()

        OverlayManager(self.service).install()

    def after_config(self):
        pass

    def after_install(self):
        ArmadaRuntime(self.service).enable_fex_vulkan()
