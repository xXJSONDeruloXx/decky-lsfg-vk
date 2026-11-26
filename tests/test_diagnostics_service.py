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

from lsfg_vk.diagnostics_service import DiagnosticsService


class DiagnosticsServiceTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.home = Path(self.tempdir.name) / "home" / "deck"
        self.home.mkdir(parents=True)
        self.runtime = Mock()
        self.runtime.check_lossless_scaling.return_value = {"installed": True, "status": "ok"}
        self.runtime.is_healthy.return_value = True
        self.runtime._run.return_value = (0, "")
        self.steam = Mock()
        self.steam.get_branch_status.return_value = {
            "installed": True,
            "selected_branch": "lsfg-vk",
            "target_branch": "lsfg-vk",
            "needs_switch": False,
        }
        self.service = DiagnosticsService(
            logger=Mock(), runtime_service=self.runtime, steam_service=self.steam
        )
        self.service.user_home = self.home
        self.service.local_bin_dir = self.home / ".local/bin"
        self.service.local_lib_dir = self.home / ".local/lib"
        self.service.local_share_dir = self.home / ".local/share/vulkan/implicit_layer.d"
        self.service.config_file_path = self.home / ".config/lsfg-vk/conf.toml"

    def test_report_lists_missing_files_and_skips_validation(self):
        report = self.service.build_report()
        self.assertIn("decky-lsfg-vk diagnostics", report)
        self.assertIn("lsfg-vk-cli: missing", report)
        self.assertIn("Config validation: skipped (no config file)", report)

    def test_report_marks_present_files_and_validates_config(self):
        self.service.config_file_path.parent.mkdir(parents=True)
        self.service.config_file_path.write_text("version = 2\n")
        report = self.service.build_report()
        self.assertIn("conf.toml: present", report)
        self.assertIn("Config validation: ok", report)

    def test_report_masks_home_directory(self):
        self.runtime._run.return_value = (1, f"bad config at {self.home}/x")
        self.service.config_file_path.parent.mkdir(parents=True)
        self.service.config_file_path.write_text("x")
        report = self.service.build_report()
        self.assertNotIn(str(self.home), report)
        self.assertIn("~/x", report)

    def test_probe_failure_does_not_break_report(self):
        self.runtime.is_healthy.side_effect = RuntimeError("boom")
        result = self.service.get_report()
        self.assertTrue(result["success"])
        self.assertIn("Healthcheck: error (boom)", result["report"])


if __name__ == "__main__":
    unittest.main()
