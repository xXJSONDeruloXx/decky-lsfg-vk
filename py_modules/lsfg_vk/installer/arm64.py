from pathlib import Path

class ARM64Installer:
    def __init__(self, service):
        self.service = service

    def install(self, archive: Path):
        return self.service._install_arm64_runtime(archive)
