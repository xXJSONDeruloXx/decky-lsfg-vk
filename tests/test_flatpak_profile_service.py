import hashlib
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
from lsfg_vk.flatpak_profile_service import FlatpakProfileService


class FakeFlatpakService:
    def __init__(self, home: Path):
        self.user_home = home
        self.config_dir = home / ".config/lsfg-vk"
        self.config_file_path = self.config_dir / "conf.toml"
        self.backup_dir = self.config_dir / "flatpak-overrides"
        self.state = {"version": 2, "plugin_owned_branches": [], "prepared_apps": {}}
        self.commands = []
        self.running = ""

    def _read_state(self):
        return self.state

    def _write_state(self, state):
        self.state = state

    def _override_path(self, app_id):
        return self.user_home / ".local/share/flatpak/overrides" / app_id

    def _backup_path(self, app_id):
        return self.backup_dir / f"{app_id}.ini"

    @staticmethod
    def _sha256(content):
        return hashlib.sha256(content).hexdigest()

    def _snapshot_override(self, app_id):
        path = self._override_path(app_id)
        if not path.exists():
            return False, b""
        return True, path.read_bytes()

    @staticmethod
    def _write_file(path, content, mode=0o644):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        path.chmod(mode)

    def prepare_app(self, app_id):
        apps = self.state["prepared_apps"]
        if app_id not in apps:
            existed, original = self._snapshot_override(app_id)
            if existed:
                self._write_file(self._backup_path(app_id), original.decode("utf-8"))
            apps[app_id] = {"override_existed": existed, "managed_sha256": ""}
        entry = apps[app_id]
        baseline = ""
        if entry["override_existed"]:
            baseline = self._backup_path(app_id).read_text(encoding="utf-8")
        managed = baseline + "\n[Context]\nfilesystems=/config:ro;/dll:ro;\n[Environment]\nLSFGVK_CONFIG=/config/conf.toml\nLSFGVK_FLATPAK=1\n"
        self._write_file(self._override_path(app_id), managed)
        entry["managed_sha256"] = self._sha256(managed.encode())
        return {"success": True, "owned": True, "prepared": True, "runtime": "org.freedesktop.Platform/x86_64/24.08", "runtime_branch": "24.08"}

    def remove_app_override(self, app_id):
        entry = self.state["prepared_apps"].get(app_id)
        if entry is None:
            return {"success": True, "prepared": False, "owned": False}
        existed, current = self._snapshot_override(app_id)
        current_hash = self._sha256(current) if existed else self._sha256(b"")
        if current_hash != entry["managed_sha256"]:
            return {"success": False, "error": "Flatpak override changed after preparation"}
        path = self._override_path(app_id)
        backup = self._backup_path(app_id)
        if entry["override_existed"]:
            self._write_file(path, backup.read_text(encoding="utf-8"))
        else:
            path.unlink(missing_ok=True)
        backup.unlink(missing_ok=True)
        self.state["prepared_apps"].pop(app_id)
        return {"success": True, "prepared": False, "owned": False}

    def get_flatpak_apps(self):
        app_id = "org.example.Game"
        return {
            "success": True,
            "apps": [{
                "app_id": app_id,
                "app_name": "Example Game",
                "runtime": "org.freedesktop.Platform/x86_64/24.08",
                "runtime_branch": "24.08",
                "runtime_ready": True,
                "prepared": app_id in self.state["prepared_apps"],
                "owned": app_id in self.state["prepared_apps"],
                "error": None,
            }],
        }

    def _run_flatpak_command(self, args, **_kwargs):
        self.commands.append(args)
        if args[:3] == ["override", "--user", "--show"]:
            path = self._override_path(args[3])
            return types.SimpleNamespace(returncode=0, stdout=path.read_text(encoding="utf-8") if path.exists() else "", stderr="")
        if args[0] == "override":
            app_id = args[-1]
            path = self._override_path(app_id)
            content = path.read_text(encoding="utf-8") if path.exists() else ""
            env = [item.removeprefix("--env=") for item in args if item.startswith("--env=")]
            unset = [item.removeprefix("--unset-env=") for item in args if item.startswith("--unset-env=")]
            if unset:
                content += "\n[Context]\nunset-environment=" + ";".join(unset) + ";\n"
            if env:
                content += "\n[Environment]\n" + "\n".join(env) + "\n"
            self._write_file(path, content)
            return types.SimpleNamespace(returncode=0, stdout="", stderr="")
        if args[0] == "ps":
            return types.SimpleNamespace(returncode=0, stdout=self.running, stderr="")
        raise AssertionError(args)


class FlatpakProfileServiceTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.home = Path(self.tempdir.name) / "home" / "deck"
        self.home.mkdir(parents=True)
        self.flatpak = FakeFlatpakService(self.home)
        self.runtime = Mock()
        self.configuration = ConfigurationService(runtime_service=self.runtime)
        self.configuration.user_home = self.home
        self.configuration.config_dir = self.flatpak.config_dir
        self.configuration.config_file_path = self.flatpak.config_file_path
        self.service = FlatpakProfileService(self.flatpak, self.configuration)
        self.app_id = "org.example.Game"

    def tearDown(self):
        self.tempdir.cleanup()

    def test_enable_creates_selector_profile_and_default_workarounds(self):
        result = self.service.enable_app(self.app_id)
        config = self.configuration.get_flatpak_config(self.app_id)
        content = self.flatpak._override_path(self.app_id).read_text(encoding="utf-8")

        self.assertTrue(result["success"])
        self.assertTrue(config["exists"])
        self.assertEqual(config["profile"], "flatpak:org.example.Game")
        self.assertEqual(config["config"]["active_in"], [])
        self.assertIn("LSFGVK_PROFILE=flatpak:org.example.Game", content)
        self.assertIn("ENABLE_GAMESCOPE_WSI=0", content)
        self.assertIn("DXVK_HDR=0", content)

    def test_workaround_update_rebuilds_from_original_override(self):
        baseline = "[Environment]\nDXVK_CONFIG=dxgi.syncInterval = 0\nKEEP=yes\n"
        self.flatpak._write_file(self.flatpak._override_path(self.app_id), baseline)
        self.assertTrue(self.service.enable_app(self.app_id)["success"])

        state = self.service.default_state()
        state.update({"dxvkFrameRate": 30, "disableHdr": False, "enableZink": True})
        result = self.service.set_workaround_state(self.app_id, state)
        command = next(
            args for args in reversed(self.flatpak.commands)
            if args[0] == "override" and any(item.startswith("--env=LSFGVK_PROFILE=") for item in args)
        )

        self.assertTrue(result["success"])
        self.assertIn("--env=DXVK_CONFIG=dxgi.syncInterval = 0; dxvk.maxFrameRate = 30", command)
        self.assertNotIn("--env=DXVK_HDR=0", command)
        self.assertIn("--env=MESA_LOADER_DRIVER_OVERRIDE=zink", command)

    def test_remove_restores_exact_original_override_and_profile(self):
        baseline = "[Environment]\nKEEP=yes\n"
        self.flatpak._write_file(self.flatpak._override_path(self.app_id), baseline)
        self.assertTrue(self.service.enable_app(self.app_id)["success"])

        removed = self.service.remove_app(self.app_id)

        self.assertTrue(removed["success"])
        self.assertEqual(self.flatpak._override_path(self.app_id).read_text(encoding="utf-8"), baseline)
        self.assertFalse(self.configuration.get_flatpak_config(self.app_id)["exists"])

    def test_external_override_change_fails_closed(self):
        self.assertTrue(self.service.enable_app(self.app_id)["success"])
        path = self.flatpak._override_path(self.app_id)
        path.write_text(path.read_text(encoding="utf-8") + "EXTERNAL=yes\n", encoding="utf-8")

        result = self.service.set_workaround_state(self.app_id, self.service.default_state())

        self.assertFalse(result["success"])
        self.assertIn("changed after preparation", result["error"])

    def test_running_detection_uses_owned_selector_state(self):
        self.assertTrue(self.service.enable_app(self.app_id)["success"])
        self.flatpak.running = "org.example.Game\ttrue\t1234\norg.other.App\ttrue\t9999\n"

        result = self.service.get_running_apps()

        self.assertTrue(result["success"])
        self.assertEqual(result["apps"], [{"app_id": self.app_id, "active": True, "pid": "1234"}])


if __name__ == "__main__":
    unittest.main()
