from __future__ import annotations

import json
import re
import shlex
import threading
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from .base_service import BaseService
from .constants import WRAPPER_FILENAME


class WrapperService(BaseService):
    LEGACY_FORMAT_VERSION = 1
    FORMAT_VERSION = 2
    LEGACY_MARKER = "# lsfg-vk-wrapper-format: 1"
    MARKER = "# lsfg-vk-wrapper-format: 2"
    WRAPPER_TOKEN = "~/.lsfg"
    STATE_FIELDS = (
        "dxvkFrameRate",
        "disableGamescopeWsi",
        "disableHdr",
        "disableSteamdeckMode",
        "disableVkbasalt",
        "enableZink",
    )
    BOOLEAN_FIELDS = STATE_FIELDS[1:]
    MANAGED_ENV_KEYS = (
        "ENABLE_GAMESCOPE_WSI",
        "DISABLE_GAMESCOPE_WSI",
        "DXVK_HDR",
        "SteamDeck",
        "DISABLE_LSFGVK",
        "DISABLE_LSFG",
        "DISABLE_VKBASALT",
        "ENABLE_VKBASALT",
        "MESA_LOADER_DRIVER_OVERRIDE",
        "__GLX_VENDOR_LIBRARY_NAME",
        "GALLIUM_DRIVER",
        "DXVK_FRAME_RATE",
    )

    def __init__(self, logger=None):
        super().__init__(logger)
        self.sidecar_path = self.config_dir / "workarounds.json"
        self.wrapper_path = self.user_home / WRAPPER_FILENAME
        self._lock = threading.RLock()

    @classmethod
    def default_state(cls) -> Dict[str, Any]:
        return {
            "dxvkFrameRate": 0,
            "disableGamescopeWsi": True,
            "disableHdr": True,
            "disableSteamdeckMode": False,
            "disableVkbasalt": False,
            "enableZink": False,
        }

    @staticmethod
    def _valid_appid(appid: Any) -> str:
        value = str(appid)
        if not re.fullmatch(r"[1-9][0-9]*", value):
            raise ValueError("Invalid Steam App ID")
        return value

    @classmethod
    def _validate_state(cls, raw: Any) -> Dict[str, Any]:
        if not isinstance(raw, dict):
            raise ValueError("Workaround state must be an object")
        missing = [field for field in cls.STATE_FIELDS if field not in raw]
        if missing:
            raise ValueError("Workaround state is missing: " + ", ".join(missing))
        state = {field: raw[field] for field in cls.STATE_FIELDS}
        frame_rate = state["dxvkFrameRate"]
        if isinstance(frame_rate, bool) or not isinstance(frame_rate, int) or not 0 <= frame_rate <= 60:
            raise ValueError("Base FPS Cap must be an integer from 0 to 60")
        for field in cls.BOOLEAN_FIELDS:
            if type(state[field]) is not bool:
                raise ValueError(f"{field} must be a boolean")
        return state

    @classmethod
    def _validate_entry(cls, raw: Any) -> Dict[str, Any]:
        if not isinstance(raw, dict):
            raise ValueError("Workaround AppID entry must be an object")
        entry: Dict[str, Any] = {
            "state": cls._validate_state(raw.get("state")),
            "command_token_added": raw.get("command_token_added", False),
        }
        if type(entry["command_token_added"]) is not bool:
            raise ValueError("command_token_added must be a boolean")
        shortcut_exe = raw.get("shortcut_exe")
        if shortcut_exe is not None:
            if (
                not isinstance(shortcut_exe, str)
                or not shortcut_exe.startswith("/")
                or "\x00" in shortcut_exe
                or Path(shortcut_exe).name != "flatpak"
            ):
                raise ValueError("shortcut_exe must be an absolute flatpak executable path")
            entry["shortcut_exe"] = shortcut_exe
        return entry

    @classmethod
    def _validate_document(cls, raw: Any) -> Dict[str, Any]:
        if not isinstance(raw, dict) or raw.get("version") not in (
            cls.LEGACY_FORMAT_VERSION,
            cls.FORMAT_VERSION,
        ):
            raise ValueError("Unsupported lsfg-vk workaround state version")
        apps = raw.get("apps")
        if not isinstance(apps, dict):
            raise ValueError("Workaround state apps must be an object")
        validated_apps: Dict[str, Any] = {}
        for appid, entry in apps.items():
            normalized = cls._valid_appid(appid)
            if normalized != str(appid):
                raise ValueError("Workaround AppIDs must not contain leading zeroes")
            validated_apps[normalized] = cls._validate_entry(entry)
        return {"version": cls.FORMAT_VERSION, "apps": validated_apps}

    def _empty_document(self) -> Dict[str, Any]:
        return {"version": self.FORMAT_VERSION, "apps": {}}

    def _read_document(self) -> Tuple[Dict[str, Any], bool, Optional[str]]:
        if not self.sidecar_path.exists():
            return self._empty_document(), False, None
        if self.sidecar_path.is_symlink() or not self.sidecar_path.is_file():
            raise RuntimeError("Workaround state path is not a regular file")
        try:
            content = self.sidecar_path.read_text(encoding="utf-8")
            raw = json.loads(content)
        except (OSError, json.JSONDecodeError) as error:
            raise RuntimeError(f"Could not read workaround state: {error}") from error
        return self._validate_document(raw), True, content

    def _wrapper_marker(self) -> bool:
        if self.wrapper_path.is_symlink() or not self.wrapper_path.exists():
            return False
        if not self.wrapper_path.is_file():
            raise RuntimeError("lsfg wrapper path is not a regular file")
        try:
            prefix = "\n".join(self.wrapper_path.read_text(encoding="utf-8").splitlines()[:8])
        except OSError as error:
            raise RuntimeError(f"Could not read lsfg wrapper: {error}") from error
        return self.MARKER in prefix or self.LEGACY_MARKER in prefix

    def _assert_wrapper_owned_or_absent(self) -> bool:
        if not self.wrapper_path.exists() and not self.wrapper_path.is_symlink():
            return False
        if self.wrapper_path.is_symlink() or not self._wrapper_marker():
            raise RuntimeError(f"Refusing to replace unowned wrapper at {self.wrapper_path}")
        return True

    @staticmethod
    def _shell(value: str) -> str:
        return shlex.quote(value)

    def _state_lines(self, state: Dict[str, Any]) -> list[str]:
        lines = ["    unset " + " ".join(self.MANAGED_ENV_KEYS)]
        lines.extend([
            '    SteamAppId="$appid"',
            "    export SteamAppId",
            f"    LSFGVK_CONFIG={self._shell(str(self.config_file_path))}",
            "    export LSFGVK_CONFIG",
        ])
        if state["disableGamescopeWsi"]:
            lines.extend(["    ENABLE_GAMESCOPE_WSI=0", "    export ENABLE_GAMESCOPE_WSI"])
        if state["disableHdr"]:
            lines.extend(["    DXVK_HDR=0", "    export DXVK_HDR"])
        if state["disableSteamdeckMode"]:
            lines.extend(["    SteamDeck=0", "    export SteamDeck"])
        if state["disableVkbasalt"]:
            lines.extend(["    DISABLE_VKBASALT=1", "    export DISABLE_VKBASALT"])
        if state["enableZink"]:
            lines.extend([
                "    __GLX_VENDOR_LIBRARY_NAME=mesa",
                "    export __GLX_VENDOR_LIBRARY_NAME",
                "    MESA_LOADER_DRIVER_OVERRIDE=zink",
                "    export MESA_LOADER_DRIVER_OVERRIDE",
                "    GALLIUM_DRIVER=zink",
                "    export GALLIUM_DRIVER",
            ])
        frame_rate = state["dxvkFrameRate"]
        if frame_rate > 0:
            lines.extend([
                '    if [ -n "${DXVK_CONFIG+x}" ]; then',
                '      if [ -n "${DXVK_CONFIG}" ]; then',
                f'        DXVK_CONFIG="${{DXVK_CONFIG}}; dxvk.maxFrameRate = {frame_rate}"',
                "      else",
                f'        DXVK_CONFIG="dxvk.maxFrameRate = {frame_rate}"',
                "      fi",
                "    else",
                f'      DXVK_CONFIG="dxvk.maxFrameRate = {frame_rate}"',
                "    fi",
                "    export DXVK_CONFIG",
            ])
        return lines

    def _render_wrapper(self, document: Dict[str, Any]) -> str:
        lines = [
            "#!/bin/sh",
            self.MARKER,
            "",
            "appid=",
            'case "${SteamAppId-}" in',
            "  ''|*[!0-9]*) ;;",
            '  *) appid="${SteamAppId}" ;;',
            "esac",
            'if [ -z "$appid" ]; then',
            '  case "${SteamGameId-}" in',
            "    ''|*[!0-9]*) ;;",
            '    *) appid="${SteamGameId}" ;;',
            "  esac",
            "fi",
            'if [ -z "$appid" ]; then',
            '  case "${STEAM_COMPAT_APP_ID-}" in',
            "    ''|*[!0-9]*) ;;",
            '    *) appid="${STEAM_COMPAT_APP_ID}" ;;',
            "  esac",
            "fi",
            'case "$appid" in',
        ]
        for appid in sorted(document["apps"], key=lambda value: int(value)):
            lines.append(f"  {appid})")
            lines.extend(self._state_lines(document["apps"][appid]["state"]))
            lines.append("    ;;")
        lines.extend([
            "esac",
            'exec "$@"',
            "",
        ])
        return "\n".join(lines)

    def _write_document(self, document: Dict[str, Any]) -> None:
        self._write_file(
            self.sidecar_path,
            json.dumps(document, indent=2, sort_keys=True) + "\n",
            0o644,
        )

    def _write_pair(self, document: Dict[str, Any]) -> None:
        old_sidecar_exists = self.sidecar_path.exists()
        old_sidecar = self.sidecar_path.read_text(encoding="utf-8") if old_sidecar_exists else None
        old_wrapper_exists = self.wrapper_path.exists() or self.wrapper_path.is_symlink()
        old_wrapper = self.wrapper_path.read_text(encoding="utf-8") if old_wrapper_exists and not self.wrapper_path.is_symlink() else None
        try:
            self._write_document(document)
            self._write_file(self.wrapper_path, self._render_wrapper(document), 0o755)
        except Exception:
            try:
                if old_sidecar_exists and old_sidecar is not None:
                    self._write_file(self.sidecar_path, old_sidecar, 0o644)
                elif self.sidecar_path.exists():
                    self.sidecar_path.unlink()
                if old_wrapper_exists and old_wrapper is not None:
                    self._write_file(self.wrapper_path, old_wrapper, 0o755)
                elif not old_wrapper_exists and self.wrapper_path.exists():
                    self.wrapper_path.unlink()
            except Exception as rollback_error:
                self.log.error(f"Could not roll back workaround wrapper update: {rollback_error}")
            raise

    def _response(self, document: Dict[str, Any], appid: str = "") -> Dict[str, Any]:
        entry = document["apps"].get(appid)
        return {
            "success": True,
            "message": "",
            "error": None,
            "appid": appid or None,
            "state": dict(entry["state"]) if entry else None,
            "wrapper_path": self.WRAPPER_TOKEN,
            "wrapper_owned": self._wrapper_marker() if document["apps"] else False,
            "shortcut_exe": entry.get("shortcut_exe") if entry else None,
            "command_token_added": entry.get("command_token_added", False) if entry else False,
        }

    def get(self, appid: str) -> Dict[str, Any]:
        try:
            normalized = self._valid_appid(appid)
            with self._lock:
                document, _, _ = self._read_document()
                self._assert_wrapper_owned_or_absent()
                return self._response(document, normalized)
        except Exception as error:
            return {
                "success": False,
                "message": "",
                "error": str(error),
                "appid": str(appid),
                "state": None,
                "wrapper_path": self.WRAPPER_TOKEN,
                "wrapper_owned": False,
            }

    def set(
        self,
        appid: str,
        state: Dict[str, Any],
        shortcut_exe: Optional[str] = None,
        command_token_added: bool = False,
    ) -> Dict[str, Any]:
        try:
            normalized = self._valid_appid(appid)
            validated_state = self._validate_state(state)
            if type(command_token_added) is not bool:
                raise ValueError("command_token_added must be a boolean")
            with self._lock:
                self._assert_wrapper_owned_or_absent()
                document, _, _ = self._read_document()
                previous_entry = document["apps"].get(normalized)
                entry: Dict[str, Any] = {
                    "state": validated_state,
                    "command_token_added": command_token_added,
                }
                selected_exe = shortcut_exe
                if selected_exe is None and previous_entry:
                    selected_exe = previous_entry.get("shortcut_exe")
                if selected_exe is not None:
                    entry = self._validate_entry({**entry, "shortcut_exe": selected_exe})
                document["apps"][normalized] = entry
                self._write_pair(document)
                return self._response(document, normalized)
        except Exception as error:
            return {
                "success": False,
                "message": "",
                "error": str(error),
                "appid": str(appid),
                "state": None,
                "wrapper_path": self.WRAPPER_TOKEN,
                "wrapper_owned": False,
            }

    def remove(self, appid: str) -> Dict[str, Any]:
        try:
            normalized = self._valid_appid(appid)
            with self._lock:
                document, _, _ = self._read_document()
                self._assert_wrapper_owned_or_absent()
                if normalized not in document["apps"]:
                    return self._response(document, normalized)
                document["apps"].pop(normalized, None)
                self._write_pair(document)
                return self._response(document, normalized)
        except Exception as error:
            return {
                "success": False,
                "message": "",
                "error": str(error),
                "appid": str(appid),
                "state": None,
                "wrapper_path": self.WRAPPER_TOKEN,
                "wrapper_owned": False,
            }

    def repair(self) -> Dict[str, Any]:
        try:
            with self._lock:
                document, _, _ = self._read_document()
                self._assert_wrapper_owned_or_absent()
                if not document["apps"]:
                    return self._response(document)
                self._write_file(self.wrapper_path, self._render_wrapper(document), 0o755)
                return self._response(document)
        except Exception as error:
            return {
                "success": False,
                "message": "",
                "error": str(error),
                "wrapper_path": self.WRAPPER_TOKEN,
                "wrapper_owned": False,
            }
