"""Own the small per-AppID workaround dispatcher used by Steam launches."""

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
    """Persist workaround state and compile it into a safe POSIX wrapper."""

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
    def _validate_transport(cls, raw: Any) -> Dict[str, Any]:
        if raw is None:
            return {"kind": "host"}
        if not isinstance(raw, dict):
            raise ValueError("Workaround transport must be an object")
        kind = raw.get("kind")
        if kind == "host":
            return {"kind": "host"}
        if kind == "flatpak":
            app_id = raw.get("flatpakAppId")
            if (
                not isinstance(app_id, str)
                or not re.fullmatch(
                    r"^[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*)+$",
                    app_id,
                )
            ):
                raise ValueError("Flatpak transport requires a valid application ID")
            return {"kind": "flatpak", "flatpakAppId": app_id}
        raise ValueError("Workaround transport must be host or flatpak")

    @classmethod
    def _validate_entry(cls, raw: Any) -> Dict[str, Any]:
        if not isinstance(raw, dict):
            raise ValueError("Workaround AppID entry must be an object")
        entry = {
            "state": cls._validate_state(raw.get("state")),
            "command_token_added": raw.get("command_token_added", False),
            # Version 1 entries had no transport field.  They are preserved as
            # host entries until the shortcut is explicitly repaired with the
            # backend's classified transport.
            "transport": cls._validate_transport(raw.get("transport")),
        }
        if type(entry["command_token_added"]) is not bool:
            raise ValueError("command_token_added must be a boolean")
        if entry["transport"]["kind"] == "flatpak" and "shortcut_exe" in raw and raw["shortcut_exe"] is not None:
            shortcut_exe = raw["shortcut_exe"]
            if (
                not isinstance(shortcut_exe, str)
                or not shortcut_exe.startswith("/")
                or "\x00" in shortcut_exe
                or not shortcut_exe.strip()
            ):
                raise ValueError("shortcut_exe must be an absolute executable path")
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
            raw = json.loads(self.sidecar_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise RuntimeError(f"Could not read workaround state: {error}") from error
        document = self._validate_document(raw)
        return document, True, self.sidecar_path.read_text(encoding="utf-8")

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
            raise RuntimeError(
                f"Refusing to replace unowned wrapper at {self.wrapper_path}"
            )
        return True

    @staticmethod
    def _shell(value: str) -> str:
        return shlex.quote(value)

    @staticmethod
    def _direct_flatpak_tokens(value: str) -> Optional[list[str]]:
        """Parse the supported full executable form: /usr/bin/flatpak run APP."""
        try:
            tokens = shlex.split(value, posix=True)
        except ValueError:
            return None
        if len(tokens) >= 3 and Path(tokens[0]).name == "flatpak" and tokens[1] == "run":
            return tokens
        return None

    @classmethod
    def _state_lines(cls, state: Dict[str, Any], shortcut_exe: Optional[str]) -> list[str]:
        lines = ["    unset " + " ".join(cls.MANAGED_ENV_KEYS)]
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
        lines.append(f"    shortcut_exe={cls._shell(shortcut_exe or '')}")
        return lines

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

    def _flatpak_args(self, state: Dict[str, Any]) -> list[str]:
        config_dir = str(self.config_dir)
        config_file = str(self.config_file_path)
        dll_dir = str(self._dll_directory())
        args = [
            self._shell(f"--filesystem={config_dir}:rw"),
            self._shell(f"--filesystem={dll_dir}:ro"),
            self._shell(f"--env=LSFGVK_CONFIG={config_file}"),
            '"--env=LSFGVK_FLATPAK=1"',
            '"--env=SteamAppId=$appid"',
            '"--unset-env=DISABLE_GAMESCOPE_WSI"',
            '"--unset-env=ENABLE_GAMESCOPE_WSI"' if not state["disableGamescopeWsi"] else
            '"--env=ENABLE_GAMESCOPE_WSI=0"',
            '"--unset-env=DXVK_HDR"' if not state["disableHdr"] else
            '"--env=DXVK_HDR=0"',
            '"--unset-env=SteamDeck"' if not state["disableSteamdeckMode"] else
            '"--env=SteamDeck=0"',
            '"--unset-env=DISABLE_VKBASALT" "--unset-env=ENABLE_VKBASALT"',
        ]
        if state["disableVkbasalt"]:
            args.append('"--env=DISABLE_VKBASALT=1"')
        args.extend([
            '"--unset-env=MESA_LOADER_DRIVER_OVERRIDE" "--unset-env=__GLX_VENDOR_LIBRARY_NAME" "--unset-env=GALLIUM_DRIVER"',
        ])
        if state["enableZink"]:
            args.extend([
                '"--env=__GLX_VENDOR_LIBRARY_NAME=mesa"',
                '"--env=MESA_LOADER_DRIVER_OVERRIDE=zink"',
                '"--env=GALLIUM_DRIVER=zink"',
            ])
        args.extend([
            '"--unset-env=DXVK_FRAME_RATE"',
        ])
        static_args = " ".join(args)
        return [
            '    if [ -n "${DXVK_CONFIG+x}" ]; then',
            f'      set -- "$flatpak_command" {static_args} "--env=DXVK_CONFIG=$DXVK_CONFIG" "$@"',
            "    else",
            f'      set -- "$flatpak_command" {static_args} "$@"',
            "    fi",
        ]

    def _render_wrapper(self, document: Dict[str, Any]) -> str:
        lines = [
            "#!/bin/sh",
            self.MARKER,
            "# Generated by Decky LSFG-VK; edits will be rejected on the next update.",
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
            "shortcut_exe=",
            'case "$appid" in',
        ]
        for appid in sorted(document["apps"], key=lambda value: int(value)):
            entry = document["apps"][appid]
            lines.append(f"  {appid})")
            lines.extend(self._state_lines(entry["state"], entry.get("shortcut_exe")))
            lines.append("    ;;")
        lines.extend([
            "esac",
            "",
            'if [ -n "$shortcut_exe" ]; then',
        ])
        # The arguments are emitted per branch below so the values are static and
        # the wrapper never needs a JSON parser or another helper executable.
        lines.append('    case "$appid" in')
        for appid in sorted(document["apps"], key=lambda value: int(value)):
            entry = document["apps"][appid]
            transport = entry.get("transport", {"kind": "host"})
            if transport.get("kind") != "flatpak":
                continue
            shortcut_exe = entry.get("shortcut_exe", "")
            direct_flatpak_tokens = self._direct_flatpak_tokens(shortcut_exe)
            if direct_flatpak_tokens is None and Path(shortcut_exe).name != "flatpak":
                raise ValueError(
                    f"Flatpak target {appid} does not use a direct flatpak executable"
                )
            lines.append(f"      {appid})")
            lines.extend([
                *(
                    [
                        f"        shortcut_exe={self._shell(direct_flatpak_tokens[0])}",
                        "        set -- "
                        + " ".join(self._shell(token) for token in direct_flatpak_tokens[1:])
                        + ' "$@"',
                    ]
                    if direct_flatpak_tokens
                    else []
                ),
                '        if [ "${1-}" != "run" ]; then',
                '          echo "lsfg-vk: Flatpak shortcut must use direct flatpak run transport" >&2',
                "          exit 64",
                "        fi",
                '        flatpak_command="$1"',
                "        shift",
                "        flatpak_target=",
                '        for flatpak_arg in "$@"; do',
                '          case "$flatpak_arg" in',
                '            -*) ;;',
                '            *) flatpak_target="$flatpak_arg"; break ;;',
                "          esac",
                "        done",
                f'        if [ "$flatpak_target" != {self._shell(transport["flatpakAppId"])} ]; then',
                '          echo "lsfg-vk: Flatpak shortcut application ID changed externally" >&2',
                "          exit 64",
                "        fi",
            ])
            lines.extend(self._flatpak_args(entry["state"]))
            lines.append("        ;;")
        lines.extend([
            "    esac",
            '  exec "$shortcut_exe" "$@"',
            "fi",
            'exec "$@"',
            "",
        ])
        return "\n".join(lines)

    def _write_document(self, document: Dict[str, Any]) -> None:
        content = json.dumps(document, indent=2, sort_keys=True) + "\n"
        self._write_file(self.sidecar_path, content, 0o644)

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
            "transport": dict(entry.get("transport", {"kind": "host"})) if entry else None,
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
        transport: Optional[Dict[str, Any]] = None,
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
                selected_transport = self._validate_transport(
                    transport
                    if transport is not None
                    else (
                        previous_entry.get("transport")
                        if previous_entry
                        else None
                    )
                )
                entry: Dict[str, Any] = {
                    "state": validated_state,
                    "command_token_added": bool(command_token_added),
                    "transport": selected_transport,
                }
                if selected_transport["kind"] == "flatpak":
                    if shortcut_exe is not None:
                        entry = self._validate_entry({**entry, "shortcut_exe": shortcut_exe})
                    elif previous_entry and "shortcut_exe" in previous_entry:
                        entry["shortcut_exe"] = previous_entry["shortcut_exe"]
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
        """Regenerate a missing owned wrapper without importing old global state."""
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
