"""
Archive extraction helpers.
"""

from pathlib import Path
import tarfile
import zipfile


class ArchiveExtractor:

    @staticmethod
    def extract(archive: Path, destination: Path) -> None:
        """
        Extract a runtime archive into destination.

        Supports:
            *.zip
            *.tar.gz
            *.tgz
        """

        name = archive.name.lower()

        if name.endswith(".zip"):
            with zipfile.ZipFile(archive, "r") as zf:
                zf.extractall(destination)
            return

        if (
            name.endswith(".tar.gz")
            or name.endswith(".tgz")
        ):
            with tarfile.open(archive, "r:gz") as tf:
                tf.extractall(destination)
            return

        raise RuntimeError(
            f"Unsupported archive format: {archive}"
        )
