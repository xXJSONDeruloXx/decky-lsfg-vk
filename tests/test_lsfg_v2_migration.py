import logging
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "py_modules"))
sys.modules.setdefault("decky", types.SimpleNamespace(logger=logging.getLogger("decky-test")))

from lsfg_vk.base_service import BaseService
from lsfg_vk.config_schema import ConfigurationManager
from lsfg_vk.configuration import ConfigurationService


LEGACY_CONFIG = '''\
version = 1

[global]
current_profile = "decky-lsfg-vk"
dll = "/games/Lossless Scaling/Lossless.dll"
no_fp16 = true

[[game]]
exe = "decky-lsfg-vk"
multiplier = 1
flow_scale = 0.9
performance_mode = true
hdr_mode = true
experimental_present_mode = "mailbox"
'''


class ConfigurationMigrationTests(unittest.TestCase):
    def test_v1_configuration_is_converted_to_valid_v2_toml(self):
        migrated = ConfigurationManager.parse_toml_content_multi_profile(LEGACY_CONFIG)
        serialized = ConfigurationManager.generate_toml_content_multi_profile(migrated)

        self.assertIn("version = 2", serialized)
        self.assertIn("allow_fp16 = false", serialized)
        self.assertIn("[[profile]]", serialized)
        self.assertIn('name = "decky-lsfg-vk"', serialized)
        self.assertIn("multiplier = 2", serialized)
        self.assertNotIn("[[game]]", serialized)
        self.assertNotIn("no_fp16", serialized)
        self.assertNotIn("hdr_mode", serialized)
        self.assertNotIn("experimental_present_mode", serialized)

    def test_v2_normalization_is_idempotent(self):
        migrated = ConfigurationManager.parse_toml_content_multi_profile(LEGACY_CONFIG)
        first_write = ConfigurationManager.generate_toml_content_multi_profile(migrated)
        second_write = ConfigurationManager.generate_toml_content_multi_profile(
            ConfigurationManager.parse_toml_content_multi_profile(first_write)
        )

        self.assertEqual(second_write, first_write)

    def test_launch_script_uses_v2_profile_override(self):
        service = ConfigurationService.__new__(ConfigurationService)
        service.local_share_dir = Path("/home/deck/.local/share/vulkan/implicit_layer.d")
        service.config_file_path = Path("/home/deck/.config/lsfg-vk/conf.toml")

        profile_data = {
            "current_profile": "decky-lsfg-vk",
            "profiles": {"decky-lsfg-vk": ConfigurationManager.get_defaults()},
            "global_config": {"dll": "/games/Lossless Scaling/Lossless.dll", "allow_fp16": True},
        }
        script = service._generate_script_content_for_profile(profile_data)

        self.assertIn("LSFGVK_CONFIG=/home/deck/.config/lsfg-vk/conf.toml", script)
        self.assertIn("LSFGVK_PROFILE=decky-lsfg-vk", script)
        self.assertNotIn("LSFG_PROCESS", script)

    def test_active_in_uses_native_v2_tracking_instead_of_forcing_a_profile(self):
        config = ConfigurationManager.get_defaults()
        config["active_in"] = "Game.exe, GameThread"
        self.assertEqual(
            ConfigurationService._profile_selection_lines("decky-lsfg-vk", config),
            ["# active_in is configured; lsfg-vk will select a matching profile automatically."],
        )


class InstallerInfrastructureTests(unittest.TestCase):
    def test_layer_archive_selection_has_no_legacy_arm_override(self):
        from lsfg_vk.constants import (
            LAYER_ARCHIVE_AARCH64,
            LAYER_ARCHIVE_X86_64,
            get_layer_archive_filename,
        )

        self.assertEqual(get_layer_archive_filename(False), LAYER_ARCHIVE_X86_64)
        self.assertEqual(get_layer_archive_filename(True), LAYER_ARCHIVE_AARCH64)
        self.assertNotEqual(LAYER_ARCHIVE_AARCH64, LAYER_ARCHIVE_X86_64)

    def test_install_migrates_v1_config_once_and_preserves_script_workarounds(self):
        from lsfg_vk.installation import InstallationService

        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            config_dir = home / ".config" / "lsfg-vk"
            config_dir.mkdir(parents=True)
            config_path = config_dir / "conf.toml"
            config_path.write_text(LEGACY_CONFIG, encoding="utf-8")
            script_path = home / "lsfg"
            script_path.write_text("#!/bin/bash\nexport DXVK_FRAME_RATE=45\nexec \"$@\"\n", encoding="utf-8")

            service = InstallationService.__new__(InstallationService)
            service.log = mock.Mock()
            service.user_home = home
            service.config_dir = config_dir
            service.config_file_path = config_path
            service.lsfg_script_path = script_path
            service.lsfg_launch_script_path = script_path

            with mock.patch("lsfg_vk.dll_detection.DllDetectionService") as detection_service:
                detection_service.return_value.check_lossless_scaling_dll.return_value = {"detected": False}
                profile_data = service._create_config_file()

            self.assertEqual(
                (config_dir / "conf.toml.v1.bak").read_text(encoding="utf-8"),
                LEGACY_CONFIG,
            )
            migrated = config_path.read_text(encoding="utf-8")
            self.assertIn("version = 2", migrated)
            self.assertIn("allow_fp16 = false", migrated)
            self.assertEqual(profile_data["profiles"]["decky-lsfg-vk"]["dxvk_frame_rate"], 45)

            service._create_lsfg_launch_script(profile_data)
            launch_script = script_path.read_text(encoding="utf-8")
            self.assertIn("export DXVK_FRAME_RATE=45", launch_script)
            self.assertIn("export DISABLE_LSFGVK=1", launch_script)

            with mock.patch("lsfg_vk.dll_detection.DllDetectionService") as detection_service:
                detection_service.return_value.check_lossless_scaling_dll.return_value = {"detected": False}
                service._create_config_file()
            self.assertEqual(len(list(config_dir.glob("conf.toml.v1.bak*"))), 1)

    def test_writes_replace_the_config_atomically(self):
        service = BaseService.__new__(BaseService)
        service.log = mock.Mock()

        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "conf.toml"
            target.write_text("old config", encoding="utf-8")

            with mock.patch("lsfg_vk.base_service.os.replace", wraps=__import__("os").replace) as replace:
                service._write_file(target, "version = 2\n", 0o644)

            self.assertEqual(target.read_text(encoding="utf-8"), "version = 2\n")
            replace.assert_called_once()


if __name__ == "__main__":
    unittest.main()
