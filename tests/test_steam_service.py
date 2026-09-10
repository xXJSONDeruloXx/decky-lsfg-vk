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

from lsfg_vk.steam_service import SteamService


class SteamShortcutTests(unittest.TestCase):
    def test_direct_flatpak_shortcut_is_ordinary_non_steam_metadata(self):
        game = SteamService._shortcut_game(
            {
                "appid": 123456,
                "AppName": "PCSX2 shortcut",
                "Exe": "/usr/bin/flatpak",
                "LaunchOptions": "run net.pcsx2.PCSX2 --fullscreen",
                "StartDir": "/home/deck/Games",
            }
        )

        self.assertEqual(game["appid"], "123456")
        self.assertEqual(game["name"], "PCSX2 shortcut")
        self.assertTrue(game["nonSteam"])
        self.assertNotIn("directFlatpak", game)
        self.assertNotIn("transport", game)
        self.assertEqual(game["executable"], "/usr/bin/flatpak")
        self.assertEqual(game["arguments"], "run net.pcsx2.PCSX2 --fullscreen")
        self.assertEqual(game["startDir"], "/home/deck/Games")

    def test_emudeck_launcher_is_ordinary_non_steam_metadata(self):
        game = SteamService._shortcut_game(
            {
                "appid": 987654,
                "AppName": "1080 Snowboarding",
                "Exe": '"/home/deck/Emulation/tools/launchers/retroarch.sh" -L core rom.z64',
                "LaunchOptions": "",
            }
        )

        self.assertEqual(game["appid"], "987654")
        self.assertTrue(game["nonSteam"])
        self.assertNotIn("directFlatpak", game)
        self.assertEqual(
            game["executable"],
            '"/home/deck/Emulation/tools/launchers/retroarch.sh" -L core rom.z64',
        )
        self.assertEqual(game["arguments"], "")

    def test_shortcut_rejects_invalid_identity(self):
        self.assertIsNone(SteamService._shortcut_game({"appid": 0, "AppName": "Bad"}))
        self.assertIsNone(SteamService._shortcut_game({"appid": 1, "AppName": ""}))
        self.assertIsNone(SteamService._shortcut_game("bad"))


if __name__ == "__main__":
    unittest.main()
