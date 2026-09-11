from __future__ import annotations

import re
from typing import Any, Dict

from .configuration import ConfigurationService
from .flatpak_service import FlatpakService


class FlatpakProfileService:
    STATE_FIELDS = (
        "dxvkFrameRate",
        "disableGamescopeWsi",
        "disableHdr",
        "disableSteamdeckMode",
        "disableVkbasalt",
        "enableZink",
    )
    BOOLEAN_FIELDS = STATE_FIELDS[1:]
    DXVK_FRAME_RATE_SEGMENT = re.compile(
        r"^(?:dxvk\.maxFrameRate|dxgi\.maxFrameRate|d3d9\.maxFrameRate)\s*=",
        re.IGNORECASE,
    )

    def __init__(
        self,
        flatpak_service: FlatpakService,
        configuration_service: ConfigurationService,
    ):
        self.flatpak_service = flatpak_service
        self.configuration_service = configuration_service

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

    def _state_entry(self, app_id: str) -> tuple[Dict[str, object], Dict[str, Any]]:
        state = self.flatpak_service._read_state()
        entry = state["prepared_apps"].get(app_id)
        if not isinstance(entry, dict):
            raise RuntimeError("Flatpak application is not owned by this plugin")
        return state, entry

    def _baseline_content(self, app_id: str, entry: Dict[str, Any]) -> str:
        if not entry.get("override_existed"):
            return ""
        path = self.flatpak_service._backup_path(app_id)
        if path.is_symlink() or not path.is_file():
            raise RuntimeError("Flatpak override backup is unavailable")
        return path.read_text(encoding="utf-8")

    @staticmethod
    def _environment_value(content: str, key: str) -> str:
        section = None
        for raw_line in content.splitlines():
            line = raw_line.strip()
            if line.startswith("[") and line.endswith("]"):
                section = line[1:-1]
                continue
            if section != "Environment":
                continue
            name, separator, value = line.partition("=")
            if separator and name == key:
                return value
        return ""

    @classmethod
    def _dxvk_config(cls, baseline: str, frame_rate: int) -> str:
        existing = cls._environment_value(baseline, "DXVK_CONFIG")
        parts = [part.strip() for part in existing.split(";") if part.strip()]
        parts = [part for part in parts if not cls.DXVK_FRAME_RATE_SEGMENT.match(part)]
        if frame_rate > 0:
            parts.append(f"dxvk.maxFrameRate = {frame_rate}")
        return "; ".join(parts)

    def _restore_baseline(self, app_id: str, entry: Dict[str, Any]) -> None:
        existed, current = self.flatpak_service._snapshot_override(app_id)
        current_hash = self.flatpak_service._sha256(current) if existed else self.flatpak_service._sha256(b"")
        if current_hash != entry.get("managed_sha256"):
            raise RuntimeError("Flatpak override changed after preparation; refusing to overwrite unrelated settings")
        path = self.flatpak_service._override_path(app_id)
        if entry.get("override_existed"):
            self.flatpak_service._write_file(path, self._baseline_content(app_id, entry))
        else:
            path.unlink(missing_ok=True)

    def _apply_state(self, app_id: str, workaround_state: Dict[str, Any]) -> Dict[str, Any]:
        workaround_state = self._validate_state(workaround_state)
        _, entry = self._state_entry(app_id)
        baseline = self._baseline_content(app_id, entry)
        self._restore_baseline(app_id, entry)
        prepared = self.flatpak_service.prepare_app(app_id)
        if not prepared.get("success") or not prepared.get("owned"):
            raise RuntimeError(prepared.get("error") or "Could not restore plugin-owned Flatpak preparation")
        profile = self.configuration_service.flatpak_profile_name(app_id)
        args = [
            "override",
            "--user",
            f"--env=LSFGVK_PROFILE={profile}",
            "--unset-env=DISABLE_LSFGVK",
            "--unset-env=DISABLE_LSFG",
        ]
        if workaround_state["disableGamescopeWsi"]:
            args.extend(["--env=ENABLE_GAMESCOPE_WSI=0", "--unset-env=DISABLE_GAMESCOPE_WSI"])
        if workaround_state["disableHdr"]:
            args.append("--env=DXVK_HDR=0")
        if workaround_state["disableSteamdeckMode"]:
            args.append("--env=SteamDeck=0")
        if workaround_state["disableVkbasalt"]:
            args.extend(["--env=DISABLE_VKBASALT=1", "--unset-env=ENABLE_VKBASALT"])
        if workaround_state["enableZink"]:
            args.extend([
                "--env=__GLX_VENDOR_LIBRARY_NAME=mesa",
                "--env=MESA_LOADER_DRIVER_OVERRIDE=zink",
                "--env=GALLIUM_DRIVER=zink",
            ])
        dxvk_config = self._dxvk_config(baseline, workaround_state["dxvkFrameRate"])
        if dxvk_config:
            args.append(f"--env=DXVK_CONFIG={dxvk_config}")
        args.append(app_id)
        result = self.flatpak_service._run_flatpak_command(args, capture_output=True, text=True)
        if result.returncode != 0:
            raise OSError(result.stderr.strip() or f"Could not apply Flatpak workarounds for {app_id}")
        existed, managed = self.flatpak_service._snapshot_override(app_id)
        if not existed:
            raise RuntimeError(f"Flatpak override for {app_id} was not created")
        state = self.flatpak_service._read_state()
        entry = state["prepared_apps"].get(app_id)
        if not isinstance(entry, dict):
            raise RuntimeError("Flatpak application ownership state disappeared")
        entry["managed_sha256"] = self.flatpak_service._sha256(managed)
        entry["workaround_state"] = workaround_state
        self.flatpak_service._write_state(state)
        return workaround_state

    def enable_app(self, app_id: str) -> Dict[str, Any]:
        created_profile = False
        newly_owned = False
        try:
            existing = self.configuration_service.get_flatpak_config(app_id)
            before = self.flatpak_service._read_state()
            was_owned = app_id in before["prepared_apps"]
            prepared = self.flatpak_service.prepare_app(app_id)
            if not prepared.get("success"):
                raise RuntimeError(prepared.get("error") or "Could not prepare Flatpak application")
            if not prepared.get("owned"):
                raise RuntimeError("Flatpak application is prepared outside this plugin and cannot be managed safely")
            newly_owned = not was_owned
            if not existing.get("exists"):
                config = {
                    **self.configuration_service._public_config({}),
                    **(existing.get("global_config") or {}),
                }
                config["active_in"] = []
                saved = self.configuration_service.update_flatpak_config(app_id, config)
                if not saved.get("success"):
                    raise RuntimeError(saved.get("error") or "Could not create Flatpak profile")
                created_profile = True
            _, entry = self._state_entry(app_id)
            workaround_state = self._validate_state(entry.get("workaround_state", self.default_state()))
            self._apply_state(app_id, workaround_state)
            return self.get_app(app_id)
        except Exception as error:
            if created_profile:
                self.configuration_service.reset_flatpak_config(app_id)
            if newly_owned:
                self.flatpak_service.remove_app_override(app_id)
            return {
                "success": False,
                "message": "",
                "error": str(error),
                "app_id": str(app_id),
                "enabled": False,
            }

    def update_config(self, app_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            self._state_entry(app_id)
            result = self.configuration_service.update_flatpak_config(app_id, config)
            if not result.get("success"):
                raise RuntimeError(result.get("error") or "Could not update Flatpak profile")
            return result
        except Exception as error:
            return {
                "success": False,
                "message": "",
                "error": str(error),
                "app_id": str(app_id),
                "enabled": False,
            }

    def get_workaround_state(self, app_id: str) -> Dict[str, Any]:
        try:
            _, entry = self._state_entry(app_id)
            state = self._validate_state(entry.get("workaround_state", self.default_state()))
            return {
                "success": True,
                "message": "",
                "error": None,
                "app_id": app_id,
                "state": state,
            }
        except Exception as error:
            return {
                "success": False,
                "message": "",
                "error": str(error),
                "app_id": str(app_id),
                "state": None,
            }

    def set_workaround_state(self, app_id: str, workaround_state: Dict[str, Any]) -> Dict[str, Any]:
        try:
            state = self._apply_state(app_id, workaround_state)
            return {
                "success": True,
                "message": "",
                "error": None,
                "app_id": app_id,
                "state": state,
            }
        except Exception as error:
            return {
                "success": False,
                "message": "",
                "error": str(error),
                "app_id": str(app_id),
                "state": None,
            }

    def remove_app(self, app_id: str) -> Dict[str, Any]:
        try:
            removed = self.flatpak_service.remove_app_override(app_id)
            if not removed.get("success"):
                raise RuntimeError(removed.get("error") or "Could not remove Flatpak preparation")
            reset = self.configuration_service.reset_flatpak_config(app_id)
            if not reset.get("success"):
                raise RuntimeError(reset.get("error") or "Could not remove Flatpak profile")
            return {
                "success": True,
                "message": "Flatpak profile removed",
                "error": None,
                "app_id": app_id,
                "enabled": False,
            }
        except Exception as error:
            return {
                "success": False,
                "message": "",
                "error": str(error),
                "app_id": str(app_id),
                "enabled": True,
            }

    def get_app(self, app_id: str) -> Dict[str, Any]:
        apps = self.get_apps()
        if not apps.get("success"):
            return {
                "success": False,
                "message": "",
                "error": apps.get("error"),
                "app_id": str(app_id),
                "enabled": False,
            }
        app = next((item for item in apps.get("apps", []) if item.get("app_id") == app_id), None)
        if app is None:
            return {
                "success": False,
                "message": "",
                "error": "Flatpak application is not installed",
                "app_id": str(app_id),
                "enabled": False,
            }
        return {"success": True, "message": "", "error": None, **app}

    def get_apps(self) -> Dict[str, Any]:
        try:
            result = self.flatpak_service.get_flatpak_apps()
            if not result.get("success"):
                raise RuntimeError(result.get("error") or "Could not list Flatpak applications")
            ownership = self.flatpak_service._read_state()
            apps = []
            for item in result.get("apps", []):
                app_id = item["app_id"]
                config_result = self.configuration_service.get_flatpak_config(app_id)
                entry = ownership["prepared_apps"].get(app_id)
                workarounds = self.default_state()
                if isinstance(entry, dict):
                    workarounds = self._validate_state(entry.get("workaround_state", workarounds))
                profile = self.configuration_service.flatpak_profile_name(app_id)
                selector_ready = False
                if item.get("prepared"):
                    shown = self.flatpak_service._run_flatpak_command(
                        ["override", "--user", "--show", app_id],
                        capture_output=True,
                        text=True,
                    )
                    selector_ready = shown.returncode == 0 and f"LSFGVK_PROFILE={profile}" in shown.stdout.splitlines()
                apps.append({
                    **item,
                    "profile": profile,
                    "enabled": bool(item.get("owned") and config_result.get("exists") and selector_ready),
                    "config": config_result.get("config"),
                    "workarounds": workarounds,
                })
            return {
                "success": True,
                "message": result.get("message", ""),
                "error": None,
                "apps": apps,
            }
        except Exception as error:
            return {"success": False, "message": "", "error": str(error), "apps": []}

    def get_running_apps(self) -> Dict[str, Any]:
        try:
            state = self.flatpak_service._read_state()
            enabled = set()
            for app_id, entry in state["prepared_apps"].items():
                if not isinstance(entry, dict):
                    continue
                config = self.configuration_service.get_flatpak_config(app_id)
                if not config.get("exists"):
                    continue
                existed, content = self.flatpak_service._snapshot_override(app_id)
                if not existed or self.flatpak_service._sha256(content) != entry.get("managed_sha256"):
                    continue
                profile = self.configuration_service.flatpak_profile_name(app_id)
                try:
                    text = content.decode("utf-8")
                except UnicodeDecodeError:
                    continue
                if self._environment_value(text, "LSFGVK_PROFILE") == profile:
                    enabled.add(app_id)
            if not enabled:
                return {"success": True, "message": "", "error": None, "apps": []}
            result = self.flatpak_service._run_flatpak_command(
                ["ps", "--columns=application,active,pid"],
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                raise OSError(result.stderr.strip() or "Could not inspect running Flatpak applications")
            running = []
            for line in result.stdout.splitlines():
                fields = line.split("\t") if "\t" in line else line.split()
                if not fields or fields[0] not in enabled:
                    continue
                active = len(fields) > 1 and fields[1].strip().lower() in {"1", "true", "yes", "active"}
                running.append({
                    "app_id": fields[0],
                    "active": active,
                    "pid": fields[2].strip() if len(fields) > 2 else "",
                    "start_time": self.flatpak_service._process_start_time(
                        fields[2].strip() if len(fields) > 2 else ""
                    ),
                })
            running.sort(key=lambda item: (
                not item["active"],
                -(item["start_time"] if isinstance(item["start_time"], int) else -1),
                -int(item["pid"]) if str(item["pid"]).isdigit() else 1,
                item["app_id"],
            ))
            return {"success": True, "message": "", "error": None, "apps": running}
        except Exception as error:
            return {"success": False, "message": "", "error": str(error), "apps": []}
