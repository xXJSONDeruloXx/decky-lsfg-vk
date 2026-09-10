"""Plugin-level Flatpak capability for the bundled lsfg-vk Vulkan layers."""

from __future__ import annotations

import json
import os
import pwd
import re
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Dict, Optional, Set, Tuple

from .base_service import BaseService
from .constants import (
    BIN_DIR,
    FLATPAK_23_08_FILENAME,
    FLATPAK_24_08_FILENAME,
    FLATPAK_25_08_FILENAME,
)


class FlatpakService(BaseService):
    """Install the shared Flatpak layer and own only the grants we add."""

    EXTENSION_ID = "org.freedesktop.Platform.VulkanLayer.lsfgvk"
    SUPPORTED_RUNTIMES = ("23.08", "24.08", "25.08")
    OWNERSHIP_FILENAME = "flatpak_extensions.json"
    OWNERSHIP_VERSION = 2

    def __init__(self, logger=None):
        super().__init__(logger)
        self.flatpak_command: Optional[str] = None
        self._lock = threading.RLock()

    @property
    def ownership_path(self) -> Path:
        return self.config_dir / self.OWNERSHIP_FILENAME

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
    def _validate_runtime(cls, branch: str) -> str:
        if branch not in cls.SUPPORTED_RUNTIMES:
            raise ValueError(
                f"Unsupported Flatpak runtime branch {branch}; supported branches are "
                + ", ".join(cls.SUPPORTED_RUNTIMES)
            )
        return branch

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
        if any(item not in ("user", "system") for item in scopes):
            raise ValueError("Flatpak installation scope must be user or system")
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

    @staticmethod
    def _validate_filesystem_path(value: object) -> str:
        if not isinstance(value, str) or not value or "\x00" in value:
            raise ValueError("Flatpak filesystem ownership entries must be non-empty strings")
        path = Path(value)
        if not path.is_absolute() or str(path) != value:
            raise ValueError("Flatpak filesystem ownership entries must be normalized absolute paths")
        return value

    def _read_ownership(self) -> Tuple[Set[str], Set[str]]:
        path = self.ownership_path
        if not path.exists() and not path.is_symlink():
            return set(), set()
        if path.is_symlink() or not path.is_file():
            raise RuntimeError("Flatpak ownership metadata is not a regular file")
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            version = data.get("version")
            branches = data.get("plugin_owned_branches")
            filesystems = data.get("plugin_owned_filesystems", [])
            if version not in (1, self.OWNERSHIP_VERSION) or not isinstance(branches, list):
                raise ValueError("invalid ownership metadata")
            if version == self.OWNERSHIP_VERSION and not isinstance(filesystems, list):
                raise ValueError("invalid ownership metadata")
            owned_branches = {self._validate_runtime(branch) for branch in branches}
            if len(owned_branches) != len(branches):
                raise ValueError("invalid ownership metadata")
            owned_filesystems = {
                self._validate_filesystem_path(filesystem) for filesystem in filesystems
            }
            if len(owned_filesystems) != len(filesystems):
                raise ValueError("invalid ownership metadata")
            return owned_branches, owned_filesystems
        except (OSError, json.JSONDecodeError, TypeError, ValueError) as error:
            raise RuntimeError(f"Could not trust Flatpak ownership metadata: {error}") from error

    def _write_ownership(self, branches: Set[str], filesystems: Set[str]) -> None:
        if not branches and not filesystems:
            self.ownership_path.unlink(missing_ok=True)
            return
        self._write_file(
            self.ownership_path,
            json.dumps(
                {
                    "version": self.OWNERSHIP_VERSION,
                    "plugin_owned_branches": sorted(branches),
                    "plugin_owned_filesystems": sorted(filesystems),
                },
                indent=2,
            ) + "\n",
        )

    def _configured_lossless_scaling_directory(self) -> Path:
        default = self.user_home / ".local/share/Steam/steamapps/common/Lossless Scaling"
        if not self.config_file_path.exists():
            return default
        try:
            content = self.config_file_path.read_text(encoding="utf-8")
            match = re.search(
                r'(?m)^[ \t]*dll[ \t]*=[ \t]*"((?:\\.|[^"\\])*)"',
                content,
            )
            if not match:
                return default
            configured_dll = json.loads('"' + match.group(1) + '"')
            if not configured_dll:
                return default
            if configured_dll.startswith("~/"):
                return self.user_home / configured_dll[2:]
            configured_path = Path(configured_dll)
            return configured_path.parent if configured_path.is_absolute() else default
        except Exception:
            return default

    def _filesystem_grant_paths(self) -> Tuple[str, ...]:
        paths = (
            str(self.config_dir),
            str(self._configured_lossless_scaling_directory()),
        )
        return tuple(dict.fromkeys(paths))

    @staticmethod
    def _parse_filesystems(output: str) -> Dict[str, str]:
        entries: Dict[str, str] = {}
        for raw_line in output.splitlines() if isinstance(output, str) else []:
            line = raw_line.strip()
            if not line.startswith("filesystems="):
                continue
            for raw_entry in line.partition("=")[2].split(";"):
                entry = raw_entry.strip()
                if not entry:
                    continue
                for mode in ("ro", "rw", "create"):
                    suffix = f":{mode}"
                    if entry.endswith(suffix):
                        entries[entry[:-len(suffix)]] = mode
                        break
                else:
                    entries[entry] = "rw"
        return entries

    def _global_filesystems(self) -> Dict[str, str]:
        result = self._run_flatpak_command(
            ["override", "--user", "--show"],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise OSError(result.stderr.strip() or "Could not read Flatpak global overrides")
        return self._parse_filesystems(result.stdout)

    def _status(self, message: Optional[str] = None):
        available = self.check_flatpak_available()
        owned_branches, owned_filesystems = self._read_ownership()
        installed = self._installed_extension_branches() if available else set()
        filesystems = self._global_filesystems() if available else {}
        grant_paths = self._filesystem_grant_paths()
        filesystem_grants = [
            {
                "path": path,
                "present": path in filesystems,
                "read_only": filesystems.get(path) == "ro",
            }
            for path in grant_paths
        ]
        ready = available and all(branch in installed for branch in self.SUPPORTED_RUNTIMES) and all(
            grant["present"] for grant in filesystem_grants
        )
        return self._success_response(
            dict,
            message or ("Flatpak support is ready" if ready else "Flatpak support needs setup"),
            available=available,
            ready=ready,
            extension_id=self.EXTENSION_ID,
            supported_branches=list(self.SUPPORTED_RUNTIMES),
            installed_branches=sorted(installed),
            filesystem_grants=filesystem_grants,
            missing_filesystem_grants=[
                grant["path"] for grant in filesystem_grants if not grant["present"]
            ],
            plugin_owned_branches=sorted(owned_branches),
            plugin_owned_filesystems=sorted(owned_filesystems),
        )

    def get_extension_status(self):
        try:
            if not self.check_flatpak_available():
                return self._status("Flatpak is not available")
            return self._status()
        except Exception as error:
            return self._error_response(
                dict,
                str(error),
                available=False,
                ready=False,
                extension_id=self.EXTENSION_ID,
                supported_branches=list(self.SUPPORTED_RUNTIMES),
                installed_branches=[],
                filesystem_grants=[],
                missing_filesystem_grants=list(self._filesystem_grant_paths()),
            )

    get_flatpak_support_status = get_extension_status

    def _install_branch(self, branch: str) -> None:
        bundle = self._bundled_extension_path(branch)
        if not bundle.is_file():
            raise FileNotFoundError(
                f"Bundled Flatpak extension not found at {bundle}; reinstall the plugin"
            )
        result = self._run_flatpak_command(
            ["install", "--user", "--noninteractive", "--or-update", str(bundle)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise OSError(result.stderr.strip() or "Flatpak installation failed")
        if branch not in self._installed_extension_branches("user"):
            raise RuntimeError(
                f"Flatpak install completed but {self._extension_ref(branch)} was not visible afterwards"
            )

    def _add_filesystem_grant(self, path: str) -> None:
        result = self._run_flatpak_command(
            ["override", "--user", f"--filesystem={path}:ro"],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise OSError(result.stderr.strip() or f"Could not grant Flatpak access to {path}")
        current = self._global_filesystems()
        if current.get(path) != "ro":
            raise RuntimeError(f"Flatpak did not confirm the read-only grant for {path}")

    def ensure_plugin_support(self):
        """Make the shared layer and exact read-only grants available once."""
        try:
            with self._lock:
                if not self.check_flatpak_available():
                    return self._status("Flatpak is not available")
                owned_branches, owned_filesystems = self._read_ownership()
                installed = self._installed_extension_branches()
                for branch in self.SUPPORTED_RUNTIMES:
                    if branch in installed:
                        continue
                    self._install_branch(branch)
                    installed.add(branch)
                    owned_branches.add(branch)
                    self._write_ownership(owned_branches, owned_filesystems)

                current_filesystems = self._global_filesystems()
                for path in self._filesystem_grant_paths():
                    if path in current_filesystems:
                        continue
                    self._add_filesystem_grant(path)
                    owned_filesystems.add(path)
                    self._write_ownership(owned_branches, owned_filesystems)

                return self._status("Flatpak support is ready")
        except Exception as error:
            return self._error_response(
                dict,
                str(error),
                available=self.check_flatpak_available(),
                ready=False,
                extension_id=self.EXTENSION_ID,
                supported_branches=list(self.SUPPORTED_RUNTIMES),
                installed_branches=[],
                filesystem_grants=[],
                missing_filesystem_grants=list(self._filesystem_grant_paths()),
            )

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
        if branch in self._installed_extension_branches("user"):
            raise RuntimeError(
                f"Flatpak uninstall completed but {self._extension_ref(branch)} is still installed"
            )
        return True

    def _remove_filesystem_grant(self, path: str) -> bool:
        current = self._global_filesystems()
        if path not in current:
            return False
        if current[path] != "ro":
            raise RuntimeError(
                f"Refusing to remove Flatpak grant for {path}; its permissions changed externally"
            )
        result = self._run_flatpak_command(
            ["override", "--user", f"--nofilesystem={path}"],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise OSError(result.stderr.strip() or f"Could not remove Flatpak access to {path}")
        if path in self._global_filesystems():
            raise RuntimeError(f"Flatpak filesystem grant for {path} is still present")
        return True

    def remove_plugin_owned_extensions(self):
        """Remove only positively owned user branches and exact filesystem grants."""
        try:
            with self._lock:
                owned_branches, owned_filesystems = self._read_ownership()
                if not owned_branches and not owned_filesystems:
                    return self._success_response(
                        dict,
                        "No plugin-owned Flatpak state to remove",
                        removed_branches=[],
                        preserved_branches=[],
                        removed_filesystem_grants=[],
                        preserved_filesystem_grants=[],
                        ownership_uncertain=False,
                    )
                if not self.check_flatpak_available():
                    raise RuntimeError(
                        "Flatpak is not available; plugin-owned state metadata was preserved"
                    )

                removed_branches, preserved_branches = [], []
                remaining_branches = set(owned_branches)
                for branch in sorted(owned_branches):
                    try:
                        self._remove_extension(branch)
                        removed_branches.append(branch)
                        remaining_branches.discard(branch)
                    except Exception as error:
                        preserved_branches.append(f"{branch}: {error}")

                removed_filesystems, preserved_filesystems = [], []
                remaining_filesystems = set(owned_filesystems)
                for path in sorted(owned_filesystems):
                    try:
                        self._remove_filesystem_grant(path)
                        removed_filesystems.append(path)
                        remaining_filesystems.discard(path)
                    except Exception as error:
                        preserved_filesystems.append(f"{path}: {error}")

                self._write_ownership(remaining_branches, remaining_filesystems)
                failures = [*preserved_branches, *preserved_filesystems]
                if failures:
                    return self._error_response(
                        dict,
                        "; ".join(failures),
                        removed_branches=removed_branches,
                        preserved_branches=preserved_branches,
                        removed_filesystem_grants=removed_filesystems,
                        preserved_filesystem_grants=preserved_filesystems,
                        ownership_uncertain=False,
                    )
                return self._success_response(
                    dict,
                    "Plugin-owned Flatpak state removed",
                    removed_branches=removed_branches,
                    preserved_branches=[],
                    removed_filesystem_grants=removed_filesystems,
                    preserved_filesystem_grants=[],
                    ownership_uncertain=False,
                )
        except Exception as error:
            return self._error_response(
                dict,
                str(error),
                removed_branches=[],
                preserved_branches=[],
                removed_filesystem_grants=[],
                preserved_filesystem_grants=[],
                ownership_uncertain=True,
            )
