from pathlib import Path


class X86Installer:
    def __init__(self, service):
        self.service = service

    def before_install(self):
        pass

    def after_extract(self):
        pass

    def after_config(self):
        pass

    def after_install(self):
        pass
