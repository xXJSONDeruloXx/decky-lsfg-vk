import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


sys.modules.setdefault(
    "decky",
    types.SimpleNamespace(DECKY_USER_HOME="/home/deck", logger=Mock()),
)
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "py_modules"))

from lsfg_vk.steam_service import SteamService


class SteamShortcutTests(unittest.TestCase):
    def test_direct_flatpak_shortcut_is_marked(self):
        game = SteamService._shortcut_game(
            {
                "appid": 123456,
                "AppName": "PCSX2 shortcut",
                "Exe": "/usr/bin/flatpak",
                "LaunchOptions": "run net.pcsx2.PCSX2 --fullscreen",
                "StartDir": "/home/deck/Games",
            }
        )

        self.assertEqual(game, {
            "appid": "123456",
            "name": "PCSX2 shortcut",
            "nonSteam": True,
            "isFlatpakShortcut": True,
        })

    def test_bare_flatpak_shortcut_is_marked(self):
        game = SteamService._shortcut_game(
            {
                "appid": 654321,
                "AppName": "Faugus shortcut",
                "Exe": '"flatpak"',
                "LaunchOptions": "run io.github.Faugus.faugus-launcher --game elliot",
            }
        )

        self.assertEqual(game, {
            "appid": "654321",
            "name": "Faugus shortcut",
            "nonSteam": True,
            "isFlatpakShortcut": True,
        })

    def test_emudeck_launcher_is_ordinary_non_steam_metadata(self):
        game = SteamService._shortcut_game(
            {
                "appid": 987654,
                "AppName": "1080 Snowboarding",
                "Exe": '"/home/deck/Emulation/tools/launchers/retroarch.sh" -L core rom.z64',
                "LaunchOptions": "",
            }
        )

        self.assertEqual(game, {
            "appid": "987654",
            "name": "1080 Snowboarding",
            "nonSteam": True,
        })

    def test_shortcut_rejects_invalid_identity(self):
        self.assertIsNone(SteamService._shortcut_game({"appid": 0, "AppName": "Bad"}))
        self.assertIsNone(SteamService._shortcut_game({"appid": 1, "AppName": ""}))
        self.assertIsNone(SteamService._shortcut_game("bad"))


class FindDllTests(unittest.TestCase):
    def _service_with_library(self, root: Path) -> SteamService:
        service = SteamService(logger=Mock())
        patcher = patch.object(SteamService, "_steam_library_roots", return_value=[root])
        patcher.start()
        self.addCleanup(patcher.stop)
        return service

    def test_dll_is_used_even_when_the_manifest_says_another_branch(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            game = root / "steamapps/common/Lossless Scaling"
            game.mkdir(parents=True)
            (game / "lsfg-vk.dll").write_bytes(b"dll")
            (root / "steamapps/appmanifest_993090.acf").write_text(
                '"AppState"\n{\n\t"UserConfig"\n\t{\n\t\t"BetaKey"\t\t"public"\n\t}\n}\n',
                encoding="utf-8",
            )
            service = self._service_with_library(root)

            self.assertTrue(service.get_branch_status()["needs_switch"])
            self.assertEqual(service.find_lsfg_vk_dll(), str(game / "lsfg-vk.dll"))

    def test_no_dll_when_the_file_is_absent(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "steamapps/common/Lossless Scaling").mkdir(parents=True)
            self.assertIsNone(self._service_with_library(root).find_lsfg_vk_dll())

    def test_no_dll_when_lossless_scaling_is_not_installed(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertIsNone(self._service_with_library(Path(tmp)).find_lsfg_vk_dll())


if __name__ == "__main__":
    unittest.main()
