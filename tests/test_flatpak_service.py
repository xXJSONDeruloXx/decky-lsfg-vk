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
        self.service._run_flatpak_command = Mock(side_effect=self._run_flatpak_command)
        self.runtime_ref = "org.freedesktop.Platform/x86_64/24.08"
        self.runtime_metadata = ""
        self.user_branches = set()
        self.system_branches = set()
        self.install_branch = "24.08"
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

    def _run_flatpak_command(self, args, **_kwargs):
        if args[0] == "info" and args[1] == "--show-runtime":
            return self._result(self.runtime_ref + "\n")
        if args[0] == "info" and args[1] == "--show-metadata":
            return self._result(self.runtime_metadata)
        if args[0] == "list":
            branches = self.user_branches if "--user" in args else self.system_branches
            return self._result("".join(self._extension_line(branch) for branch in sorted(branches)))
        if args[0] == "install":
            self.user_branches.add(self.install_branch)
            return self._result()
        if args[0] == "uninstall":
            self.user_branches.discard(args[-1].rsplit("/", 1)[-1])
            return self._result()
        raise AssertionError(f"Unexpected Flatpak command: {args}")

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

    def test_runtime_branch_mapping_reads_documented_gl_metadata(self):
        metadata = """
[Extension org.freedesktop.Platform.GL]
versions=25.08;25.08-extra;1.4
version=1.4
"""
        self.assertEqual(FlatpakService.runtime_branch_from_metadata(metadata), "25.08")
        with self.assertRaises(ValueError):
            FlatpakService.runtime_branch_from_metadata(
                "[Extension org.freedesktop.Platform.GL]\nversions=26.08;26.08-extra;1.4\n"
            )

    def test_resolve_reads_required_runtime_instead_of_any_installed_branch(self):
        self.user_branches = {"23.08"}

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
            ["list", "--user", "--runtime", "--columns=application,arch,branch"],
        )
        self.assertEqual(
            self.service._run_flatpak_command.call_args_list[2].args[0],
            ["list", "--system", "--runtime", "--columns=application,arch,branch"],
        )

    def test_resolve_maps_kde_and_gnome_runtimes_from_gl_metadata(self):
        metadata = "[Extension org.freedesktop.Platform.GL]\nversions=25.08;25.08-extra;1.4\n"
        for runtime in ("org.kde.Platform/x86_64/6.10", "org.gnome.Platform/x86_64/49"):
            with self.subTest(runtime=runtime):
                self.service._run_flatpak_command.reset_mock()
                self.runtime_ref = runtime
                self.runtime_metadata = metadata
                response = self.service.resolve_app_support("com.example.Game")
                self.assertEqual(response["runtime_branch"], "25.08")
                self.assertEqual(response["support_status"], "needs-runtime")
                self.assertEqual(
                    self.service._run_flatpak_command.call_args_list[1].args[0],
                    ["info", "--show-metadata", runtime],
                )

    def test_system_extension_is_ready_without_installing_a_user_copy(self):
        self.system_branches = {"24.08"}

        response = self.service.ensure_app_support("com.example.Game")

        self.assertTrue(response["success"])
        self.assertEqual(response["support_status"], "ready")
        self.assertEqual(
            [call.args[0][0] for call in self.service._run_flatpak_command.call_args_list],
            ["info", "list", "list"],
        )
        self.assertFalse(any(call.args[0][0] == "install" for call in self.service._run_flatpak_command.call_args_list))

    def test_install_records_only_a_new_user_owned_branch(self):
        response = self.service.install_extension("24.08")

        self.assertTrue(response["success"])
        self.assertTrue(response["enabled"])
        self.assertTrue(response["installed"])
        install_args = self.service._run_flatpak_command.call_args_list[2].args[0]
        self.assertEqual(install_args[:4], ["install", "--user", "--noninteractive", "--or-update"])
        self.assertEqual(
            json.loads(self.service.ownership_path.read_text(encoding="utf-8")),
            {"version": 1, "plugin_owned_branches": ["24.08"]},
        )

    def test_preexisting_branch_is_not_claimed_or_removed(self):
        self.user_branches = {"24.08"}

        install_response = self.service.install_extension("24.08")
        cleanup_response = self.service.remove_plugin_owned_extensions()

        self.assertTrue(install_response["success"])
        self.assertTrue(install_response["enabled"])
        self.assertTrue(install_response["installed"])
        self.assertFalse(self.service.ownership_path.exists())
        self.assertTrue(cleanup_response["success"])
        self.assertEqual(self.service._run_flatpak_command.call_count, 2)

    def test_extension_toggle_preserves_preexisting_branch(self):
        self.user_branches = {"24.08"}

        enable_response = self.service.set_extension_enabled("24.08", True)
        disable_response = self.service.set_extension_enabled("24.08", False)

        self.assertTrue(enable_response["success"])
        self.assertTrue(enable_response["enabled"])
        self.assertTrue(enable_response["installed"])
        self.assertTrue(disable_response["success"])
        self.assertTrue(disable_response["enabled"])
        self.assertTrue(disable_response["installed"])
        self.assertFalse(disable_response["removed"])
        self.assertEqual(self.user_branches, {"24.08"})
        self.assertEqual(
            [call.args[0][0] for call in self.service._run_flatpak_command.call_args_list],
            ["list", "list", "list", "list"],
        )

    def test_extension_toggle_removes_owned_user_branch_but_preserves_system_branch(self):
        self.service.ownership_path.parent.mkdir(parents=True, exist_ok=True)
        self.service.ownership_path.write_text(
            json.dumps({"version": 1, "plugin_owned_branches": ["24.08"]}),
            encoding="utf-8",
        )
        self.user_branches = {"24.08"}
        self.system_branches = {"24.08"}

        disable_response = self.service.set_extension_enabled("24.08", False)
        repeat_response = self.service.set_extension_enabled("24.08", False)

        self.assertTrue(disable_response["success"])
        self.assertTrue(disable_response["enabled"])
        self.assertTrue(disable_response["removed"])
        self.assertTrue(repeat_response["success"])
        self.assertTrue(repeat_response["enabled"])
        self.assertTrue(repeat_response["installed"])
        self.assertEqual(self.user_branches, set())
        self.assertEqual(self.system_branches, {"24.08"})
        self.assertFalse(self.service.ownership_path.exists())
        uninstall_commands = [
            call.args[0]
            for call in self.service._run_flatpak_command.call_args_list
            if call.args[0][0] == "uninstall"
        ]
        self.assertEqual(len(uninstall_commands), 1)

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
        response = self.service.ensure_app_support("com.example.Game")

        self.assertTrue(response["success"])
        self.assertEqual(response["support_status"], "ready")
        self.assertEqual(response["runtime_branch"], "24.08")
        install_args = next(
            call.args[0]
            for call in self.service._run_flatpak_command.call_args_list
            if call.args[0][0] == "install"
        )
        self.assertEqual(install_args[0], "install")
        self.assertIn("--user", install_args)
        self.assertNotIn("23.08", install_args)
        self.assertEqual(
            json.loads(self.service.ownership_path.read_text(encoding="utf-8")),
            {"version": 1, "plugin_owned_branches": ["24.08"]},
        )

    def test_two_shortcuts_using_one_flatpak_share_one_extension_branch(self):
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
        self.user_branches = {"23.08", "24.08"}

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
