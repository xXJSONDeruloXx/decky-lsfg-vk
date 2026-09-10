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

from lsfg_vk.steam_service import SteamService, is_direct_flatpak_shortcut


class SteamShortcutTests(unittest.TestCase):
    def test_only_direct_flatpak_targets_are_special(self):
        self.assertTrue(is_direct_flatpak_shortcut("/usr/bin/flatpak"))
        self.assertTrue(is_direct_flatpak_shortcut("flatpak"))
        self.assertTrue(is_direct_flatpak_shortcut("/usr/bin/flatpak run com.example.Game"))
        self.assertTrue(is_direct_flatpak_shortcut('~/.lsfg "/usr/bin/flatpak"'))
        self.assertTrue(is_direct_flatpak_shortcut('~/lsfg "usr/bin/flatpak"'))
        self.assertTrue(is_direct_flatpak_shortcut('~/.local/bin/mako-run "/usr/bin/flatpak"'))
        self.assertFalse(is_direct_flatpak_shortcut("/usr/bin/bash"))
        self.assertFalse(is_direct_flatpak_shortcut("/home/deck/Emulation/tools/launchers/retroarch.sh"))
        self.assertFalse(is_direct_flatpak_shortcut("/home/deck/Emulation/tools/launchers/ppsspp.sh"))
        self.assertFalse(is_direct_flatpak_shortcut("/home/deck/AppImages/dusk.appimage"))

    def test_shortcut_data_preserves_launch_shape_without_flatpak_identity(self):
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
        self.assertTrue(game["directFlatpak"])
        self.assertNotIn("transport", game)
        self.assertEqual(game["executable"], "/usr/bin/flatpak")
        self.assertEqual(game["arguments"], "run net.pcsx2.PCSX2 --fullscreen")
        self.assertEqual(game["startDir"], "/home/deck/Games")

    def test_emudeck_launcher_is_ordinary_non_steam(self):
        game = SteamService._shortcut_game(
            {
                "appid": 987654,
                "AppName": "1080 Snowboarding",
                "Exe": '"/home/deck/Emulation/tools/launchers/retroarch.sh" -L core rom.z64',
                "LaunchOptions": "",
            }
        )

        self.assertFalse(game["directFlatpak"])
        self.assertEqual(
            game["executable"],
            '"/home/deck/Emulation/tools/launchers/retroarch.sh" -L core rom.z64',
        )


if __name__ == "__main__":
    unittest.main()
