import asyncio
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
        self.assertNotIn("dll =", serialized)
        self.assertNotIn("active_in", serialized)
        self.assertNotIn("gpu", serialized)

    def test_removed_v2_controls_are_not_reintroduced_when_normalizing(self):
        content = '''\
version = 2

[global]
dll = "/tmp/Lossless.dll"
allow_fp16 = true

[[profile]]
name = "decky-lsfg-vk"
active_in = "Game.exe"
gpu = "0x10DE:0x2684"
multiplier = 2
flow_scale = 0.9
performance_mode = false
pacing = "none"
'''

        serialized = ConfigurationManager.generate_toml_content_multi_profile(
            ConfigurationManager.parse_toml_content_multi_profile(content)
        )

        self.assertNotIn("dll =", serialized)
        self.assertNotIn("active_in", serialized)
        self.assertNotIn("gpu", serialized)

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
            "global_config": {"allow_fp16": True},
        }
        script = service._generate_script_content_for_profile(profile_data)

        self.assertIn("LSFGVK_CONFIG=/home/deck/.config/lsfg-vk/conf.toml", script)
        self.assertIn("LSFGVK_PROFILE=decky-lsfg-vk", script)
        self.assertNotIn("LSFG_PROCESS", script)

    def test_launch_script_always_forces_selected_profile(self):
        config = ConfigurationManager.get_defaults()
        self.assertEqual(
            ConfigurationService._profile_selection_lines("decky-lsfg-vk"),
            ["export LSFGVK_PROFILE=decky-lsfg-vk"],
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

    def test_unrecognized_configuration_is_backed_up_before_reset(self):
        from lsfg_vk.installation import InstallationService

        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            config_dir = home / ".config" / "lsfg-vk"
            config_dir.mkdir(parents=True)
            config_path = config_dir / "conf.toml"
            unsupported_config = "version = 3\n"
            config_path.write_text(unsupported_config, encoding="utf-8")

            service = InstallationService.__new__(InstallationService)
            service.log = mock.Mock()
            service.user_home = home
            service.config_dir = config_dir
            service.config_file_path = config_path
            service.lsfg_script_path = home / "lsfg"
            service.lsfg_launch_script_path = home / "lsfg"

            with mock.patch("lsfg_vk.dll_detection.DllDetectionService") as detection_service:
                detection_service.return_value.check_lossless_scaling_dll.return_value = {"detected": False}
                service._create_config_file()

            self.assertEqual(
                (config_dir / "conf.toml.unrecognized.bak").read_text(encoding="utf-8"),
                unsupported_config,
            )
            self.assertIn("version = 2", config_path.read_text(encoding="utf-8"))
            self.assertEqual(service._config_recovery_backup, config_dir / "conf.toml.unrecognized.bak")

    def test_invalid_layer_manifest_fails_without_copying_unmodified_json(self):
        from lsfg_vk.installation import InstallationService

        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "manifest.json"
            destination = Path(directory) / "installed.json"
            source.write_text('{"not_layer": true}', encoding="utf-8")

            service = InstallationService.__new__(InstallationService)
            service.log = mock.Mock()

            with self.assertRaises(OSError):
                service._copy_and_fix_json_file(source, destination)
            self.assertFalse(destination.exists())

    def test_installation_snapshot_restores_previous_files(self):
        from lsfg_vk.installation import InstallationService

        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            service = InstallationService.__new__(InstallationService)
            service.log = mock.Mock()
            service.local_lib_dir = home / "lib"
            service.local_share_dir = home / "share"
            service.config_file_path = home / "config" / "conf.toml"
            service.lsfg_launch_script_path = home / "lsfg"
            service.legacy_lib_file = service.local_lib_dir / "liblsfg-vk.so"
            service.legacy_json_file = service.local_share_dir / "legacy.json"
            service.lib_file = service.local_lib_dir / "liblsfg-vk-layer.so"
            service.json_file = service.local_share_dir / "manifest.json"
            service.config_file_path.parent.mkdir(parents=True)
            service.local_lib_dir.mkdir(parents=True)
            service.local_share_dir.mkdir(parents=True)
            service.lib_file.write_bytes(b"old layer")
            service.json_file.write_text("old manifest", encoding="utf-8")
            service.config_file_path.write_text("old config", encoding="utf-8")
            service.lsfg_launch_script_path.write_text("old script", encoding="utf-8")

            with tempfile.TemporaryDirectory() as transaction_dir:
                snapshots = service._snapshot_installation_files(Path(transaction_dir))
                service.lib_file.write_bytes(b"new layer")
                service.json_file.write_text("new manifest", encoding="utf-8")
                service.config_file_path.unlink()
                service.lsfg_launch_script_path.write_text("new script", encoding="utf-8")
                service._restore_installation_files(snapshots)

            self.assertEqual(service.lib_file.read_bytes(), b"old layer")
            self.assertEqual(service.json_file.read_text(encoding="utf-8"), "old manifest")
            self.assertEqual(service.config_file_path.read_text(encoding="utf-8"), "old config")
            self.assertEqual(service.lsfg_launch_script_path.read_text(encoding="utf-8"), "old script")

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


class FlatpakMigrationTests(unittest.TestCase):
    def test_install_uses_the_bundled_flatpak_asset(self):
        from lsfg_vk.flatpak_service import FlatpakService

        with tempfile.TemporaryDirectory() as directory:
            bundle_path = Path(directory) / "org.freedesktop.Platform.VulkanLayer.lsfg_vk_23.08.flatpak"
            bundle_path.write_bytes(b"flatpak bundle")

            service = FlatpakService.__new__(FlatpakService)
            service.log = mock.Mock()
            service.check_flatpak_available = mock.Mock(return_value=True)
            service._get_bundled_extension_path = mock.Mock(return_value=bundle_path)
            service._run_flatpak_command = mock.Mock(
                return_value=types.SimpleNamespace(returncode=0, stdout="", stderr="")
            )

            result = service.install_extension("23.08")

            self.assertTrue(result["success"])
            service._run_flatpak_command.assert_called_once_with(
                [
                    "install",
                    "--user",
                    "--or-update",
                    "--assumeyes",
                    "--noninteractive",
                    str(bundle_path),
                ],
                capture_output=True,
                text=True,
            )

    def test_update_installed_extensions_only_updates_user_runtimes_and_migrates_apps(self):
        from lsfg_vk.flatpak_service import FlatpakService

        service = FlatpakService.__new__(FlatpakService)
        service.log = mock.Mock()
        service.check_flatpak_available = mock.Mock(return_value=True)
        service._get_installed_extension_versions = mock.Mock(return_value=["23.08", "25.08"])
        bundle = mock.Mock()
        bundle.is_file.return_value = True
        service._get_bundled_extension_path = mock.Mock(return_value=bundle)
        service._get_installed_extension_commit = mock.Mock(side_effect=lambda version: f"old-{version}")
        service.install_extension = mock.Mock(
            side_effect=[{"success": True}, {"success": True}]
        )
        service._migrate_legacy_app_overrides = mock.Mock(
            return_value={
                "success": True,
                "migrated_apps": ["org.example.Game"],
                "failed_apps": [],
            }
        )

        result = service.update_installed_extensions()

        self.assertTrue(result["success"])
        self.assertEqual(result["updated_versions"], ["23.08", "25.08"])
        self.assertEqual(result["migrated_apps"], ["org.example.Game"])
        self.assertEqual(
            service.install_extension.call_args_list,
            [mock.call("23.08"), mock.call("25.08")],
        )
        service._migrate_legacy_app_overrides.assert_called_once_with()

    def test_installed_runtime_scan_is_scoped_to_user_installation(self):
        from lsfg_vk.flatpak_service import FlatpakService

        service = FlatpakService.__new__(FlatpakService)
        service._run_flatpak_command = mock.Mock(
            return_value=types.SimpleNamespace(
                returncode=0,
                stdout=(
                    "lsfg-vk\torg.freedesktop.Platform.VulkanLayer.lsfgvk\t"
                    "2.0\t23.08\tx86_64\n"
                ),
                stderr="",
            )
        )

        self.assertEqual(service._get_installed_extension_versions(), ["23.08"])
        service._run_flatpak_command.assert_called_once_with(
            ["list", "--user", "--runtime"],
            capture_output=True,
            text=True,
            check=True,
        )

    def test_failed_runtime_update_leaves_legacy_overrides_untouched(self):
        from lsfg_vk.flatpak_service import FlatpakService

        service = FlatpakService.__new__(FlatpakService)
        service.log = mock.Mock()
        service.check_flatpak_available = mock.Mock(return_value=True)
        service._get_installed_extension_versions = mock.Mock(return_value=["24.08"])
        bundle = mock.Mock()
        bundle.is_file.return_value = True
        service._get_bundled_extension_path = mock.Mock(return_value=bundle)
        service._get_installed_extension_commit = mock.Mock(return_value="old-24.08")
        service.install_extension = mock.Mock(
            return_value={"success": False, "error": "bundle unavailable"}
        )
        service._migrate_legacy_app_overrides = mock.Mock()

        result = service.update_installed_extensions()

        self.assertFalse(result["success"])
        self.assertEqual(result["failed_versions"][0]["version"], "24.08")
        service._migrate_legacy_app_overrides.assert_not_called()

    def test_failed_runtime_update_rolls_back_previously_updated_runtimes(self):
        from lsfg_vk.flatpak_service import FlatpakService

        service = FlatpakService.__new__(FlatpakService)
        service.log = mock.Mock()
        service.check_flatpak_available = mock.Mock(return_value=True)
        service._get_installed_extension_versions = mock.Mock(return_value=["23.08", "24.08"])
        bundle = mock.Mock()
        bundle.is_file.return_value = True
        service._get_bundled_extension_path = mock.Mock(return_value=bundle)
        service._get_installed_extension_commit = mock.Mock(
            side_effect=lambda version: f"old-{version}"
        )
        service.install_extension = mock.Mock(
            side_effect=[
                {"success": True},
                {"success": False, "error": "transaction failed"},
            ]
        )
        service._rollback_extension = mock.Mock(return_value=None)
        service._migrate_legacy_app_overrides = mock.Mock()

        result = service.update_installed_extensions()

        self.assertFalse(result["success"])
        self.assertEqual(result["rolled_back_versions"], ["23.08"])
        service._rollback_extension.assert_called_once_with("23.08", "old-23.08")
        service._migrate_legacy_app_overrides.assert_not_called()

    def test_flatpak_app_scan_is_scoped_to_user_installation(self):
        from lsfg_vk.flatpak_service import FlatpakService

        service = FlatpakService.__new__(FlatpakService)
        service._run_flatpak_command = mock.Mock(
            return_value=types.SimpleNamespace(
                returncode=0,
                stdout="Game\torg.example.Game\t1.0\tx86_64\n",
                stderr="",
            )
        )

        self.assertEqual(service._get_flatpak_app_ids(), ["org.example.Game"])
        service._run_flatpak_command.assert_called_once_with(
            ["list", "--user", "--app"],
            capture_output=True,
            text=True,
            check=True,
        )

    def test_native_install_runs_flatpak_migration_after_success(self):
        from lsfg_vk.plugin import Plugin

        plugin = Plugin.__new__(Plugin)
        plugin.installation_service = mock.Mock()
        plugin.flatpak_service = mock.Mock()
        plugin.installation_service.install.return_value = {
            "success": True,
            "message": "lsfg-vk v2 installed successfully",
            "error": None,
        }
        plugin.flatpak_service.update_installed_extensions.return_value = {
            "success": True,
            "message": "Updated one Flatpak runtime",
            "skipped": False,
            "updated_versions": ["23.08"],
            "failed_versions": [],
            "migrated_apps": [],
            "failed_apps": [],
        }

        result = asyncio.run(plugin.install_lsfg_vk())

        self.assertTrue(result["success"])
        self.assertIn("flatpak_update", result)
        plugin.flatpak_service.update_installed_extensions.assert_called_once_with()

    def test_legacy_override_detection_does_not_match_v2_environment(self):
        from lsfg_vk.flatpak_service import FlatpakService

        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            service = FlatpakService.__new__(FlatpakService)
            service.user_home = home
            service.config_dir = home / ".config/lsfg-vk"
            service.config_file_path = service.config_dir / "conf.toml"
            service.lsfg_launch_script_path = home / "lsfg"
            service.log = mock.Mock()

            self.assertTrue(
                service._has_legacy_app_override(
                    f"LSFG_CONFIG={service.config_file_path}\n"
                )
            )
            self.assertFalse(
                service._has_legacy_app_override(
                    f"LSFGVK_CONFIG={service.config_file_path}\n"
                )
            )

    def test_legacy_override_migration_only_touches_plugin_owned_apps(self):
        from lsfg_vk.flatpak_service import FlatpakService

        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            service = FlatpakService.__new__(FlatpakService)
            service.user_home = home
            service.config_dir = home / ".config/lsfg-vk"
            service.config_file_path = service.config_dir / "conf.toml"
            service.lsfg_launch_script_path = home / "lsfg"
            service.log = mock.Mock()
            service._get_flatpak_app_ids = mock.Mock(
                return_value=["org.example.Legacy", "org.example.V2", "org.example.Other"]
            )
            service._get_app_override_output = mock.Mock(
                side_effect=[
                    f"LSFG_CONFIG={service.config_file_path}\n",
                    f"LSFGVK_CONFIG={service.config_file_path}\n",
                    "",
                ]
            )
            service.set_app_override = mock.Mock(return_value={"success": True})

            result = service._migrate_legacy_app_overrides()

            self.assertTrue(result["success"])
            self.assertEqual(result["migrated_apps"], ["org.example.Legacy"])
            service.set_app_override.assert_called_once_with("org.example.Legacy")

    def test_v2_override_setup_and_removal_clean_legacy_overrides(self):
        from lsfg_vk.flatpak_service import FlatpakService

        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            config_dir = home / ".config" / "lsfg-vk"
            config_dir.mkdir(parents=True)
            config_path = config_dir / "conf.toml"
            config_path.write_text(
                ConfigurationManager.generate_toml_content(ConfigurationManager.get_defaults()),
                encoding="utf-8",
            )

            service = FlatpakService.__new__(FlatpakService)
            service.log = mock.Mock()
            service.user_home = home
            service.config_dir = config_dir
            service.config_file_path = config_path
            service.lsfg_launch_script_path = home / "lsfg"
            service.check_flatpak_available = mock.Mock(return_value=True)
            service._run_flatpak_command = mock.Mock(
                return_value=types.SimpleNamespace(returncode=0, stdout="", stderr="")
            )

            app_id = "org.example.Game"
            result = service.set_app_override(app_id)
            self.assertTrue(result["success"])
            setup_calls = [call.args[0] for call in service._run_flatpak_command.call_args_list]
            self.assertIn(
                ["override", "--user", f"--env=LSFGVK_CONFIG={config_path}", app_id],
                setup_calls,
            )
            self.assertIn(
                ["override", "--user", "--unset-env=LSFG_CONFIG", app_id],
                setup_calls,
            )
            self.assertIn(
                [
                    "override",
                    "--user",
                    f"--nofilesystem={home / '.local/share/Steam/steamapps/common/Lossless Scaling/Lossless.dll'}",
                    app_id,
                ],
                setup_calls,
            )
            self.assertIn(
                ["override", "--user", f"--nofilesystem={home / 'lsfg'}", app_id],
                setup_calls,
            )

            service._run_flatpak_command.reset_mock()
            result = service.remove_app_override(app_id)
            self.assertTrue(result["success"])
            removal_calls = [call.args[0] for call in service._run_flatpak_command.call_args_list]
            self.assertIn(
                ["override", "--user", "--unset-env=LSFG_CONFIG", app_id],
                removal_calls,
            )
            self.assertIn(
                ["override", "--user", f"--nofilesystem={home / 'lsfg'}", app_id],
                removal_calls,
            )


if __name__ == "__main__":
    unittest.main()
