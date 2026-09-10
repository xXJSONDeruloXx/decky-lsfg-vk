"""Flatpak runtime-extension infrastructure for unified game targets."""

from __future__ import annotations

import json
import os
import pwd
import re
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from .base_service import BaseService
from .constants import (
    BIN_DIR,
    FLATPAK_23_08_FILENAME,
    FLATPAK_24_08_FILENAME,
    FLATPAK_25_08_FILENAME,
)


class FlatpakService(BaseService):
    """Resolve and provision only the runtime support a target actually needs.

    Flatpak application permissions are deliberately not persisted here.  The
    generated per-AppID wrapper supplies the narrow launch-time permissions and
    environment instead, while this service owns only the shared Vulkan layer
    runtime extensions installed from the plugin bundle.
    """

    EXTENSION_ID = "org.freedesktop.Platform.VulkanLayer.lsfgvk"
    SUPPORTED_RUNTIMES = ("23.08", "24.08", "25.08")
    OWNERSHIP_FILENAME = "flatpak_extensions.json"
    OWNERSHIP_VERSION = 1
    APP_ID_PATTERN = re.compile(
        r"^[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*)+$"
    )
    BRANCH_PATTERN = re.compile(r"^[0-9]+\.[0-9]+$")

    def __init__(self, logger=None):
        super().__init__(logger)
        self.flatpak_command: Optional[str] = None
        self._lock = threading.RLock()

    @property
    def ownership_path(self) -> Path:
        return self.config_dir / self.OWNERSHIP_FILENAME

    def _get_clean_env(self) -> Dict[str, str]:
        env = os.environ.copy()
        env.pop("LD_LIBRARY_PATH", None)
        env["HOME"] = str(self.user_home)
        path_entries = [entry for entry in env.get("PATH", "").split(":") if entry]
        for entry in ("/usr/bin", "/usr/local/bin", "/bin"):
            if entry not in path_entries:
                path_entries.insert(0, entry)
        env["PATH"] = ":".join(path_entries)
        return env

    def _flatpak_user(self) -> pwd.struct_passwd:
        try:
            return pwd.getpwuid(self.user_home.stat().st_uid)
        except (KeyError, OSError) as error:
            raise RuntimeError(f"Unable to resolve Flatpak user for {self.user_home}") from error

    def check_flatpak_available(self) -> bool:
        env = self._get_clean_env()
        self.flatpak_command = shutil.which("flatpak", path=env["PATH"])
        return self.flatpak_command is not None

    def _run_flatpak_command(self, args: List[str], **kwargs):
        if self.flatpak_command is None and not self.check_flatpak_available():
            raise FileNotFoundError("Flatpak command not available")
        command = [self.flatpak_command, *args]
        target_user = self._flatpak_user()
        if os.geteuid() != target_user.pw_uid:
            runuser = shutil.which("runuser", path=self._get_clean_env()["PATH"])
            if runuser is None:
                raise FileNotFoundError("runuser command not available")
            command = [runuser, "--user", target_user.pw_name, "--", *command]
        return subprocess.run(command, env=self._get_clean_env(), **kwargs)

    @classmethod
    def _validate_app_id(cls, app_id: str) -> str:
        if not isinstance(app_id, str) or not cls.APP_ID_PATTERN.fullmatch(app_id):
            raise ValueError("Invalid Flatpak application ID")
        return app_id

    @classmethod
    def _validate_runtime(cls, version: str) -> str:
        if version not in cls.SUPPORTED_RUNTIMES:
            raise ValueError(
                f"Unsupported Flatpak runtime branch {version}; "
                f"supported branches are {', '.join(cls.SUPPORTED_RUNTIMES)}"
            )
        return version

    @classmethod
    def _extension_ref(cls, version: str) -> str:
        return f"{cls.EXTENSION_ID}/x86_64/{cls._validate_runtime(version)}"

    @classmethod
    def runtime_branch_from_ref(cls, runtime_ref: str) -> str:
        """Return the supported Freedesktop branch from a runtime ref."""
        if not isinstance(runtime_ref, str):
            raise ValueError("Flatpak did not return a runtime reference")
        parts = runtime_ref.strip().split("/")
        if len(parts) != 3 or parts[0] != "org.freedesktop.Platform":
            raise ValueError(f"Unsupported Flatpak runtime reference: {runtime_ref}")
        branch = parts[2]
        if not cls.BRANCH_PATTERN.fullmatch(branch):
            raise ValueError(f"Unrecognized Flatpak runtime branch: {branch}")
        return cls._validate_runtime(branch)

    @classmethod
    def _bundle_filename(cls, version: str) -> str:
        return {
            "23.08": FLATPAK_23_08_FILENAME,
            "24.08": FLATPAK_24_08_FILENAME,
            "25.08": FLATPAK_25_08_FILENAME,
        }[cls._validate_runtime(version)]

    def _bundled_extension_path(self, version: str) -> Path:
        return (
            Path(__file__).resolve().parent.parent.parent
            / BIN_DIR
            / self._bundle_filename(version)
        )

    def _installed_extension_branches(self) -> Set[str]:
        result = self._run_flatpak_command(
            ["list", "--runtime", "--columns=application,arch,branch"],
            capture_output=True,
            text=True,
            check=True,
        )
        installed: Set[str] = set()
        for line in result.stdout.splitlines():
            if not line.strip():
                continue
            fields = line.split("\t")
            if len(fields) < 3:
                fields = line.split()
            if len(fields) < 3:
                continue
            application, arch, branch = (field.strip() for field in fields[:3])
            if application == self.EXTENSION_ID and arch == "x86_64":
                installed.add(branch)
        return installed

    def _read_owned_branches(self) -> Tuple[Set[str], bool]:
        """Read ownership without guessing when metadata is damaged."""
        path = self.ownership_path
        if path.is_symlink():
            self.log.warning(f"Flatpak ownership metadata is not a regular file: {path}")
            return set(), True
        if not path.exists():
            return set(), False
        if not path.is_file():
            self.log.warning(f"Flatpak ownership metadata is not a regular file: {path}")
            return set(), True
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(raw, dict) or raw.get("version") != self.OWNERSHIP_VERSION:
                raise ValueError("unsupported ownership metadata version")
            branches = raw.get("plugin_owned_branches")
            if not isinstance(branches, list):
                raise ValueError("plugin_owned_branches is not a list")
            normalized = {
                self._validate_runtime(branch)
                for branch in branches
                if isinstance(branch, str)
            }
            if len(normalized) != len(branches):
                raise ValueError("ownership metadata contains invalid branches")
            return normalized, False
        except (OSError, json.JSONDecodeError, TypeError, ValueError) as error:
            self.log.warning(f"Could not trust Flatpak ownership metadata: {error}")
            return set(), True

    def _write_owned_branches(self, branches: Set[str]) -> None:
        if not branches:
            if self.ownership_path.exists() or self.ownership_path.is_symlink():
                self.ownership_path.unlink()
            return
        document = {
            "version": self.OWNERSHIP_VERSION,
            "plugin_owned_branches": sorted(branches),
        }
        self._write_file(self.ownership_path, json.dumps(document, indent=2) + "\n")

    def get_extension_status(self) -> Dict[str, Any]:
        """Return global extension inventory for Setup diagnostics."""
        try:
            if not self.check_flatpak_available():
                return self._success_response(
                    dict,
                    "Flatpak is not available",
                    available=False,
                    extension_id=self.EXTENSION_ID,
                    supported_branches=list(self.SUPPORTED_RUNTIMES),
                    installed_branches=[],
                    owned_branches=[],
                    ownership_uncertain=False,
                )
            installed = self._installed_extension_branches()
            owned, uncertain = self._read_owned_branches()
            return self._success_response(
                dict,
                "Flatpak runtime extension status retrieved",
                available=True,
                extension_id=self.EXTENSION_ID,
                supported_branches=list(self.SUPPORTED_RUNTIMES),
                installed_branches=sorted(installed),
                owned_branches=sorted(owned),
                ownership_uncertain=uncertain,
            )
        except Exception as error:
            return self._error_response(
                dict,
                str(error),
                available=self.check_flatpak_available(),
                extension_id=self.EXTENSION_ID,
                supported_branches=list(self.SUPPORTED_RUNTIMES),
                installed_branches=[],
                owned_branches=[],
                ownership_uncertain=False,
            )

    def get_flatpak_support_status(self) -> Dict[str, Any]:
        return self.get_extension_status()

    def _resolve_runtime(self, app_id: str) -> Dict[str, Any]:
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
        runtime_ref = result.stdout.strip().splitlines()[0] if result.stdout.strip() else ""
        branch = self.runtime_branch_from_ref(runtime_ref)
        return {"runtime": runtime_ref, "runtime_branch": branch}

    def resolve_app_support(self, app_id: str) -> Dict[str, Any]:
        """Resolve the exact runtime branch required by one Flatpak app."""
        try:
            app_id = self._validate_app_id(app_id)
            resolved = self._resolve_runtime(app_id)
            installed = self._installed_extension_branches()
            branch = resolved["runtime_branch"]
            ready = branch in installed
            return self._success_response(
                dict,
                (
                    f"lsfg-vk support is ready for {app_id}"
                    if ready
                    else f"lsfg-vk runtime extension {branch} is required for {app_id}"
                ),
                flatpak_app_id=app_id,
                runtime=resolved["runtime"],
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

    def install_extension(self, version: str) -> Dict[str, Any]:
        """Install one missing branch and record ownership only after readback."""
        try:
            version = self._validate_runtime(version)
            if not self.check_flatpak_available():
                raise FileNotFoundError("Flatpak is not available on this system")
            with self._lock:
                owned, uncertain = self._read_owned_branches()
                if uncertain:
                    raise RuntimeError(
                        "Flatpak ownership metadata is uncertain; refusing to install "
                        "until it is repaired"
                    )
                installed_before = self._installed_extension_branches()
                if version in installed_before:
                    return self._success_response(
                        dict,
                        f"lsfg-vk {version} runtime extension is already installed",
                        runtime_branch=version,
                        installed=True,
                        enabled=True,
                        owned_by_plugin=version in owned,
                        preserved=version not in owned,
                    )
                bundle_path = self._bundled_extension_path(version)
                if not bundle_path.is_file():
                    raise FileNotFoundError(
                        f"Bundled Flatpak extension not found at {bundle_path}; reinstall the plugin"
                    )
                result = self._run_flatpak_command(
                    [
                        "install",
                        "--user",
                        "--noninteractive",
                        "--or-update",
                        str(bundle_path),
                    ],
                    capture_output=True,
                    text=True,
                )
                if result.returncode != 0:
                    raise OSError(result.stderr.strip() or "Flatpak installation failed")
                installed_after = self._installed_extension_branches()
                if version not in installed_after:
                    raise RuntimeError(
                        f"Flatpak install completed but {self._extension_ref(version)} "
                        "was not visible afterwards"
                    )
                owned.add(version)
                self._write_owned_branches(owned)
                return self._success_response(
                    dict,
                    f"lsfg-vk {version} runtime extension installed",
                    runtime_branch=version,
                    installed=True,
                    enabled=True,
                    owned_by_plugin=True,
                    preserved=False,
                )
        except Exception as error:
            return self._error_response(
                dict,
                str(error),
                runtime_branch=version,
                installed=False,
                enabled=False,
                owned_by_plugin=False,
                preserved=False,
            )

    def ensure_extension(self, version: str) -> Dict[str, Any]:
        status = self.get_extension_status()
        if not status.get("success"):
            return status
        if not status.get("available"):
            return self._error_response(
                dict,
                "Flatpak is not available on this system",
                runtime_branch=version,
                support_status="error",
            )
        try:
            version = self._validate_runtime(version)
        except ValueError as error:
            return self._error_response(dict, str(error), runtime_branch=version, support_status="unsupported")
        if version in status.get("installed_branches", []):
            return self._success_response(
                dict,
                f"lsfg-vk {version} runtime extension is ready",
                runtime_branch=version,
                installed=True,
                owned_by_plugin=version in status.get("owned_branches", []),
            )
        return self.install_extension(version)

    def ensure_app_support(self, app_id: str) -> Dict[str, Any]:
        """Provision only the branch returned by flatpak info for this app."""
        resolved = self.resolve_app_support(app_id)
        if not resolved.get("success") or resolved.get("support_status") != "needs-runtime":
            return resolved
        branch = resolved.get("runtime_branch")
        result = self.ensure_extension(branch)
        if not result.get("success"):
            return self._error_response(
                dict,
                result.get("error") or "Could not install the required Flatpak runtime extension",
                flatpak_app_id=app_id,
                runtime=resolved.get("runtime"),
                runtime_branch=branch,
                support_status="error",
                extension_installed=False,
            )
        final = self.resolve_app_support(app_id)
        if final.get("success") and final.get("support_status") == "ready":
            return final
        return self._error_response(
            dict,
            final.get("error") or "Required Flatpak runtime extension could not be verified",
            flatpak_app_id=app_id,
            runtime=resolved.get("runtime"),
            runtime_branch=branch,
            support_status="error",
            extension_installed=False,
        )

    def uninstall_extension(self, version: str) -> Dict[str, Any]:
        """Uninstall only when explicitly requested for a plugin-owned branch."""
        try:
            version = self._validate_runtime(version)
            if not self.check_flatpak_available():
                raise FileNotFoundError("Flatpak is not available on this system")
            with self._lock:
                owned, uncertain = self._read_owned_branches()
                if uncertain:
                    raise RuntimeError(
                        "Flatpak ownership metadata is uncertain; refusing to uninstall"
                    )
                installed = self._installed_extension_branches()
                if version not in owned:
                    if version in installed:
                        return self._success_response(
                            dict,
                            f"Preserved Flatpak extension {version}; it is not plugin-owned",
                            runtime_branch=version,
                            removed=False,
                            installed=True,
                            enabled=True,
                            owned_by_plugin=False,
                            preserved=True,
                        )
                    return self._success_response(
                        dict,
                        f"Flatpak extension {version} is already not installed",
                        runtime_branch=version,
                        removed=False,
                        installed=False,
                        enabled=False,
                        owned_by_plugin=False,
                        preserved=False,
                    )
                if version in installed:
                    result = self._run_flatpak_command(
                        [
                            "uninstall",
                            "--user",
                            "--noninteractive",
                            self._extension_ref(version),
                        ],
                        capture_output=True,
                        text=True,
                    )
                    if result.returncode != 0:
                        raise OSError(result.stderr.strip() or "Flatpak uninstall failed")
                    if version in self._installed_extension_branches():
                        raise RuntimeError(
                            f"Flatpak uninstall completed but {self._extension_ref(version)} "
                            "is still installed"
                        )
                owned.remove(version)
                self._write_owned_branches(owned)
                return self._success_response(
                    dict,
                    f"Plugin-owned lsfg-vk {version} runtime extension removed",
                    runtime_branch=version,
                    removed=True,
                    installed=False,
                    enabled=False,
                    owned_by_plugin=False,
                    preserved=False,
                )
        except Exception as error:
            return self._error_response(
                dict,
                str(error),
                runtime_branch=version,
                removed=False,
                installed=False,
                enabled=False,
                owned_by_plugin=False,
                preserved=False,
            )

    def set_extension_enabled(self, version: str, enabled: bool) -> Dict[str, Any]:
        """Set one runtime branch to the requested state, safely and idempotently."""
        if type(enabled) is not bool:
            return self._error_response(
                dict,
                "enabled must be a boolean",
                runtime_branch=version,
                installed=False,
                enabled=False,
                owned_by_plugin=False,
                preserved=False,
            )
        return self.install_extension(version) if enabled else self.uninstall_extension(version)

    def remove_plugin_owned_extensions(self) -> Dict[str, Any]:
        """Uninstall only branches recorded as installed by this plugin."""
        try:
            with self._lock:
                owned, uncertain = self._read_owned_branches()
                if uncertain:
                    return self._error_response(
                        dict,
                        "Flatpak ownership metadata is uncertain; no extensions were removed",
                        removed_branches=[],
                        preserved_branches=[],
                        ownership_uncertain=True,
                    )
                if not owned:
                    return self._success_response(
                        dict,
                        "No plugin-owned Flatpak extensions to remove",
                        removed_branches=[],
                        preserved_branches=[],
                        ownership_uncertain=False,
                    )
                if not self.check_flatpak_available():
                    return self._error_response(
                        dict,
                        "Flatpak is not available; plugin-owned extension metadata was preserved",
                        removed_branches=[],
                        preserved_branches=sorted(owned),
                        ownership_uncertain=False,
                    )
                removed: List[str] = []
                failures: List[str] = []
                for branch in sorted(owned):
                    try:
                        installed = self._installed_extension_branches()
                        if branch in installed:
                            result = self._run_flatpak_command(
                                [
                                    "uninstall",
                                    "--user",
                                    "--noninteractive",
                                    self._extension_ref(branch),
                                ],
                                capture_output=True,
                                text=True,
                            )
                            if result.returncode != 0:
                                raise OSError(result.stderr.strip() or "Flatpak uninstall failed")
                            if branch in self._installed_extension_branches():
                                raise RuntimeError(
                                    f"Flatpak uninstall completed but {self._extension_ref(branch)} "
                                    "is still installed"
                                )
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
                ownership_uncertain=False,
            )
