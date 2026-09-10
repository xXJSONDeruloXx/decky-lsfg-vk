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


class SteamServiceTests(unittest.TestCase):
    def test_shortcut_data_is_host_only_and_preserves_launch_fields(self):
        game = SteamService._shortcut_game(
            {
                "appid": 123456,
                "AppName": "Native shortcut",
                "Exe": "/usr/bin/game",
                "LaunchOptions": "--fullscreen",
                "StartDir": "/home/deck/Games",
            }
        )

        self.assertEqual(game, {
            "appid": "123456",
            "name": "Native shortcut",
            "nonSteam": True,
            "executable": "/usr/bin/game",
            "arguments": "--fullscreen",
            "startDir": "/home/deck/Games",
        })

    def test_shortcut_data_accepts_missing_optional_launch_fields(self):
        game = SteamService._shortcut_game(
            {
                "appid": 987654,
                "AppName": "Game shortcut",
            }
        )

        self.assertEqual(game, {
            "appid": "987654",
            "name": "Game shortcut",
            "nonSteam": True,
        })


if __name__ == "__main__":
    unittest.main()
