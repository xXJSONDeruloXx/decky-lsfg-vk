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

from lsfg_vk.steam_service import SteamService, classify_shortcut_transport


class SteamTransportTests(unittest.TestCase):
    def test_only_direct_canonical_flatpak_forms_are_classified(self):
        self.assertEqual(
            classify_shortcut_transport(
                "/usr/bin/flatpak",
                "run com.example.PCSX2 --fullscreen",
            ),
            {"kind": "flatpak", "flatpakAppId": "com.example.PCSX2"},
        )
        self.assertEqual(
            classify_shortcut_transport(
                "flatpak",
                "run com.example.PCSX2 --fullscreen",
            ),
            {"kind": "flatpak", "flatpakAppId": "com.example.PCSX2"},
        )
        self.assertEqual(
            classify_shortcut_transport(
                "/usr/bin/flatpak run com.example.PCSX2",
                "--fullscreen",
            ),
            {"kind": "flatpak", "flatpakAppId": "com.example.PCSX2"},
        )
        self.assertEqual(
            classify_shortcut_transport(
                "/usr/bin/bash",
                "~/launch-game.sh --fullscreen",
            ),
            {"kind": "host"},
        )
        self.assertEqual(
            classify_shortcut_transport(
                "/usr/bin/flatpak",
                "--user run com.example.PCSX2",
            ),
            {"kind": "host"},
        )
        self.assertEqual(
            classify_shortcut_transport(
                "/usr/bin/flatpak",
                "run bash ~/launch-game.sh",
            ),
            {"kind": "host"},
        )
        self.assertEqual(
            classify_shortcut_transport(
                "~/.lsfg",
                "run --branch=stable --arch=x86_64 com.example.PCSX2",
            ),
            {"kind": "flatpak", "flatpakAppId": "com.example.PCSX2"},
        )
        self.assertEqual(
            classify_shortcut_transport(
                "/home/deck/.lsfg",
                "run com.example.PCSX2",
            ),
            {"kind": "flatpak", "flatpakAppId": "com.example.PCSX2"},
        )
        self.assertEqual(
            classify_shortcut_transport("~/.lsfg", "--profile high"),
            {"kind": "host"},
        )

    def test_shortcut_data_preserves_transport_inputs(self):
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
        self.assertEqual(game["transport"], {
            "kind": "flatpak",
            "flatpakAppId": "net.pcsx2.PCSX2",
        })
        self.assertEqual(game["executable"], "/usr/bin/flatpak")
        self.assertEqual(game["arguments"], "run net.pcsx2.PCSX2 --fullscreen")
        self.assertEqual(game["startDir"], "/home/deck/Games")

    def test_wrapped_flatpak_shortcut_remains_a_flatpak_target(self):
        game = SteamService._shortcut_game(
            {
                "appid": 987654,
                "AppName": "Wrapped Flatpak",
                "Exe": "~/.lsfg",
                "LaunchOptions": "run --branch=stable --arch=x86_64 com.example.Game",
            }
        )

        self.assertEqual(game["transport"], {
            "kind": "flatpak",
            "flatpakAppId": "com.example.Game",
        })


if __name__ == "__main__":
    unittest.main()
