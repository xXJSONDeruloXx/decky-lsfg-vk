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
        self.service.config_dir.mkdir(parents=True)
        self.service.config_file_path = self.service.config_dir / "conf.toml"
        self.service.check_flatpak_available = Mock(return_value=True)
        self.service._run_flatpak_command = Mock(side_effect=self._run_flatpak_command)
        self.user_branches = set()
        self.system_branches = set()
        self.filesystems = {}
        self.service._bundled_extension_path = Mock(
            side_effect=lambda branch: self._bundle(branch)
        )

    def tearDown(self):
        self.tempdir.cleanup()

    @staticmethod
    def _result(stdout="", returncode=0, stderr=""):
        return types.SimpleNamespace(stdout=stdout, returncode=returncode, stderr=stderr)

    @staticmethod
    def _extension_line(branch):
        return f"org.freedesktop.Platform.VulkanLayer.lsfgvk\tx86_64\t{branch}\n"

    def _bundle(self, branch):
        path = self.home / f"lsfg-vk-{branch}.flatpak"
        path.write_bytes(b"bundle")
        return path

    def _override_output(self):
        if not self.filesystems:
            return ""
        values = ";".join(
            f"{path}:{mode}" for path, mode in sorted(self.filesystems.items())
        )
        return f"[Context]\nfilesystems={values};\n"

    def _run_flatpak_command(self, args, **_kwargs):
        if args[0] == "list":
            branches = self.user_branches if "--user" in args else self.system_branches
            return self._result("".join(self._extension_line(branch) for branch in sorted(branches)))
        if args[0] == "install":
            bundle = Path(args[-1])
            self.user_branches.add(bundle.stem.removeprefix("lsfg-vk-"))
            return self._result()
        if args[0] == "uninstall":
            self.user_branches.discard(args[-1].rsplit("/", 1)[-1])
            return self._result()
        if args[0] == "override" and "--show" in args:
            return self._result(self._override_output())
        if args[0] == "override":
            filesystem = next(
                (arg.removeprefix("--filesystem=") for arg in args if arg.startswith("--filesystem=")),
                None,
            )
            if filesystem is not None:
                path, _, mode = filesystem.rpartition(":")
                self.filesystems[path] = mode
                return self._result()
            filesystem = next(
                (arg.removeprefix("--nofilesystem=") for arg in args if arg.startswith("--nofilesystem=")),
                None,
            )
            if filesystem is not None:
                self.filesystems.pop(filesystem, None)
                return self._result()
        raise AssertionError(f"Unexpected Flatpak command: {args}")

    def _mutating_commands(self):
        return [
            call.args[0]
            for call in self.service._run_flatpak_command.call_args_list
            if call.args[0][0] in {"install", "uninstall", "override"}
            and "--show" not in call.args[0]
        ]

    def test_ensure_installs_all_bundled_branches_and_exact_read_only_grants(self):
        configured_dll = self.home / "Games" / "Lossless Scaling" / "lsfg-vk.dll"
        self.service.config_file_path.write_text(
            f'version = 2\n[global]\ndll = {json.dumps(str(configured_dll))}\n',
            encoding="utf-8",
        )

        response = self.service.ensure_plugin_support()

        self.assertTrue(response["success"])
        self.assertTrue(response["ready"])
        self.assertEqual(response["installed_branches"], ["23.08", "24.08", "25.08"])
        expected_grants = {str(self.service.config_dir), str(configured_dll.parent)}
        self.assertEqual(set(self.filesystems), expected_grants)
        self.assertEqual(set(self.filesystems.values()), {"ro"})
        metadata = json.loads(self.service.ownership_path.read_text(encoding="utf-8"))
        self.assertEqual(metadata["version"], 2)
        self.assertEqual(metadata["plugin_owned_branches"], ["23.08", "24.08", "25.08"])
        self.assertEqual(set(metadata["plugin_owned_filesystems"]), expected_grants)
        installs = [command for command in self._mutating_commands() if command[0] == "install"]
        grants = [command for command in self._mutating_commands() if "--filesystem=" in " ".join(command)]
        self.assertEqual(len(installs), 3)
        self.assertEqual(len(grants), 2)
        self.assertNotIn("--filesystem=/home", " ".join(" ".join(command) for command in grants))
        self.assertNotIn("--filesystem=--", " ".join(" ".join(command) for command in grants))

    def test_repeated_setup_is_a_no_op_when_state_is_correct(self):
        self.assertTrue(self.service.ensure_plugin_support()["success"])
        self.service._run_flatpak_command.reset_mock()

        response = self.service.ensure_plugin_support()

        self.assertTrue(response["success"])
        self.assertTrue(response["ready"])
        self.assertFalse(self._mutating_commands())

    def test_preexisting_branches_and_grants_are_not_claimed_or_removed(self):
        self.user_branches = {"23.08"}
        self.system_branches = {"24.08"}
        preexisting_config = str(self.service.config_dir)
        self.filesystems[preexisting_config] = "ro"

        setup = self.service.ensure_plugin_support()
        cleanup = self.service.remove_plugin_owned_extensions()

        self.assertTrue(setup["success"])
        self.assertTrue(cleanup["success"])
        self.assertEqual(self.user_branches, {"23.08"})
        self.assertEqual(self.system_branches, {"24.08"})
        self.assertEqual(self.filesystems, {preexisting_config: "ro"})
        self.assertFalse(self.service.ownership_path.exists())
        repeat = self.service.remove_plugin_owned_extensions()
        self.assertTrue(repeat["success"])

    def test_uninstall_removes_plugin_owned_state_and_preserves_unrelated_override(self):
        unrelated = str(self.home / "Games" / "Other")
        self.filesystems[unrelated] = "ro"

        self.assertTrue(self.service.ensure_plugin_support()["success"])
        cleanup = self.service.remove_plugin_owned_extensions()

        self.assertTrue(cleanup["success"])
        self.assertEqual(cleanup["removed_branches"], ["23.08", "24.08", "25.08"])
        self.assertEqual(set(cleanup["removed_filesystem_grants"]), {
            str(self.service.config_dir),
            str(self.home / ".local/share/Steam/steamapps/common/Lossless Scaling"),
        })
        self.assertEqual(self.user_branches, set())
        self.assertEqual(self.filesystems, {unrelated: "ro"})
        self.assertFalse(self.service.ownership_path.exists())

    def test_cleanup_is_idempotent_after_owned_state_is_gone(self):
        self.assertTrue(self.service.ensure_plugin_support()["success"])
        self.assertTrue(self.service.remove_plugin_owned_extensions()["success"])
        self.service._run_flatpak_command.reset_mock()

        response = self.service.remove_plugin_owned_extensions()

        self.assertTrue(response["success"])
        self.assertFalse(response["ownership_uncertain"])
        self.assertEqual(self.service._run_flatpak_command.call_count, 0)

    def test_changed_owned_grant_is_preserved_and_metadata_is_retained(self):
        self.assertTrue(self.service.ensure_plugin_support()["success"])
        config_path = str(self.service.config_dir)
        self.filesystems[config_path] = "rw"

        response = self.service.remove_plugin_owned_extensions()

        self.assertFalse(response["success"])
        self.assertEqual(self.filesystems[config_path], "rw")
        self.assertTrue(self.service.ownership_path.exists())
        remaining = json.loads(self.service.ownership_path.read_text(encoding="utf-8"))
        self.assertIn(config_path, remaining["plugin_owned_filesystems"])

    def test_corrupt_ownership_metadata_fails_closed_without_flatpak_commands(self):
        self.service.ownership_path.write_text("{not-json", encoding="utf-8")

        response = self.service.remove_plugin_owned_extensions()

        self.assertFalse(response["success"])
        self.assertTrue(response["ownership_uncertain"])
        self.assertEqual(self.service._run_flatpak_command.call_count, 0)

    def test_global_override_parser_handles_permissions_and_unrelated_entries(self):
        parsed = FlatpakService._parse_filesystems(
            "[Context]\nfilesystems=/home/deck/config:ro;/home/deck/other:rw;/tmp/create:create;\n"
        )

        self.assertEqual(parsed, {
            "/home/deck/config": "ro",
            "/home/deck/other": "rw",
            "/tmp/create": "create",
        })


if __name__ == "__main__":
    unittest.main()
