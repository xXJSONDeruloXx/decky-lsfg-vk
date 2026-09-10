from __future__ import annotations

import hashlib
import json
import os
import pwd
import re
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Dict, Optional, Set

from .base_service import BaseService
from .constants import (
    BIN_DIR,
    FLATPAK_23_08_FILENAME,
    FLATPAK_24_08_FILENAME,
    FLATPAK_25_08_FILENAME,
)


class FlatpakService(BaseService):
    EXTENSION_ID = "org.freedesktop.Platform.VulkanLayer.lsfgvk"
    SUPPORTED_RUNTIMES = ("23.08", "24.08", "25.08")
    DERIVED_RUNTIME_IDS = {"org.gnome.Platform", "org.kde.Platform"}
    RUNTIME_METADATA_SECTION = "Extension org.freedesktop.Platform.GL"
    OWNERSHIP_FILENAME = "flatpak_state.json"
    OWNERSHIP_VERSION = 2
    APP_ID_PATTERN = re.compile(
        r"^[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*)+$"
    )

    def __init__(self, logger=None):
        super().__init__(logger)
        self.flatpak_command: Optional[str] = None
        self._lock = threading.RLock()

    @property
    def ownership_path(self) -> Path:
        return self.config_dir / self.OWNERSHIP_FILENAME

    @property
    def backup_dir(self) -> Path:
        return self.config_dir / "flatpak-overrides"

    def _clean_env(self) -> Dict[str, str]:
        env = os.environ.copy()
        env.pop("LD_LIBRARY_PATH", None)
        env["HOME"] = str(self.user_home)
        path = [entry for entry in env.get("PATH", "").split(":") if entry]
        for entry in ("/usr/bin", "/usr/local/bin", "/bin"):
            if entry not in path:
                path.insert(0, entry)
        env["PATH"] = ":".join(path)
        return env

    def check_flatpak_available(self) -> bool:
        env = self._clean_env()
        self.flatpak_command = shutil.which("flatpak", path=env["PATH"])
        return self.flatpak_command is not None

    def _run_flatpak_command(self, args, **kwargs):
        if self.flatpak_command is None and not self.check_flatpak_available():
            raise FileNotFoundError("Flatpak command not available")
        env = self._clean_env()
        command = [self.flatpak_command, *args]
        try:
            user = pwd.getpwuid(self.user_home.stat().st_uid)
        except (KeyError, OSError) as error:
            raise RuntimeError(f"Unable to resolve Flatpak user for {self.user_home}") from error
        if os.geteuid() != user.pw_uid:
            runuser = shutil.which("runuser", path=env["PATH"])
            if runuser is None:
                raise FileNotFoundError("runuser command not available")
            command = [runuser, "--user", user.pw_name, "--", *command]
        return subprocess.run(command, env=env, **kwargs)

    @classmethod
    def _validate_app_id(cls, app_id: str) -> str:
        if not isinstance(app_id, str) or not cls.APP_ID_PATTERN.fullmatch(app_id):
            raise ValueError("Invalid Flatpak application ID")
        return app_id

    @classmethod
    def _validate_runtime(cls, branch: str) -> str:
        if branch not in cls.SUPPORTED_RUNTIMES:
            raise ValueError(
                f"Unsupported Flatpak runtime branch {branch}; supported branches are "
                + ", ".join(cls.SUPPORTED_RUNTIMES)
            )
        return branch

    @classmethod
    def runtime_branch_from_metadata(cls, metadata: str) -> str:
        section = None
        versions = []
        for raw_line in metadata.splitlines() if isinstance(metadata, str) else []:
            line = raw_line.strip()
            if line.startswith("[") and line.endswith("]"):
                section = line[1:-1].strip()
                continue
            if section != cls.RUNTIME_METADATA_SECTION:
                continue
            key, separator, value = line.partition("=")
            if separator and key.strip() == "versions":
                versions.extend(part.strip() for part in value.split(";"))
        for value in versions:
            for branch in cls.SUPPORTED_RUNTIMES:
                if value == branch or value.startswith(f"{branch}-"):
                    return branch
        raise ValueError("Could not determine a supported Freedesktop base runtime from Flatpak metadata")

    @classmethod
    def _extension_ref(cls, branch: str) -> str:
        return f"{cls.EXTENSION_ID}/x86_64/{cls._validate_runtime(branch)}"

    def _bundled_extension_path(self, branch: str) -> Path:
        filename = {
            "23.08": FLATPAK_23_08_FILENAME,
            "24.08": FLATPAK_24_08_FILENAME,
            "25.08": FLATPAK_25_08_FILENAME,
        }[self._validate_runtime(branch)]
        return Path(__file__).resolve().parent.parent.parent / BIN_DIR / filename

    def _installed_extension_branches(self, scope: Optional[str] = None) -> Set[str]:
        scopes = ("user", "system") if scope is None else (scope,)
        installed = set()
        for item in scopes:
            result = self._run_flatpak_command(
                ["list", f"--{item}", "--runtime", "--columns=application,arch,branch"],
                capture_output=True,
                text=True,
                check=True,
            )
            for line in result.stdout.splitlines():
                fields = line.split("\t") if "\t" in line else line.split()
                if len(fields) >= 3 and fields[0] == self.EXTENSION_ID and fields[1] == "x86_64":
                    installed.add(fields[2])
        return installed

    def _empty_state(self) -> Dict[str, object]:
        return {
            "version": self.OWNERSHIP_VERSION,
            "plugin_owned_branches": [],
            "prepared_apps": {},
        }

    def _read_state(self) -> Dict[str, object]:
        if not self.ownership_path.exists():
            return self._empty_state()
        if self.ownership_path.is_symlink() or not self.ownership_path.is_file():
            raise RuntimeError("Flatpak ownership metadata is not a regular file")
        try:
            data = json.loads(self.ownership_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise RuntimeError(f"Could not read Flatpak ownership metadata: {error}") from error
        if data.get("version") != self.OWNERSHIP_VERSION:
            raise RuntimeError("Unsupported Flatpak ownership metadata version")
        branches = data.get("plugin_owned_branches")
        apps = data.get("prepared_apps")
        if not isinstance(branches, list) or not isinstance(apps, dict):
            raise RuntimeError("Invalid Flatpak ownership metadata")
        for branch in branches:
            self._validate_runtime(branch)
        for app_id, entry in apps.items():
            self._validate_app_id(app_id)
            if not isinstance(entry, dict):
                raise RuntimeError("Invalid Flatpak app ownership metadata")
            if type(entry.get("override_existed")) is not bool:
                raise RuntimeError("Invalid Flatpak app ownership metadata")
            if not isinstance(entry.get("managed_sha256"), str):
                raise RuntimeError("Invalid Flatpak app ownership metadata")
        return data

    def _write_state(self, state: Dict[str, object]) -> None:
        branches = state.get("plugin_owned_branches", [])
        apps = state.get("prepared_apps", {})
        if not branches and not apps:
            self.ownership_path.unlink(missing_ok=True)
            if self.backup_dir.exists() and not any(self.backup_dir.iterdir()):
                self.backup_dir.rmdir()
            return
        self._write_file(
            self.ownership_path,
            json.dumps(state, indent=2, sort_keys=True) + "\n",
        )

    def _owned_branches(self, state: Optional[Dict[str, object]] = None) -> Set[str]:
        current = state if state is not None else self._read_state()
        return {self._validate_runtime(branch) for branch in current["plugin_owned_branches"]}

    def _override_path(self, app_id: str) -> Path:
        return self.user_home / ".local/share/flatpak/overrides" / self._validate_app_id(app_id)

    def _backup_path(self, app_id: str) -> Path:
        return self.backup_dir / f"{self._validate_app_id(app_id)}.ini"

    @staticmethod
    def _sha256(content: bytes) -> str:
        return hashlib.sha256(content).hexdigest()

    def _snapshot_override(self, app_id: str) -> tuple[bool, bytes]:
        path = self._override_path(app_id)
        if path.is_symlink():
            raise RuntimeError("Flatpak override path is a symlink")
        if not path.exists():
            return False, b""
        if not path.is_file():
            raise RuntimeError("Flatpak override path is not a regular file")
        return True, path.read_bytes()

    def _resolve_runtime(self, app_id: str) -> tuple[str, str]:
        self._validate_app_id(app_id)
        if not self.check_flatpak_available():
            raise FileNotFoundError("Flatpak is not available on this system")
        result = self._run_flatpak_command(
            ["info", "--show-runtime", app_id],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise OSError(result.stderr.strip() or f"Could not inspect Flatpak app {app_id}")
        runtime = result.stdout.strip().splitlines()[0] if result.stdout.strip() else ""
        parts = runtime.split("/")
        if len(parts) != 3:
            raise ValueError(f"Unsupported Flatpak runtime reference: {runtime}")
        if parts[0] == "org.freedesktop.Platform":
            return runtime, self._validate_runtime(parts[2])
        if parts[0] not in self.DERIVED_RUNTIME_IDS:
            raise ValueError(f"Unsupported Flatpak runtime reference: {runtime}")
        metadata_result = self._run_flatpak_command(
            ["info", "--show-metadata", runtime],
            capture_output=True,
            text=True,
        )
        if metadata_result.returncode != 0:
            raise OSError(metadata_result.stderr.strip() or f"Could not inspect Flatpak runtime {runtime}")
        return runtime, self.runtime_branch_from_metadata(metadata_result.stdout)

    def _dll_directory(self) -> Path:
        if self.config_file_path.exists():
            try:
                content = self.config_file_path.read_text(encoding="utf-8")
                match = re.search(
                    r'(?m)^[ \t]*dll[ \t]*=[ \t]*"((?:\\.|[^"\\])*)"',
                    content,
                )
                if match:
                    configured_dll = json.loads('"' + match.group(1) + '"')
                    if configured_dll:
                        return Path(configured_dll).parent
            except Exception:
                pass
        return self.user_home / ".local/share/Steam/steamapps/common/Lossless Scaling"

    def _filesystem_present(self, entries: str, host_path: Path) -> bool:
        accepted = {str(host_path)}
        try:
            accepted.add(f"~/{host_path.relative_to(self.user_home).as_posix()}")
        except ValueError:
            pass
        enabled = False
        for raw in entries.split(";"):
            value = raw.strip()
            if not value:
                continue
            denied = value.startswith("!")
            path = value[1:] if denied else value
            path = path.split(":", 1)[0]
            if path in accepted:
                if denied:
                    return False
                enabled = True
        return enabled

    def _app_override_status(self, app_id: str) -> Dict[str, object]:
        result = self._run_flatpak_command(
            ["override", "--user", "--show", app_id],
            capture_output=True,
            text=True,
        )
        output = result.stdout if result.returncode == 0 else ""
        section = None
        filesystems = ""
        unset_environment = set()
        environment = {}
        for raw_line in output.splitlines():
            line = raw_line.strip()
            if line.startswith("[") and line.endswith("]"):
                section = line[1:-1]
                continue
            key, separator, value = line.partition("=")
            if not separator:
                continue
            if section == "Context" and key == "filesystems":
                filesystems = value
            elif section == "Context" and key == "unset-environment":
                unset_environment.update(item for item in value.split(";") if item)
            elif section == "Environment":
                environment[key] = value
        config_ready = self._filesystem_present(filesystems, self.config_dir)
        dll_ready = self._filesystem_present(filesystems, self._dll_directory())
        env_ready = (
            environment.get("LSFGVK_CONFIG") == str(self.config_file_path)
            and environment.get("LSFGVK_FLATPAK") == "1"
            and "DISABLE_LSFGVK" in unset_environment
            and "DISABLE_LSFG" in unset_environment
        )
        return {
            "filesystem_ready": config_ready and dll_ready,
            "environment_ready": env_ready,
            "prepared": config_ready and dll_ready and env_ready,
        }

    def get_extension_status(self):
        try:
            available = self.check_flatpak_available()
            installed = self._installed_extension_branches() if available else set()
            return self._success_response(
                dict,
                "Flatpak runtime extension status retrieved" if available else "Flatpak is not available",
                available=available,
                extension_id=self.EXTENSION_ID,
                supported_branches=list(self.SUPPORTED_RUNTIMES),
                installed_branches=sorted(installed),
            )
        except Exception as error:
            return self._error_response(
                dict,
                str(error),
                available=False,
                extension_id=self.EXTENSION_ID,
                supported_branches=list(self.SUPPORTED_RUNTIMES),
                installed_branches=[],
            )

    get_flatpak_support_status = get_extension_status

    def install_extension(self, branch: str):
        try:
            branch = self._validate_runtime(branch)
            if not self.check_flatpak_available():
                raise FileNotFoundError("Flatpak is not available on this system")
            with self._lock:
                installed = self._installed_extension_branches()
                if branch in installed:
                    return self._extension_result(branch, True, False, "is ready")
                bundle = self._bundled_extension_path(branch)
                if not bundle.is_file():
                    raise FileNotFoundError(f"Bundled Flatpak extension not found at {bundle}; reinstall the plugin")
                result = self._run_flatpak_command(
                    ["install", "--user", "--noninteractive", "--or-update", str(bundle)],
                    capture_output=True,
                    text=True,
                )
                if result.returncode != 0:
                    raise OSError(result.stderr.strip() or "Flatpak installation failed")
                if branch not in self._installed_extension_branches("user"):
                    raise RuntimeError(f"Flatpak install completed but {self._extension_ref(branch)} was not visible afterwards")
                state = self._read_state()
                owned = self._owned_branches(state)
                owned.add(branch)
                state["plugin_owned_branches"] = sorted(owned)
                self._write_state(state)
                return self._extension_result(branch, True, False, "installed")
        except Exception as error:
            return self._error_response(dict, str(error), runtime_branch=branch, installed=False, enabled=False)

    def _remove_extension(self, branch: str) -> bool:
        if branch not in self._installed_extension_branches("user"):
            return False
        result = self._run_flatpak_command(
            ["uninstall", "--user", "--noninteractive", self._extension_ref(branch)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise OSError(result.stderr.strip() or "Flatpak uninstall failed")
        return True

    def _extension_result(self, branch: str, installed: bool, removed: bool, verb: str):
        return self._success_response(
            dict,
            f"lsfg-vk {branch} runtime extension {verb}",
            runtime_branch=branch,
            installed=installed,
            enabled=installed,
            removed=removed,
        )

    def uninstall_extension(self, branch: str):
        try:
            branch = self._validate_runtime(branch)
            if not self.check_flatpak_available():
                raise FileNotFoundError("Flatpak is not available on this system")
            with self._lock:
                state = self._read_state()
                owned = self._owned_branches(state)
                if branch not in owned:
                    installed = branch in self._installed_extension_branches()
                    return self._extension_result(branch, installed, False, "preserved (not plugin-owned)")
                removed = self._remove_extension(branch)
                owned.remove(branch)
                state["plugin_owned_branches"] = sorted(owned)
                self._write_state(state)
                installed = branch in self._installed_extension_branches()
                return self._extension_result(branch, installed, removed, "uninstalled")
        except Exception as error:
            return self._error_response(dict, str(error), runtime_branch=branch, removed=False, installed=False, enabled=False)

    def ensure_extension(self, branch: str):
        try:
            branch = self._validate_runtime(branch)
            if branch in self._installed_extension_branches():
                return self._extension_result(branch, True, False, "is ready")
        except Exception as error:
            return self._error_response(dict, str(error), runtime_branch=branch, installed=False, enabled=False)
        return self.install_extension(branch)

    def set_extension_enabled(self, branch: str, enabled: bool):
        if type(enabled) is not bool:
            return self._error_response(dict, "enabled must be a boolean", runtime_branch=branch, installed=False, enabled=False)
        return self.install_extension(branch) if enabled else self.uninstall_extension(branch)

    def get_flatpak_apps(self):
        try:
            if not self.check_flatpak_available():
                raise FileNotFoundError("Flatpak is not available on this system")
            installed_extensions = self._installed_extension_branches()
            state = self._read_state()
            owned_apps = state["prepared_apps"]
            result = self._run_flatpak_command(
                ["list", "--app", "--columns=name,application"],
                capture_output=True,
                text=True,
                check=True,
            )
            apps = []
            for line in result.stdout.splitlines():
                fields = line.split("\t")
                if len(fields) < 2:
                    continue
                name, app_id = fields[0].strip(), fields[1].strip()
                if not app_id:
                    continue
                item = {
                    "app_id": app_id,
                    "app_name": name or app_id,
                    "runtime": None,
                    "runtime_branch": None,
                    "runtime_ready": False,
                    "prepared": False,
                    "owned": app_id in owned_apps,
                    "error": None,
                }
                try:
                    runtime, branch = self._resolve_runtime(app_id)
                    status = self._app_override_status(app_id)
                    item.update({
                        "runtime": runtime,
                        "runtime_branch": branch,
                        "runtime_ready": branch in installed_extensions,
                        "prepared": status["prepared"],
                    })
                except Exception as error:
                    item["error"] = str(error)
                apps.append(item)
            apps.sort(key=lambda item: str(item["app_name"]).lower())
            return self._success_response(dict, f"Found {len(apps)} Flatpak applications", apps=apps)
        except Exception as error:
            return self._error_response(dict, str(error), apps=[])

    def prepare_app(self, app_id: str):
        try:
            app_id = self._validate_app_id(app_id)
            with self._lock:
                runtime, branch = self._resolve_runtime(app_id)
                extension = self.ensure_extension(branch)
                if not extension.get("success") or not extension.get("installed"):
                    raise RuntimeError(extension.get("error") or f"Could not install Flatpak runtime {branch}")
                state = self._read_state()
                apps = state["prepared_apps"]
                status = self._app_override_status(app_id)
                if status["prepared"] and app_id not in apps:
                    return self._success_response(
                        dict,
                        "Flatpak application is already prepared outside this plugin",
                        app_id=app_id,
                        runtime=runtime,
                        runtime_branch=branch,
                        prepared=True,
                        owned=False,
                    )
                if app_id not in apps:
                    existed, original = self._snapshot_override(app_id)
                    backup = self._backup_path(app_id)
                    if existed:
                        self._write_file(backup, original.decode("utf-8"))
                    else:
                        backup.unlink(missing_ok=True)
                    apps[app_id] = {
                        "override_existed": existed,
                        "managed_sha256": "",
                    }
                result = self._run_flatpak_command(
                    [
                        "override",
                        "--user",
                        f"--filesystem={self.config_dir}:ro",
                        f"--filesystem={self._dll_directory()}:ro",
                        f"--env=LSFGVK_CONFIG={self.config_file_path}",
                        "--env=LSFGVK_FLATPAK=1",
                        "--unset-env=DISABLE_LSFGVK",
                        "--unset-env=DISABLE_LSFG",
                        app_id,
                    ],
                    capture_output=True,
                    text=True,
                )
                if result.returncode != 0:
                    raise OSError(result.stderr.strip() or f"Could not prepare Flatpak app {app_id}")
                status = self._app_override_status(app_id)
                if not status["prepared"]:
                    raise RuntimeError(f"Flatpak preparation did not become visible for {app_id}")
                existed, managed = self._snapshot_override(app_id)
                if not existed:
                    raise RuntimeError(f"Flatpak override for {app_id} was not created")
                apps[app_id]["managed_sha256"] = self._sha256(managed)
                self._write_state(state)
                return self._success_response(
                    dict,
                    "Flatpak application prepared for lsfg-vk",
                    app_id=app_id,
                    runtime=runtime,
                    runtime_branch=branch,
                    prepared=True,
                    owned=True,
                )
        except Exception as error:
            return self._error_response(dict, str(error), app_id=app_id, prepared=False, owned=False)

    def remove_app_override(self, app_id: str):
        try:
            app_id = self._validate_app_id(app_id)
            with self._lock:
                state = self._read_state()
                apps = state["prepared_apps"]
                entry = apps.get(app_id)
                if entry is None:
                    return self._success_response(
                        dict,
                        "Flatpak application is not plugin-owned; existing overrides were preserved",
                        app_id=app_id,
                        prepared=self._app_override_status(app_id)["prepared"],
                        owned=False,
                    )
                existed, current = self._snapshot_override(app_id)
                current_hash = self._sha256(current) if existed else self._sha256(b"")
                if current_hash != entry["managed_sha256"]:
                    raise RuntimeError(
                        "Flatpak override changed after preparation; refusing to overwrite unrelated settings"
                    )
                override_path = self._override_path(app_id)
                backup_path = self._backup_path(app_id)
                if entry["override_existed"]:
                    if not backup_path.is_file() or backup_path.is_symlink():
                        raise RuntimeError("Flatpak override backup is unavailable")
                    self._write_file(override_path, backup_path.read_text(encoding="utf-8"))
                else:
                    override_path.unlink(missing_ok=True)
                backup_path.unlink(missing_ok=True)
                apps.pop(app_id, None)
                self._write_state(state)
                return self._success_response(
                    dict,
                    "Plugin-owned Flatpak preparation removed",
                    app_id=app_id,
                    prepared=False,
                    owned=False,
                )
        except Exception as error:
            return self._error_response(dict, str(error), app_id=app_id, prepared=False, owned=True)

    def remove_plugin_owned_environment(self):
        try:
            with self._lock:
                state = self._read_state()
                failures = []
                removed_apps = []
                for app_id in list(state["prepared_apps"]):
                    result = self.remove_app_override(app_id)
                    if result.get("success"):
                        removed_apps.append(app_id)
                    else:
                        failures.append(f"{app_id}: {result.get('error')}")
                if failures:
                    return self._error_response(
                        dict,
                        "; ".join(failures),
                        removed_apps=removed_apps,
                        removed_branches=[],
                    )
                state = self._read_state()
                removed_branches = []
                for branch in sorted(self._owned_branches(state)):
                    result = self.uninstall_extension(branch)
                    if result.get("success"):
                        removed_branches.append(branch)
                    else:
                        failures.append(f"{branch}: {result.get('error')}")
                if failures:
                    return self._error_response(
                        dict,
                        "; ".join(failures),
                        removed_apps=removed_apps,
                        removed_branches=removed_branches,
                    )
                return self._success_response(
                    dict,
                    "Plugin-owned Flatpak state removed",
                    removed_apps=removed_apps,
                    removed_branches=removed_branches,
                )
        except Exception as error:
            return self._error_response(dict, str(error), removed_apps=[], removed_branches=[])
