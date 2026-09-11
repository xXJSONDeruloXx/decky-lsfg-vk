import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import Mock


sys.modules.setdefault(
    "decky",
    types.SimpleNamespace(DECKY_USER_HOME="/home/deck", logger=Mock()),
)
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "py_modules"))

from lsfg_vk.base_service import BaseService
from lsfg_vk.installation import InstallationService


class InstallationCleanupTests(unittest.TestCase):
    def test_uninstall_removes_legacy_files_and_prunes_only_empty_directories(self):
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary) / "home" / "deck"
            service = InstallationService.__new__(InstallationService)
            BaseService.__init__(service)
            service.log = Mock()
            service.user_home = home
            service.local_bin_dir = home / ".local/bin"
            service.local_lib_dir = home / ".local/lib"
            service.local_share_dir = home / ".local/share/vulkan/implicit_layer.d"
            service.config_dir = home / ".config/lsfg-vk"
            service.config_file_path = service.config_dir / "conf.toml"
            service.legacy_script_path = home / "lsfg"
            service.lib_file = service.local_lib_dir / "liblsfg-vk-layer.so"
            service.lib_x86_file = service.local_lib_dir / "liblsfg-vk-layer.x86.so"
            service.json_file = service.local_share_dir / "VkLayer_LSFGVK_frame_generation.json"
            service.json_x86_file = service.local_share_dir / "VkLayer_LSFGVK_frame_generation.x86.json"
            service.cli_file = service.local_bin_dir / "lsfg-vk-cli"
            service.legacy_lib_file = service.local_lib_dir / "liblsfg-vk.so"
            service.legacy_json_file = service.local_share_dir / "VkLayer_LS_frame_generation.json"

            for path in (
                service.lib_file,
                service.config_file_path,
                service.legacy_script_path,
            ):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("owned", encoding="utf-8")
            unrelated = home / ".local/bin/keep-me"
            unrelated.parent.mkdir(parents=True, exist_ok=True)
            unrelated.write_text("user file", encoding="utf-8")

            result = service.uninstall()

            self.assertTrue(result["success"])
            self.assertFalse(service.lib_file.exists())
            self.assertFalse(service.config_file_path.exists())
            self.assertFalse(service.legacy_script_path.exists())
            self.assertTrue(unrelated.exists())
            self.assertTrue(service.local_bin_dir.exists())


if __name__ == "__main__":
    unittest.main()
