from abc import ABC, abstractmethod
from pathlib import Path


class RuntimeInstaller(ABC):

    @abstractmethod
    def install_runtime(self, archive: Path):
        pass

class X86Installer(RuntimeInstaller):

    def __init__(self, service):
        self.service = service

    def install_runtime(self, archive: Path):
        self.service._extract_and_install_files(archive)

class ARM64Installer(RuntimeInstaller):

    def __init__(self, service):
        self.service = service

    def install_runtime(self, archive: Path):
        self.service._extract_and_install_files(archive)

        # ARM-specific work comes later
