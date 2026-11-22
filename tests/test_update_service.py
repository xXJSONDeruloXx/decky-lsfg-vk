import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock


sys.modules.setdefault(
    "decky",
    types.SimpleNamespace(DECKY_USER_HOME="/home/deck", logger=Mock()),
)
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "py_modules"))

from lsfg_vk.update_service import UpdateService, is_newer, parse_latest_release

PAGE = """<table>
<tr><td><a href="lsfg-vk-2.0.0.r19.gbdcea47.tar.xz">&gt;&gt; Latest git version (2.0.0.r19.gbdcea47) &lt;&lt;</a></td></tr>
<tr><td><a href="lsfg-vk-2.0.0.tar.xz">&gt;&gt; Latest release candidate (2.0.0) &lt;&lt;</a></td></tr>
<tr><td><a href="lsfg-vk-{v}.tar.xz">&gt;&gt; Latest release ({v}) &lt;&lt;</a></td></tr>
</table>"""


class UpdateServiceTests(unittest.TestCase):
    def test_parses_only_the_stable_release_line(self):
        self.assertEqual(parse_latest_release(PAGE.format(v="2.1.0")), "2.1.0")
        self.assertIsNone(parse_latest_release("<html>nothing here</html>"))

    def test_version_comparison_is_numeric_not_textual(self):
        self.assertTrue(is_newer("2.10.0", "2.9.0"))
        self.assertTrue(is_newer("3.0.0", "2.9.9"))
        self.assertFalse(is_newer("2.0.0", "2.0.0"))
        self.assertFalse(is_newer("1.9.9", "2.0.0"))

    def test_reports_an_available_update(self):
        service = UpdateService(logger=Mock(), fetch=lambda: PAGE.format(v="2.1.0"))
        result = service.check()
        self.assertTrue(result["success"])
        self.assertTrue(result["update_available"])
        self.assertEqual((result["installed_version"], result["latest_version"]), ("2.0.0", "2.1.0"))

    def test_up_to_date_when_versions_match(self):
        service = UpdateService(logger=Mock(), fetch=lambda: PAGE.format(v="2.0.0"))
        self.assertFalse(service.check()["update_available"])

    def test_result_is_cached_until_forced(self):
        fetch = Mock(return_value=PAGE.format(v="2.0.0"))
        service = UpdateService(logger=Mock(), fetch=fetch)
        service.check()
        service.check()
        self.assertEqual(fetch.call_count, 1)
        service.check(force=True)
        self.assertEqual(fetch.call_count, 2)

    def test_network_failure_is_reported_without_raising(self):
        service = UpdateService(logger=Mock(), fetch=Mock(side_effect=OSError("offline")))
        result = service.check()
        self.assertFalse(result["success"])
        self.assertFalse(result["update_available"])
        self.assertIn("offline", result["error"])

    def test_unrecognised_page_is_an_error(self):
        service = UpdateService(logger=Mock(), fetch=lambda: "<html>redesigned</html>")
        self.assertFalse(service.check()["success"])


if __name__ == "__main__":
    unittest.main()
