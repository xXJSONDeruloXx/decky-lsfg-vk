import io
import sys
import tarfile
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

from lsfg_vk.config_schema import ConfigurationManager, UnsupportedConfigurationVersion
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
        self.service.local_bin_dir = self.home / ".local/bin"
        self.service.local_lib_dir = self.home / ".local/lib"
        self.service.local_share_dir = self.home / ".local/share/vulkan/implicit_layer.d"
        self.service.config_dir = self.home / ".config/lsfg-vk"
        self.service.config_file_path = self.service.config_dir / "conf.toml"
        self.service.cli_file = self.service.local_bin_dir / "lsfg-vk-cli"
        self.service.lib_file = self.service.local_lib_dir / "liblsfg-vk-layer.so"
        self.service.lib_x86_file = self.service.local_lib_dir / "liblsfg-vk-layer.x86.so"
        self.service.json_file = self.service.local_share_dir / "VkLayer_LSFGVK_frame_generation.json"
        self.service.json_x86_file = self.service.local_share_dir / "VkLayer_LSFGVK_frame_generation.x86.json"

    def tearDown(self):
        self.tempdir.cleanup()

    def _write_config(self, dll=""):
        self.service.config_dir.mkdir(parents=True, exist_ok=True)
        self.service.config_file_path.write_text(
            ConfigurationManager.generate_toml_content_multi_profile({
                "profiles": {"Test game": {"active_in": ["123"]}},
                "global_config": {"dll": dll, "no_fp16": False},
            }),
            encoding="utf-8",
        )

    def _mark_installed(self):
        for path in (
            self.service.cli_file,
            self.service.lib_file,
            self.service.lib_x86_file,
            self.service.json_file,
            self.service.json_x86_file,
            self.service.config_file_path,
        ):
            path.parent.mkdir(parents=True, exist_ok=True)
            if not path.exists():
                path.write_text("installed", encoding="utf-8")

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

    def test_unreadable_config_is_backed_up_before_defaults_are_used(self):
        self.service.config_dir.mkdir(parents=True)
        broken = 'version = 2\n[[profile]\nname = "My Game"\n'
        self.service.config_file_path.write_text(broken, encoding="utf-8")

        data = self.service._prepare_config()

        self.assertEqual(data["profiles"], {})
        backups = list(self.service.config_dir.glob("conf.toml.bak-*"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_text(encoding="utf-8"), broken)

    def test_incomplete_archive_leaves_installed_files_untouched(self):
        archive_path = Path(self.tempdir.name) / "payload.tar.gz"
        destinations = self.service._payload_destinations()
        present = list(destinations)[:-1]
        with tarfile.open(archive_path, "w:gz") as archive:
            for name in present:
                data = b"new"
                info = tarfile.TarInfo(name)
                info.size = len(data)
                archive.addfile(info, io.BytesIO(data))
        for destination, _mode in destinations.values():
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text("old", encoding="utf-8")

        with self.assertRaises(OSError):
            self.service._install_archive(archive_path)

        for destination, _mode in destinations.values():
            self.assertEqual(destination.read_text(encoding="utf-8"), "old")

    def _status_with(self, branch, dll=None):
        self._write_config()
        self._mark_installed()
        self.service.runtime_service.check_lossless_scaling.return_value = {
            "installed": False,
            "status": "Lossless Scaling's lsfg-vk.dll is not configured",
        }
        self.steam.get_branch_status.return_value = branch
        self.steam.find_lsfg_vk_dll.return_value = dll
        return self.service.check_installation()["lossless_scaling_status"]

    def test_missing_dll_explains_that_lossless_scaling_is_not_installed(self):
        status = self._status_with({"installed": False})
        self.assertIn("not installed in Steam", status)

    def test_missing_dll_explains_the_wrong_steam_branch(self):
        status = self._status_with(
            {"installed": True, "needs_switch": True, "selected_branch": "public"}
        )
        self.assertIn('"public" Steam branch', status)
        self.assertIn("Betas", status)

    def test_missing_dll_explains_a_download_that_has_not_finished(self):
        status = self._status_with({"installed": True, "needs_switch": False}, dll=None)
        self.assertIn("not downloaded lsfg-vk.dll yet", status)

    def test_other_statuses_are_left_alone(self):
        self._write_config()
        self._mark_installed()
        self.service.runtime_service.check_lossless_scaling.return_value = {
            "installed": True,
            "status": "Lossless Scaling detected by lsfg-vk",
        }
        status = self.service.check_installation()["lossless_scaling_status"]
        self.assertEqual(status, "Lossless Scaling detected by lsfg-vk")

    def test_uninstall_removes_backups_and_new_game_defaults(self):
        self._write_config()
        for name in ("conf.toml.bak.1", "conf.toml.bak.2", "new_game_defaults.json"):
            (self.service.config_dir / name).write_text("x", encoding="utf-8")

        result = self.service.uninstall()

        self.assertTrue(result["success"])
        self.assertFalse(self.service.config_dir.exists())

    def test_installation_does_not_overwrite_a_future_config_version(self):
        self.service.config_dir.mkdir(parents=True)
        original = "version = 3\n\n[global]\nallow_fp16 = true\n"
        self.service.config_file_path.write_text(original, encoding="utf-8")

        with self.assertRaises(UnsupportedConfigurationVersion):
            self.service._prepare_config()

        self.assertEqual(self.service.config_file_path.read_text(encoding="utf-8"), original)

    def test_check_installation_repairs_dll_path_after_branch_becomes_available(self):
        dll_path = self.home / "steamapps/common/Lossless Scaling/lsfg-vk.dll"
        dll_path.parent.mkdir(parents=True)
        dll_path.write_text("dll", encoding="utf-8")
        self.steam.find_lsfg_vk_dll.return_value = str(dll_path)
        self.service.runtime_service.check_lossless_scaling.return_value = {
            "installed": True,
            "status": "Lossless Scaling detected by lsfg-vk",
        }
        self._write_config()
        self._mark_installed()

        result = self.service.check_installation()

        self.assertTrue(result["installed"])
        self.assertTrue(result["lossless_scaling_installed"])
        data = ConfigurationManager.parse_toml_content_multi_profile(
            self.service.config_file_path.read_text(encoding="utf-8")
        )
        self.assertEqual(data["global_config"]["dll"], str(dll_path))
        self.assertEqual(data["profiles"]["Test game"]["active_in"], ["123"])
        self.service.runtime_service.validate_config_content.assert_called_once()

    def test_check_installation_does_not_write_dll_path_on_wrong_branch(self):
        self.service.runtime_service.check_lossless_scaling.return_value = {
            "installed": False,
            "status": "Lossless Scaling's lsfg-vk.dll is not configured",
        }
        self._write_config()
        self._mark_installed()

        result = self.service.check_installation()

        self.assertTrue(result["installed"])
        self.assertFalse(result["lossless_scaling_installed"])
        data = ConfigurationManager.parse_toml_content_multi_profile(
            self.service.config_file_path.read_text(encoding="utf-8")
        )
        self.assertEqual(data["global_config"]["dll"], "")
        self.service.runtime_service.validate_config_content.assert_not_called()


if __name__ == "__main__":
    unittest.main()
