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
sys.modules.setdefault("tomllib", types.SimpleNamespace(loads=Mock()))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "py_modules"))

from lsfg_vk.flatpak_service import FlatpakService


class FlatpakOverrideTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        home = Path(self.tempdir.name) / "home" / "deck"
        home.mkdir(parents=True)
        self.service = FlatpakService()
        self.service.user_home = home
        self.service.config_dir = home / ".config/lsfg-vk"
        self.service.config_file_path = self.service.config_dir / "conf.toml"
        self.service.legacy_script_path = home / "lsfg"
        self.service.check_flatpak_available = Mock(return_value=True)
        self.service._run_flatpak_command = Mock(
            return_value=types.SimpleNamespace(returncode=0, stderr="", stdout="")
        )
        self.app_id = "com.example.Game"
        self.override_path = self.service._override_file_path(self.app_id)

    def tearDown(self):
        self.tempdir.cleanup()
        sys.modules.pop("lsfg_vk.plugin", None)
        sys.modules.pop("lsfg_vk", None)

    def _paths(self):
        return self.service._override_paths()

    def _write_override(self, content):
        self.override_path.parent.mkdir(parents=True, exist_ok=True)
        self.override_path.write_text(content, encoding="utf-8")

    def _show_response(self, content):
        return types.SimpleNamespace(returncode=0, stderr="", stdout=content)

    def test_set_cleans_legacy_entries_and_verifies_readback(self):
        paths = self._paths()
        self._write_override(
            "[Context]\n"
            f"filesystems=/home/deck/keep;{paths['config_dir']}:rw;!{paths['legacy_home']};"
            f"{paths['legacy_script']};{paths['legacy_dll']}:ro;{paths['dll_dir']}:ro;\n"
            "unset-environment=KEEP_UNSET;LSFG_CONFIG;\n\n"
            "[Environment]\n"
            "KEEP_ENV=1\n"
            "LSFG_CONFIG=\n"
            "LSFGVK_CONFIG=old\n"
            "ENABLE_GAMESCOPE_WSI=1\n"
            "DXVK_HDR=1\n"
        )
        expected = (
            "[Context]\n"
            f"filesystems={paths['config_dir']}:rw;{paths['dll_dir']}:ro\n"
            "[Environment]\n"
            f"LSFGVK_CONFIG={paths['config_file']}\n"
            "ENABLE_GAMESCOPE_WSI=0\n"
            "DXVK_HDR=0\n"
        )
        self.service._run_flatpak_command.side_effect = [
            self._show_response(""),
            self._show_response(expected),
        ]

        response = self.service.set_app_override(self.app_id)
        command_args = self.service._run_flatpak_command.call_args_list[0].args[0]
        cleaned = self.override_path.read_text(encoding="utf-8")

        self.assertTrue(response["success"])
        self.assertIn("--env=ENABLE_GAMESCOPE_WSI=0", command_args)
        self.assertIn("--env=DXVK_HDR=0", command_args)
        self.assertNotIn("--nofilesystem=/home/deck", command_args)
        self.assertNotIn("--unset-env=LSFG_CONFIG", command_args)
        self.assertIn("/home/deck/keep", cleaned)
        self.assertIn("KEEP_ENV=1", cleaned)
        self.assertNotIn("LSFG_CONFIG", cleaned)
        self.assertNotIn(paths["legacy_home"], cleaned)

    def test_set_reports_failed_readback(self):
        paths = self._paths()
        self.service._run_flatpak_command.side_effect = [
            self._show_response(""),
            self._show_response(
                f"[Context]\nfilesystems={paths['config_dir']};{paths['dll_dir']}\n"
                f"[Environment]\nLSFGVK_CONFIG={paths['config_file']}\n"
            ),
        ]

        response = self.service.set_app_override(self.app_id)

        self.assertFalse(response["success"])
        self.assertIn("verified", response["error"])

    def test_remove_cleans_known_entries_preserves_unrelated_and_verifies(self):
        paths = self._paths()
        self._write_override(
            "[Context]\n"
            f"filesystems=/home/deck/keep;{paths['config_dir']};!{paths['legacy_home']};"
            f"{paths['legacy_dll']};{paths['legacy_script']}\n"
            "unset-environment=KEEP_UNSET;LSFG_CONFIG;ENABLE_GAMESCOPE_WSI\n\n"
            "[Environment]\n"
            "KEEP_ENV=1\n"
            "LSFGVK_CONFIG=/old/path\n"
            "DXVK_HDR=0\n"
        )
        self.service._run_flatpak_command.side_effect = [
            self._show_response(
                "[Context]\nfilesystems=/home/deck/keep\n"
                "[Environment]\nKEEP_ENV=1\n"
            )
        ]

        response = self.service.remove_app_override(self.app_id)
        cleaned = self.override_path.read_text(encoding="utf-8")

        self.assertTrue(response["success"])
        self.assertEqual(self.service._run_flatpak_command.call_count, 1)
        self.assertIn("/home/deck/keep", cleaned)
        self.assertIn("KEEP_UNSET", cleaned)
        self.assertIn("KEEP_ENV", cleaned)
        for name in ("LSFGVK_CONFIG", "LSFG_CONFIG", "ENABLE_GAMESCOPE_WSI", "DXVK_HDR"):
            self.assertNotIn(name, cleaned)
        for path in paths.values():
            if path != paths["config_file"]:
                self.assertNotIn(path, cleaned)

    def test_remove_reports_failed_readback(self):
        self._write_override("[Context]\nfilesystems=/home/deck/keep\n")
        paths = self._paths()
        self.service._run_flatpak_command.side_effect = [
            self._show_response(
                f"[Context]\nfilesystems={paths['config_dir']};{paths['dll_dir']}\n"
                f"[Environment]\nLSFGVK_CONFIG={paths['config_file']}\n"
                "ENABLE_GAMESCOPE_WSI=0\nDXVK_HDR=0\n"
            )
        ]

        response = self.service.remove_app_override(self.app_id)

        self.assertFalse(response["success"])
        self.assertIn("verified", response["error"])


if __name__ == "__main__":
    unittest.main()
