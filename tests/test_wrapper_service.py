import os
import subprocess
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

from lsfg_vk.wrapper_service import WrapperService


class WrapperServiceTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.home = Path(self.tempdir.name) / "home" / "deck"
        self.home.mkdir(parents=True)
        self.service = WrapperService()
        self.service.user_home = self.home
        self.service.local_bin_dir = self.home / ".local/bin"
        self.service.config_dir = self.home / ".config/lsfg-vk"
        self.service.sidecar_path = self.service.config_dir / "workarounds.json"
        self.service.wrapper_path = self.service.local_bin_dir / "lsfg"

    def tearDown(self):
        self.tempdir.cleanup()

    def _state(self, **changes):
        state = self.service.default_state()
        state.update(changes)
        return state

    def _run(self, appid, *args, env=None):
        process_env = {"PATH": "/usr/bin:/bin", "SteamAppId": str(appid)}
        if env:
            process_env.update(env)
        return subprocess.run(
            [str(self.service.wrapper_path), *args],
            env=process_env,
            capture_output=True,
            text=True,
            check=True,
        )

    def test_writes_owned_dispatcher_and_validates_shell(self):
        response = self.service.set("123", self._state(dxvkFrameRate=60, enableZink=True))
        self.assertTrue(response["success"])
        self.assertEqual(response["wrapper_path"], "~/.lsfg")
        self.assertTrue(response["wrapper_owned"])
        self.assertEqual(response["state"]["dxvkFrameRate"], 60)
        self.assertEqual(subprocess.run(["/bin/sh", "-n", str(self.service.wrapper_path)]).returncode, 0)
        self.assertIn(self.service.MARKER, self.service.wrapper_path.read_text(encoding="utf-8"))
        self.assertEqual(self.service.get("123")["state"], self._state(dxvkFrameRate=60, enableZink=True))

    def test_dispatch_clears_managed_values_preserves_other_environment_and_appends_config(self):
        self.service.set(
            "123",
            self._state(dxvkFrameRate=30, disableSteamdeckMode=True, disableVkbasalt=True, enableZink=True),
        )
        result = self._run(
            123,
            "/usr/bin/env",
            env={
                "DXVK_CONFIG": "dxgi.syncInterval = 0",
                "DXVK_FRAME_RATE": "5",
                "ENABLE_GAMESCOPE_WSI": "1",
                "DISABLE_VKBASALT": "0",
                "MESA_LOADER_DRIVER_OVERRIDE": "llvmpipe",
                "MANGOHUD": "1",
            },
        )
        values = dict(line.split("=", 1) for line in result.stdout.splitlines() if "=" in line)
        self.assertEqual(values["ENABLE_GAMESCOPE_WSI"], "0")
        self.assertEqual(values["DXVK_HDR"], "0")
        self.assertEqual(values["SteamDeck"], "0")
        self.assertEqual(values["DISABLE_VKBASALT"], "1")
        self.assertEqual(values["__GLX_VENDOR_LIBRARY_NAME"], "mesa")
        self.assertEqual(values["MESA_LOADER_DRIVER_OVERRIDE"], "zink")
        self.assertEqual(values["GALLIUM_DRIVER"], "zink")
        self.assertEqual(values["DXVK_CONFIG"], "dxgi.syncInterval = 0; dxvk.maxFrameRate = 30")
        self.assertEqual(values["MANGOHUD"], "1")
        self.assertNotIn("DXVK_FRAME_RATE", values)
        self.assertNotIn("ENABLE_VKBASALT", values)

    def test_appid_fallback_and_unmatched_passthrough(self):
        self.service.set("123", self._state(disableGamescopeWsi=False, disableHdr=False))
        self.service.set("456", self._state(disableSteamdeckMode=True))
        fallback = subprocess.run(
            [str(self.service.wrapper_path), "/usr/bin/env"],
            env={"PATH": "/usr/bin:/bin", "SteamAppId": "bad", "SteamGameId": "456"},
            capture_output=True,
            text=True,
            check=True,
        )
        fallback_values = dict(line.split("=", 1) for line in fallback.stdout.splitlines() if "=" in line)
        self.assertEqual(fallback_values["SteamDeck"], "0")
        self.assertEqual(fallback_values["SteamGameId"], "456")

        passthrough = subprocess.run(
            [str(self.service.wrapper_path), "/usr/bin/env"],
            env={"PATH": "/usr/bin:/bin", "SteamAppId": "999", "KEEP": "yes", "DXVK_HDR": "1"},
            capture_output=True,
            text=True,
            check=True,
        )
        passthrough_values = dict(line.split("=", 1) for line in passthrough.stdout.splitlines() if "=" in line)
        self.assertEqual(passthrough_values["KEEP"], "yes")
        self.assertEqual(passthrough_values["DXVK_HDR"], "1")

    def test_flatpak_shortcut_receives_env_arguments_and_original_target(self):
        fake_flatpak = self.home / ".local/bin/flatpak"
        fake_flatpak.parent.mkdir(parents=True, exist_ok=True)
        fake_flatpak.write_text(
            "#!/bin/sh\n"
            "printf 'ARG:%s\\n' \"$@\"\n",
            encoding="utf-8",
        )
        fake_flatpak.chmod(0o755)
        self.service.set("123", self._state(dxvkFrameRate=20, enableZink=True), str(fake_flatpak))
        result = self._run(123, "run", "com.example.Game", "--windowed", env={"DXVK_CONFIG": "foo=1"})
        args = result.stdout.splitlines()
        self.assertEqual(args[0], "ARG:run")
        self.assertIn("ARG:--env=SteamAppId=123", args)
        self.assertIn("ARG:--env=ENABLE_GAMESCOPE_WSI=0", args)
        self.assertIn("ARG:--env=DXVK_HDR=0", args)
        self.assertIn("ARG:--env=__GLX_VENDOR_LIBRARY_NAME=mesa", args)
        self.assertIn("ARG:--env=MESA_LOADER_DRIVER_OVERRIDE=zink", args)
        self.assertIn("ARG:--env=GALLIUM_DRIVER=zink", args)
        self.assertIn("ARG:--env=DXVK_CONFIG=foo=1; dxvk.maxFrameRate = 20", args)
        self.assertIn("ARG:com.example.Game", args)
        self.assertIn("ARG:--windowed", args)

    def test_invalid_state_and_foreign_wrapper_fail_closed(self):
        invalid = self.service.set("0", self.service.default_state())
        self.assertFalse(invalid["success"])
        invalid = self.service.set("123", {**self.service.default_state(), "dxvkFrameRate": 61})
        self.assertFalse(invalid["success"])

        self.service.local_bin_dir.mkdir(parents=True, exist_ok=True)
        self.service.wrapper_path.write_text("#!/bin/sh\necho foreign\n", encoding="utf-8")
        response = self.service.set("123", self.service.default_state())
        self.assertFalse(response["success"])
        self.assertIn("unowned", response["error"])
        self.assertEqual(self.service.wrapper_path.read_text(encoding="utf-8"), "#!/bin/sh\necho foreign\n")

    def test_remove_keeps_a_safe_owned_passthrough_wrapper(self):
        self.service.set("123", self.service.default_state())
        response = self.service.remove("123")
        self.assertTrue(response["success"])
        self.assertIsNone(self.service.get("123")["state"])
        self.assertTrue(self.service.wrapper_path.exists())
        result = subprocess.run(
            [str(self.service.wrapper_path), "/usr/bin/printf", "ok"],
            env={"PATH": "/usr/bin:/bin", "SteamAppId": "123"},
            capture_output=True,
            text=True,
            check=True,
        )
        self.assertEqual(result.stdout, "ok")


if __name__ == "__main__":
    unittest.main()
