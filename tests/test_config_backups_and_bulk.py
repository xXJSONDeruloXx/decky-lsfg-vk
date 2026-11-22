import os
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

from lsfg_vk.configuration import ConfigurationService


class ConfigBackupAndBulkTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.home = Path(self.tempdir.name) / "home" / "deck"
        self.home.mkdir(parents=True)
        self.service = ConfigurationService(logger=Mock(), runtime_service=Mock())
        self.service.user_home = self.home
        self.service.config_dir = self.home / ".config/lsfg-vk"
        self.service.config_file_path = self.service.config_dir / "conf.toml"

    def tearDown(self):
        self.tempdir.cleanup()

    def _age_backup(self, index=1, seconds=3600):
        path = self.service._backup_path(index)
        old = path.stat().st_mtime - seconds
        os.utime(path, (old, old))

    def test_first_save_has_nothing_to_back_up(self):
        self.service.update_game_config("1", "Game One", {"multiplier": 2})
        self.assertFalse(self.service.get_config_backup_info()["available"])

    def test_change_snapshots_the_previous_version_and_restore_undoes_it(self):
        self.service.update_game_config("1", "Game One", {"multiplier": 2})
        self.service.update_game_config("1", "Game One", {"multiplier": 3})

        self.assertTrue(self.service.get_config_backup_info()["available"])
        self.assertEqual(self.service.get_game_configs()["games"][0]["config"]["multiplier"], 3)

        self.assertTrue(self.service.restore_config_backup()["success"])
        self.assertEqual(self.service.get_game_configs()["games"][0]["config"]["multiplier"], 2)

        # restoring again swaps back, so the undo can itself be undone
        self.assertTrue(self.service.restore_config_backup()["success"])
        self.assertEqual(self.service.get_game_configs()["games"][0]["config"]["multiplier"], 3)

    def test_rapid_saves_do_not_overwrite_the_snapshot(self):
        self.service.update_game_config("1", "Game One", {"multiplier": 2})
        self.service.update_game_config("1", "Game One", {"multiplier": 3})
        for value in (4, 5, 6):
            self.service.update_game_config("1", "Game One", {"multiplier": value})

        self.service.restore_config_backup()
        self.assertEqual(self.service.get_game_configs()["games"][0]["config"]["multiplier"], 2)

    def test_old_snapshots_rotate_and_are_capped(self):
        multiplier = 2
        self.service.update_game_config("1", "Game One", {"multiplier": multiplier})
        for _ in range(6):
            multiplier = multiplier % 6 + 1
            self.service.update_game_config("1", "Game One", {"multiplier": multiplier})
            self._age_backup()

        backups = sorted(self.service.config_dir.glob("conf.toml.bak.*"))
        self.assertEqual(len(backups), self.service.BACKUP_COUNT)

    def test_restore_without_backup_fails_cleanly(self):
        result = self.service.restore_config_backup()
        self.assertFalse(result["success"])
        self.assertIn("no earlier", result["error"])

    def test_corrupt_backup_is_not_restored(self):
        self.service.update_game_config("1", "Game One", {"multiplier": 2})
        self.service.update_game_config("1", "Game One", {"multiplier": 3})
        self.service._backup_path(1).write_text("not = [valid", encoding="utf-8")

        self.assertFalse(self.service.restore_config_backup()["success"])
        self.assertEqual(self.service.get_game_configs()["games"][0]["config"]["multiplier"], 3)

    def test_apply_to_all_copies_tuning_but_not_identity(self):
        self.service.update_game_config("1", "Game One", {"multiplier": 2, "flow_scale": 0.8})
        self.service.update_game_config("2", "Game Two", {"multiplier": 2, "flow_scale": 0.8})
        self.service.update_flatpak_config("org.example.App", {"multiplier": 2})
        self.service.update_game_config(
            "1", "Game One",
            {"multiplier": 4, "flow_scale": 0.5, "performance_mode": True},
        )

        result = self.service.apply_config_to_all_games("1")

        self.assertEqual(result["updated"], 1)
        games = {game["appid"]: game["config"] for game in self.service.get_game_configs()["games"]}
        self.assertEqual(games["2"]["multiplier"], 4)
        self.assertEqual(games["2"]["flow_scale"], 0.5)
        self.assertTrue(games["2"]["performance_mode"])
        self.assertEqual(games["2"]["active_in"], ["2"])
        flatpak = self.service.get_flatpak_config("org.example.App")["config"]
        self.assertEqual(flatpak["multiplier"], 2)

    def test_apply_to_all_requires_a_source_profile(self):
        result = self.service.apply_config_to_all_games("999")
        self.assertFalse(result["success"])
        self.assertEqual(result["updated"], 0)


if __name__ == "__main__":
    unittest.main()
