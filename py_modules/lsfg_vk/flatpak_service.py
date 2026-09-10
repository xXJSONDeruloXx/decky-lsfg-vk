"""Flatpak runtime support for classified Steam targets."""

from __future__ import annotations

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
    OWNERSHIP_FILENAME = "flatpak_extensions.json"
    OWNERSHIP_VERSION = 1
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
    def runtime_branch_from_ref(cls, runtime_ref: str) -> str:
        parts = runtime_ref.strip().split("/") if isinstance(runtime_ref, str) else []
        if len(parts) != 3 or parts[0] != "org.freedesktop.Platform":
            raise ValueError(f"Unsupported Flatpak runtime reference: {runtime_ref}")
        return cls._validate_runtime(parts[2])

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

    def _installed_extension_branches(self) -> Set[str]:
        result = self._run_flatpak_command(
            ["list", "--runtime", "--columns=application,arch,branch"],
            capture_output=True,
            text=True,
            check=True,
        )
        installed = set()
        for line in result.stdout.splitlines():
            fields = line.split("\t") if "\t" in line else line.split()
            if len(fields) >= 3 and fields[0] == self.EXTENSION_ID and fields[1] == "x86_64":
                installed.add(fields[2])
        return installed

    def _owned_branches(self) -> Set[str]:
        path = self.ownership_path
        if not path.exists() and not path.is_symlink():
            return set()
        if path.is_symlink() or not path.is_file():
            raise RuntimeError("Flatpak ownership metadata is not a regular file")
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            branches = data.get("plugin_owned_branches")
            if data.get("version") != self.OWNERSHIP_VERSION or not isinstance(branches, list):
                raise ValueError("invalid ownership metadata")
            owned = {self._validate_runtime(branch) for branch in branches}
            if len(owned) != len(branches):
                raise ValueError("invalid ownership metadata")
            return owned
        except (OSError, json.JSONDecodeError, TypeError, ValueError) as error:
            raise RuntimeError(f"Could not trust Flatpak ownership metadata: {error}") from error

    def _write_owned_branches(self, branches: Set[str]) -> None:
        if not branches:
            self.ownership_path.unlink(missing_ok=True)
            return
        self._write_file(
            self.ownership_path,
            json.dumps(
                {
                    "version": self.OWNERSHIP_VERSION,
                    "plugin_owned_branches": sorted(branches),
                },
                indent=2,
            ) + "\n",
        )

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

    def _resolve_runtime(self, app_id: str):
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
        return runtime, self.runtime_branch_from_ref(runtime)

    def resolve_app_support(self, app_id: str):
        try:
            app_id = self._validate_app_id(app_id)
            runtime, branch = self._resolve_runtime(app_id)
            installed = self._installed_extension_branches()
            ready = branch in installed
            return self._success_response(
                dict,
                f"lsfg-vk support is ready for {app_id}" if ready
                else f"lsfg-vk runtime extension {branch} is required for {app_id}",
                flatpak_app_id=app_id,
                runtime=runtime,
                runtime_branch=branch,
                support_status="ready" if ready else "needs-runtime",
                extension_installed=ready,
                installed_branches=sorted(installed),
            )
        except ValueError as error:
            return self._success_response(
                dict,
                str(error),
                flatpak_app_id=app_id,
                runtime=None,
                runtime_branch=None,
                support_status="unsupported",
                extension_installed=False,
                installed_branches=[],
                error=str(error),
            )
        except Exception as error:
            return self._error_response(
                dict,
                str(error),
                flatpak_app_id=app_id,
                runtime=None,
                runtime_branch=None,
                support_status="error",
                extension_installed=False,
                installed_branches=[],
            )

    def install_extension(self, branch: str):
        try:
            branch = self._validate_runtime(branch)
            if not self.check_flatpak_available():
                raise FileNotFoundError("Flatpak is not available on this system")
            with self._lock:
                if branch in self._installed_extension_branches():
                    return self._extension_result(branch, True, False, "already installed")
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
                if branch not in self._installed_extension_branches():
                    raise RuntimeError(f"Flatpak install completed but {self._extension_ref(branch)} was not visible afterwards")
                owned = self._owned_branches()
                owned.add(branch)
                self._write_owned_branches(owned)
                return self._extension_result(branch, True, False, "installed")
        except Exception as error:
            return self._error_response(dict, str(error), runtime_branch=branch, installed=False, enabled=False)

    def _remove_extension(self, branch: str) -> bool:
        if branch not in self._installed_extension_branches():
            return False
        result = self._run_flatpak_command(
            ["uninstall", "--user", "--noninteractive", self._extension_ref(branch)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise OSError(result.stderr.strip() or "Flatpak uninstall failed")
        if branch in self._installed_extension_branches():
            raise RuntimeError(f"Flatpak uninstall completed but {self._extension_ref(branch)} is still installed")
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
                removed = self._remove_extension(branch)
                owned = self._owned_branches()
                if branch in owned:
                    owned.remove(branch)
                    self._write_owned_branches(owned)
                return self._extension_result(branch, False, removed, "uninstalled")
        except Exception as error:
            return self._error_response(
                dict,
                str(error),
                runtime_branch=branch,
                removed=False,
                installed=False,
                enabled=False,
            )

    def ensure_extension(self, branch: str):
        try:
            branch = self._validate_runtime(branch)
            if branch in self._installed_extension_branches():
                return self._extension_result(branch, True, False, "is ready")
        except Exception as error:
            return self._error_response(dict, str(error), runtime_branch=branch, support_status="error")
        return self.install_extension(branch)

    def ensure_app_support(self, app_id: str):
        resolved = self.resolve_app_support(app_id)
        if not resolved.get("success") or resolved.get("support_status") != "needs-runtime":
            return resolved
        result = self.ensure_extension(resolved["runtime_branch"])
        if not result.get("success"):
            return self._error_response(
                dict,
                result.get("error") or "Could not install the required Flatpak runtime extension",
                flatpak_app_id=app_id,
                runtime=resolved.get("runtime"),
                runtime_branch=resolved.get("runtime_branch"),
                support_status="error",
                extension_installed=False,
            )
        return self.resolve_app_support(app_id)

    def set_extension_enabled(self, branch: str, enabled: bool):
        if type(enabled) is not bool:
            return self._error_response(dict, "enabled must be a boolean", runtime_branch=branch, installed=False, enabled=False)
        return self.install_extension(branch) if enabled else self.uninstall_extension(branch)

    def remove_plugin_owned_extensions(self):
        try:
            with self._lock:
                owned = self._owned_branches()
                if not owned:
                    return self._success_response(
                        dict,
                        "No plugin-owned Flatpak extensions to remove",
                        removed_branches=[],
                        preserved_branches=[],
                        ownership_uncertain=False,
                    )
                if not self.check_flatpak_available():
                    raise RuntimeError("Flatpak is not available; plugin-owned extension metadata was preserved")
                removed, failures = [], []
                for branch in sorted(owned):
                    try:
                        self._remove_extension(branch)
                        removed.append(branch)
                    except Exception as error:
                        failures.append(f"{branch}: {error}")
                remaining = owned - set(removed)
                self._write_owned_branches(remaining)
                if failures:
                    return self._error_response(
                        dict,
                        "; ".join(failures),
                        removed_branches=removed,
                        preserved_branches=sorted(remaining),
                        ownership_uncertain=False,
                    )
                return self._success_response(
                    dict,
                    "Plugin-owned Flatpak extensions removed",
                    removed_branches=removed,
                    preserved_branches=[],
                    ownership_uncertain=False,
                )
        except Exception as error:
            return self._error_response(
                dict,
                str(error),
                removed_branches=[],
                preserved_branches=[],
                ownership_uncertain=True,
            )
