import tempfile
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
    def test_only_a_direct_usr_bin_flatpak_target_is_special(self):
        self.assertEqual(
            classify_shortcut_transport("/usr/bin/flatpak", "run com.example.Game --fullscreen"),
            {"kind": "flatpak"},
        )
        for executable, options in (
            ("flatpak", "run com.example.Game"),
            ("/usr/bin/flatpak run com.example.Game", "--fullscreen"),
            ("~/.lsfg", "run com.example.Game"),
            ("/usr/bin/bash", "~/launch-game.sh --fullscreen"),
        ):
            with self.subTest(executable=executable, options=options):
                self.assertEqual(classify_shortcut_transport(executable, options), {"kind": "host"})

        self.assertEqual(
            classify_shortcut_transport("/usr/bin/flatpak", "--user run com.example.Game"),
            {"kind": "flatpak"},
        )
        self.assertEqual(
            classify_shortcut_transport('"~/.lsfg" "/usr/bin/flatpak"', "run com.example.Game"),
            {"kind": "flatpak"},
        )
        self.assertEqual(classify_shortcut_transport("~/.lsfg", "run com.example.Game"), {"kind": "host"})

    def test_direct_flatpak_shortcut_keeps_arguments_without_an_app_id(self):
        game = SteamService._shortcut_game(
            {
                "appid": 123456,
                "AppName": "Flatpak shortcut",
                "Exe": "/usr/bin/flatpak",
                "LaunchOptions": "run net.pcsx2.PCSX2 --fullscreen",
                "StartDir": "/home/deck/Games",
            }
        )

        self.assertEqual(game["transport"], {"kind": "flatpak"})
        self.assertEqual(game["executable"], "/usr/bin/flatpak")
        self.assertEqual(game["arguments"], "run net.pcsx2.PCSX2 --fullscreen")
        self.assertEqual(game["startDir"], "/home/deck/Games")

    def test_shell_targets_are_opaque_host_targets(self):
        game = SteamService._shortcut_game(
            {
                "appid": 654321,
                "AppName": "EmuDeck-style launcher",
                "Exe": "/usr/bin/bash",
                "LaunchOptions": "~/Emulators/launch-game.sh --game-id foo",
            }
        )

        self.assertEqual(game["transport"], {"kind": "host"})

    def test_normal_steam_manifest_always_uses_host_transport(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            steamapps = home / ".local/share/Steam/steamapps"
            steamapps.mkdir(parents=True)
            (steamapps / "appmanifest_123.acf").write_text(
                '"AppState" {\n\t"name" "Steam game"\n}\n',
                encoding="utf-8",
            )
            service = SteamService()
            service.user_home = home

            response = service.get_installed_games()

            self.assertTrue(response["success"])
            self.assertEqual(response["games"], [{
                "appid": "123",
                "name": "Steam game",
                "nonSteam": False,
                "transport": {"kind": "host"},
            }])


if __name__ == "__main__":
    unittest.main()
