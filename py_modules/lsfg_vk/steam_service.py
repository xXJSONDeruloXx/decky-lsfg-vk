import re
from pathlib import Path
from typing import Dict, Optional, Tuple

from .base_service import BaseService
from .constants import STEAM_LOSSLESS_SCALING_APP_ID, STEAM_LOSSLESS_SCALING_BRANCH


class SteamService(BaseService):
    DEFAULT_BRANCH = "public"
    MANIFEST_FILENAME = f"appmanifest_{STEAM_LOSSLESS_SCALING_APP_ID}.acf"
    # Valve compatibility tools, runtimes, Steamworks redistributables, and LSFG.
    GAME_SELECTOR_EXCLUDED_APPIDS = {
        "858280",   # Proton 3.7
        "961940",   # Proton 3.16
        "1054830",  # Proton 4.2
        "1113280",  # Proton 4.11
        "1245040",  # Proton 5.0
        "1420170",  # Proton 5.13
        "1493710",  # Proton Experimental
        "1580130",  # Proton 6.3
        "1887720",  # Proton 7
        "2180100",  # Proton Hotfix
        "228980",   # Steamworks Common Redistributables
        "2348590",  # Proton 8
        "2805730",  # Proton 9
        "3029110",  # Lepton
        "3127680",  # fex
        "3658110",  # Proton 10
        "4183110",  # Steam Linux Runtime 4.0
        "4185400",  # Steam Linux Runtime 4.0 for arm64
        "4427310",  # Proton Experimental (ARM64)
        "4628710",  # Proton 11 / Proton Next
        "4628740",  # Proton 11 (ARM64)
        "4690330",  # Legacy Steam Runtime
        "993090",   # Lossless Scaling
        "1070560",  # Steam Linux Runtime 1.0
        "1391110",  # Steam Linux Runtime 2.0
        "1628350",  # Steam Linux Runtime 3.0
    }

    def _steam_roots(self):
        candidates = (
            self.user_home / ".local/share/Steam",
            self.user_home / ".steam/steam",
            self.user_home / ".steam/root",
            self.user_home / ".var/app/com.valvesoftware.Steam/.local/share/Steam",
        )
        seen = set()

        for candidate in candidates:
            yield from self._unique_existing_root(candidate, seen)

    def _steam_library_roots(self):
        seen = set()
        for candidate in self._steam_roots():
            yield from self._unique_existing_root(candidate, seen)

            library_file = candidate / "steamapps/libraryfolders.vdf"
            try:
                content = library_file.read_text(encoding="utf-8")
            except OSError:
                continue

            for raw_path in re.findall(r'(?m)^\s*"path"\s+"((?:\\.|[^"])*)"', content):
                path = raw_path.replace(r'\"', '"').replace(r'\\', '\\')
                yield from self._unique_existing_root(Path(path), seen)

    @staticmethod
    def _read_shortcuts(data: bytes) -> Dict[str, object]:
        def read_string(offset: int) -> Tuple[str, int]:
            end = data.index(b"\0", offset)
            return data[offset:end].decode("utf-8", errors="replace"), end + 1

        def read_object(offset: int = 0) -> Tuple[Dict[str, object], int]:
            values = {}
            while offset < len(data):
                value_type, offset = data[offset], offset + 1
                if value_type == 8:
                    return values, offset
                key, offset = read_string(offset)
                if value_type == 0:
                    value, offset = read_object(offset)
                elif value_type == 1:
                    value, offset = read_string(offset)
                elif value_type == 2:
                    if offset + 4 > len(data):
                        raise ValueError("truncated binary VDF integer")
                    value = int.from_bytes(data[offset:offset + 4], "little", signed=True)
                    offset += 4
                else:
                    raise ValueError(f"unsupported binary VDF type {value_type}")
                values[key] = value
            raise ValueError("unterminated binary VDF object")

        values, offset = read_object()
        if offset != len(data):
            raise ValueError("trailing binary VDF data")
        return values

    @staticmethod
    def _shortcut_game(shortcut: object) -> Optional[Dict[str, object]]:
        if not isinstance(shortcut, dict):
            return None
        appid = shortcut.get("appid")
        name = shortcut.get("AppName")
        if not isinstance(appid, int) or appid == 0 or not isinstance(name, str) or not name:
            return None
        return {"appid": str(appid & 0xffffffff), "name": name, "nonSteam": True}

    def _shortcut_games(self):
        games = {}
        for steam_root in self._steam_roots():
            for shortcuts_file in sorted((steam_root / "userdata").glob("*/config/shortcuts.vdf")):
                try:
                    root = self._read_shortcuts(shortcuts_file.read_bytes())
                except (OSError, ValueError):
                    continue
                shortcuts = root.get("shortcuts", {})
                if not isinstance(shortcuts, dict):
                    continue
                for shortcut in shortcuts.values():
                    game = self._shortcut_game(shortcut)
                    if game and game["appid"] not in self.GAME_SELECTOR_EXCLUDED_APPIDS:
                        games.setdefault(game["appid"], game)
        return list(games.values())

    @staticmethod
    def _unique_existing_root(path: Path, seen: set[str]):
        if not path.exists():
            return
        try:
            resolved = str(path.resolve())
        except OSError:
            resolved = str(path)
        if resolved in seen:
            return
        seen.add(resolved)
        yield path

    def _manifest_path(self) -> Optional[Path]:
        for library_root in self._steam_library_roots():
            manifest = library_root / "steamapps" / self.MANIFEST_FILENAME
            if manifest.is_file():
                return manifest
        return None

    @staticmethod
    def _section_bounds(content: str, section_name: str) -> Optional[Tuple[int, int, str]]:
        section = re.search(
            rf'(?m)^(?P<indent>[ \t]*)"{re.escape(section_name)}"[ \t\r\n]*\{{',
            content,
        )
        if section is None:
            return None

        depth = 1
        in_string = False
        escaped = False
        for index in range(section.end(), len(content)):
            character = content[index]
            if in_string:
                if escaped:
                    escaped = False
                elif character == "\\":
                    escaped = True
                elif character == '"':
                    in_string = False
                continue

            if character == '"':
                in_string = True
            elif character == "{":
                depth += 1
            elif character == "}":
                depth -= 1
                if depth == 0:
                    return section.end(), index, section.group("indent")
        return None

    @classmethod
    def _section_value(cls, content: str, section_name: str, key: str) -> Optional[str]:
        bounds = cls._section_bounds(content, section_name)
        if bounds is None:
            return None
        body_start, body_end, _ = bounds
        pattern = re.compile(
            r'(?m)^[ \t]*"(?P<key>[^"]+)"[ \t]+"(?P<value>(?:\\.|[^"\\])*)"'
        )
        for match in pattern.finditer(content, body_start, body_end):
            if match.group("key") == key:
                return match.group("value")
        return None

    @classmethod
    def _branch_or_default(cls, branch: Optional[str]) -> str:
        return branch or cls.DEFAULT_BRANCH

    def _status_fields(self, manifest_path: Path, content: str) -> Dict[str, object]:
        selected_branch = self._branch_or_default(
            self._section_value(content, "UserConfig", "BetaKey")
        )
        current_branch = self._branch_or_default(
            self._section_value(content, "MountedConfig", "BetaKey")
            or self._section_value(content, "UserConfig", "BetaKey")
        )
        needs_switch = (
            selected_branch != STEAM_LOSSLESS_SCALING_BRANCH
            or current_branch != STEAM_LOSSLESS_SCALING_BRANCH
        )
        return {
            "installed": True,
            "manifest_path": str(manifest_path),
            "selected_branch": selected_branch,
            "current_branch": current_branch,
            "target_branch": STEAM_LOSSLESS_SCALING_BRANCH,
            "needs_switch": needs_switch,
            "restart_required": (
                selected_branch == STEAM_LOSSLESS_SCALING_BRANCH
                and current_branch != STEAM_LOSSLESS_SCALING_BRANCH
            ),
        }

    def find_lsfg_vk_dll(self) -> Optional[str]:
        """Find the branch-specific upstream DLL in any Steam library."""
        if self.get_branch_status().get("needs_switch"):
            return None
        for library_root in self._steam_library_roots():
            dll_path = library_root / "steamapps/common/Lossless Scaling/lsfg-vk.dll"
            if dll_path.is_file():
                return str(dll_path)
        return None

    def get_branch_status(self) -> Dict[str, object]:
        try:
            manifest_path = self._manifest_path()
            if manifest_path is None:
                return self._success_response(
                    dict,
                    "Lossless Scaling is not installed through Steam",
                    installed=False,
                    manifest_path=None,
                    selected_branch=None,
                    current_branch=None,
                    target_branch=STEAM_LOSSLESS_SCALING_BRANCH,
                    needs_switch=False,
                    restart_required=False,
                )

            content = manifest_path.read_text(encoding="utf-8")
            fields = self._status_fields(manifest_path, content)
            if not fields["needs_switch"]:
                message = "Lossless Scaling is using the lsfg-vk Steam branch"
            elif fields["restart_required"]:
                message = "lsfg-vk is selected; restart Steam to finish the branch switch"
            else:
                message = "Lossless Scaling is not using the lsfg-vk Steam branch"
            return self._success_response(dict, message, **fields)
        except Exception as error:
            return self._error_response(
                dict,
                str(error),
                installed=False,
                manifest_path=None,
                selected_branch=None,
                current_branch=None,
                target_branch=STEAM_LOSSLESS_SCALING_BRANCH,
                needs_switch=False,
                restart_required=False,
            )

    def get_installed_games(self) -> Dict[str, object]:
        """Return installed Steam app IDs and names for the Game Mode selector."""
        try:
            games: Dict[str, Dict[str, object]] = {}
            for library_root in self._steam_library_roots():
                for manifest in (library_root / "steamapps").glob("appmanifest_*.acf"):
                    match = re.fullmatch(r"appmanifest_(\d+)\.acf", manifest.name)
                    if not match:
                        continue
                    try:
                        content = manifest.read_text(encoding="utf-8")
                    except OSError:
                        continue
                    appid = match.group(1)
                    if appid in self.GAME_SELECTOR_EXCLUDED_APPIDS:
                        continue
                    name = self._section_value(content, "AppState", "name") or f"App {appid}"
                    games[appid] = {"appid": appid, "name": name, "nonSteam": False}
            for game in self._shortcut_games():
                games.setdefault(str(game["appid"]), game)
            return self._success_response(
                dict,
                games=sorted(games.values(), key=lambda game: str(game["name"]).lower()),
            )
        except Exception as error:
            return self._error_response(dict, str(error), games=[])
