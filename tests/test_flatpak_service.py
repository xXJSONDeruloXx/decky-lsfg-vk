import json
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

from lsfg_vk.flatpak_service import FlatpakService


class FlatpakServiceTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.home = Path(self.tempdir.name) / "home" / "deck"
        self.home.mkdir(parents=True)
        self.service = FlatpakService()
        self.service.user_home = self.home
        self.service.config_dir = self.home / ".config/lsfg-vk"
        self.service.config_file_path = self.service.config_dir / "conf.toml"
        self.service.check_flatpak_available = Mock(return_value=True)
        self.service._run_flatpak_command = Mock()
        self.bundle = self.home / "lsfg-vk-24.08.flatpak"
        self.bundle.write_bytes(b"bundle")
        self.service._bundled_extension_path = Mock(return_value=self.bundle)

    def tearDown(self):
        self.tempdir.cleanup()

    @staticmethod
    def _result(stdout="", returncode=0, stderr=""):
        return types.SimpleNamespace(stdout=stdout, returncode=returncode, stderr=stderr)

    @staticmethod
    def _extension_line(branch):
        return f"org.freedesktop.Platform.VulkanLayer.lsfgvk\tx86_64\t{branch}\n"

    def test_runtime_branch_mapping_is_strict_and_branch_specific(self):
        self.assertEqual(
            FlatpakService.runtime_branch_from_ref(
                "org.freedesktop.Platform/x86_64/24.08"
            ),
            "24.08",
        )
        self.assertEqual(
            FlatpakService.runtime_branch_from_ref(
                "org.freedesktop.Platform//25.08"
            ),
            "25.08",
        )
        with self.assertRaises(ValueError):
            FlatpakService.runtime_branch_from_ref("org.gnome.Sdk/x86_64/46")
        with self.assertRaises(ValueError):
            FlatpakService.runtime_branch_from_ref(
                "org.freedesktop.Platform/x86_64/26.08"
            )

    def test_resolve_reads_required_runtime_instead_of_any_installed_branch(self):
        self.service._run_flatpak_command.side_effect = [
            self._result("org.freedesktop.Platform/x86_64/24.08\n"),
            self._result(self._extension_line("23.08")),
        ]

        response = self.service.resolve_app_support("com.example.Game")

        self.assertTrue(response["success"])
        self.assertEqual(response["runtime_branch"], "24.08")
        self.assertEqual(response["support_status"], "needs-runtime")
        self.assertFalse(response["extension_installed"])
        self.assertEqual(
            self.service._run_flatpak_command.call_args_list[0].args[0],
            ["info", "--show-runtime", "com.example.Game"],
        )
        self.assertEqual(
            self.service._run_flatpak_command.call_args_list[1].args[0],
            ["list", "--runtime", "--columns=application,arch,branch"],
        )

    def test_install_records_only_a_new_user_owned_branch(self):
        self.service._run_flatpak_command.side_effect = [
            self._result(""),
            self._result(""),
            self._result(self._extension_line("24.08")),
        ]

        response = self.service.install_extension("24.08")

        self.assertTrue(response["success"])
        self.assertTrue(response["owned_by_plugin"])
        install_args = self.service._run_flatpak_command.call_args_list[1].args[0]
        self.assertEqual(install_args[:4], ["install", "--user", "--noninteractive", "--or-update"])
        self.assertEqual(
            json.loads(self.service.ownership_path.read_text(encoding="utf-8")),
            {"version": 1, "plugin_owned_branches": ["24.08"]},
        )

    def test_preexisting_branch_is_not_claimed_or_removed(self):
        self.service._run_flatpak_command.return_value = self._result(
            self._extension_line("24.08")
        )

        install_response = self.service.install_extension("24.08")
        cleanup_response = self.service.remove_plugin_owned_extensions()

        self.assertTrue(install_response["success"])
        self.assertFalse(install_response["owned_by_plugin"])
        self.assertFalse(self.service.ownership_path.exists())
        self.assertTrue(cleanup_response["success"])
        self.assertEqual(self.service._run_flatpak_command.call_count, 1)

    def test_corrupt_ownership_metadata_fails_closed(self):
        self.service.ownership_path.parent.mkdir(parents=True, exist_ok=True)
        self.service.ownership_path.write_text("{not-json", encoding="utf-8")

        response = self.service.remove_plugin_owned_extensions()

        self.assertFalse(response["success"])
        self.assertTrue(response["ownership_uncertain"])
        self.assertEqual(self.service._run_flatpak_command.call_count, 0)

    def test_dangling_ownership_symlink_fails_closed(self):
        self.service.ownership_path.parent.mkdir(parents=True, exist_ok=True)
        self.service.ownership_path.symlink_to(self.home / "missing-metadata")

        response = self.service.remove_plugin_owned_extensions()

        self.assertFalse(response["success"])
        self.assertTrue(response["ownership_uncertain"])
        self.assertEqual(self.service._run_flatpak_command.call_count, 0)

    def test_ensure_app_support_installs_only_the_app_runtime_branch(self):
        self.service._run_flatpak_command.side_effect = [
            self._result("org.freedesktop.Platform/x86_64/24.08\n"),
            self._result(""),
            self._result(""),
            self._result(""),
            self._result(""),
            self._result(self._extension_line("24.08")),
            self._result("org.freedesktop.Platform/x86_64/24.08\n"),
            self._result(self._extension_line("24.08")),
        ]

        response = self.service.ensure_app_support("com.example.Game")

        self.assertTrue(response["success"])
        self.assertEqual(response["support_status"], "ready")
        self.assertEqual(response["runtime_branch"], "24.08")
        install_args = self.service._run_flatpak_command.call_args_list[4].args[0]
        self.assertEqual(install_args[0], "install")
        self.assertIn("--user", install_args)
        self.assertNotIn("23.08", install_args)
        self.assertEqual(
            json.loads(self.service.ownership_path.read_text(encoding="utf-8")),
            {"version": 1, "plugin_owned_branches": ["24.08"]},
        )

    def test_two_shortcuts_using_one_flatpak_share_one_extension_branch(self):
        self.service._run_flatpak_command.side_effect = [
            self._result("org.freedesktop.Platform/x86_64/24.08\n"),
            self._result(""),
            self._result(""),
            self._result(""),
            self._result(""),
            self._result(self._extension_line("24.08")),
            self._result("org.freedesktop.Platform/x86_64/24.08\n"),
            self._result(self._extension_line("24.08")),
            self._result("org.freedesktop.Platform/x86_64/24.08\n"),
            self._result(self._extension_line("24.08")),
        ]

        first = self.service.ensure_app_support("net.pcsx2.PCSX2")
        second = self.service.ensure_app_support("net.pcsx2.PCSX2.Dev")

        self.assertEqual(first["support_status"], "ready")
        self.assertEqual(second["support_status"], "ready")
        install_commands = [
            call.args[0]
            for call in self.service._run_flatpak_command.call_args_list
            if call.args[0][0] == "install"
        ]
        self.assertEqual(len(install_commands), 1)
        self.assertEqual(
            json.loads(self.service.ownership_path.read_text(encoding="utf-8")),
            {"version": 1, "plugin_owned_branches": ["24.08"]},
        )

    def test_cleanup_removes_all_owned_branches_without_reusing_stale_metadata(self):
        self.service.ownership_path.parent.mkdir(parents=True, exist_ok=True)
        self.service.ownership_path.write_text(
            json.dumps({"version": 1, "plugin_owned_branches": ["23.08", "24.08"]}),
            encoding="utf-8",
        )
        self.service._run_flatpak_command.side_effect = [
            self._result(
                "\n".join(
                    [
                        "\t".join([FlatpakService.EXTENSION_ID, "x86_64", "23.08"]),
                        "\t".join([FlatpakService.EXTENSION_ID, "x86_64", "24.08"]),
                    ]
                )
                + "\n"
            ),
            self._result(""),
            self._result("\t".join([FlatpakService.EXTENSION_ID, "x86_64", "24.08"]) + "\n"),
            self._result("\t".join([FlatpakService.EXTENSION_ID, "x86_64", "24.08"]) + "\n"),
            self._result(""),
            self._result(""),
        ]

        response = self.service.remove_plugin_owned_extensions()

        self.assertTrue(response["success"])
        self.assertEqual(response["removed_branches"], ["23.08", "24.08"])
        self.assertFalse(self.service.ownership_path.exists())
        uninstall_commands = [
            call.args[0]
            for call in self.service._run_flatpak_command.call_args_list
            if call.args[0][0] == "uninstall"
        ]
        self.assertEqual(len(uninstall_commands), 2)


if __name__ == "__main__":
    unittest.main()
