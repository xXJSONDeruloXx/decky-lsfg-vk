from pathlib import Path


class OverlayManager:
    def __init__(self, service):
        self.service = service

    def install(self):
        """
        Install the Pressure Vessel overlay.

        Placeholder implementation.
        """
        self.service.log.info("Overlay installation not implemented yet.")

    def uninstall(self):
        """
        Remove the Pressure Vessel overlay.
        """
        self.service.log.info("Overlay removal not implemented yet.")
