from pathlib import Path

class X86Installer:
    def __init__(self, service):
        self.service = service

    def install(self, archive: Path):
        return self.service._install_x86_runtime(archive)
