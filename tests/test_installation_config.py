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

from lsfg_vk.config_schema import UnsupportedConfigurationVersion
from lsfg_vk.installation import InstallationService


class InstallationConfigTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.home = Path(self.tempdir.name) / "home" / "deck"
        self.home.mkdir(parents=True)
        self.steam = Mock()
        self.steam.find_lsfg_vk_dll.return_value = None
        self.service = InstallationService(
            logger=Mock(),
            runtime_service=Mock(),
            steam_service=self.steam,
        )
        self.service.user_home = self.home
        self.service.config_dir = self.home / ".config/lsfg-vk"
        self.service.config_file_path = self.service.config_dir / "conf.toml"

    def tearDown(self):
        self.tempdir.cleanup()

    def test_installation_removes_v1_profiles_instead_of_migrating_them(self):
        self.service.config_dir.mkdir(parents=True)
        self.service.config_file_path.write_text(
            'version = 1\n\n[[profile]]\nname = "Old Game"\n',
            encoding="utf-8",
        )

        data = self.service._prepare_config()

        self.assertEqual(data["profiles"], {})
        self.assertEqual(data["global_config"], {"dll": "", "no_fp16": False})
        self.assertFalse(self.service.config_file_path.exists())
        self.service.log.warning.assert_called_once()

    def test_installation_does_not_overwrite_a_future_config_version(self):
        self.service.config_dir.mkdir(parents=True)
        original = "version = 3\n\n[global]\nallow_fp16 = true\n"
        self.service.config_file_path.write_text(original, encoding="utf-8")

        with self.assertRaises(UnsupportedConfigurationVersion):
            self.service._prepare_config()

        self.assertEqual(self.service.config_file_path.read_text(encoding="utf-8"), original)


if __name__ == "__main__":
    unittest.main()
