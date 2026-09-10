import re
from pathlib import Path
from typing import Dict, Optional, Tuple

from .base_service import BaseService
from .constants import (
    STEAM_LOSSLESS_SCALING_APP_ID,
    STEAM_LOSSLESS_SCALING_BRANCH,
)


def _first_string(values: Dict[str, object], *keys: str) -> Optional[str]:
    return next((values[key] for key in keys if isinstance(values.get(key), str)), None)


class SteamService(BaseService):
    DEFAULT_BRANCH = "public"
    MANIFEST_FILENAME = f"appmanifest_{STEAM_LOSSLESS_SCALING_APP_ID}.acf"
    GAME_SELECTOR_EXCLUDED_APPIDS = {
        "858280", "961940", "1054830", "1113280", "1245040", "1420170",
        "1493710", "1580130", "1887720", "2180100", "228980", "2348590",
        "2805730", "3029110", "3127680", "3658110", "4183110", "4185400",
        "4427310", "4628710", "4628740", "4690330", "993090", "1070560",
        "1391110", "1628350",
    }

    def _steam_roots(self):
        seen = set()
        for candidate in (
            self.user_home / ".local/share/Steam",
            self.user_home / ".steam/steam",
            self.user_home / ".steam/root",
            self.user_home / ".var/app/com.valvesoftware.Steam/.local/share/Steam",
        ):
            yield from self._unique_existing_root(candidate, seen)

    def _steam_library_roots(self):
        seen = set()
        for root in self._steam_roots():
            yield from self._unique_existing_root(root, seen)
            for library_file in (
                root / "steamapps/libraryfolders.vdf",
                root / "config/libraryfolders.vdf",
            ):
                try:
                    content = library_file.read_text(encoding="utf-8")
                except OSError:
                    continue
                for raw_path in re.findall(r'(?m)^\s*"path"\s+"((?:\\.|[^"])*)"', content):
                    path = raw_path.replace(r'\"', '"').replace(r'\\', '\\')
                    yield from self._unique_existing_root(Path(path), seen)

    @staticmethod
    def _unique_existing_root(path: Path, seen: set[str]):
        if not path.exists():
            return
        try:
            resolved = str(path.resolve())
        except OSError:
            resolved = str(path)
        if resolved not in seen:
            seen.add(resolved)
            yield path

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
                elif value_type in (2, 7):
                    width = 4 if value_type == 2 else 8
                    if offset + width > len(data):
                        raise ValueError("truncated binary VDF integer")
                    value = int.from_bytes(data[offset:offset + width], "little", signed=True)
                    offset += width
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
        name = shortcut.get("AppName") or shortcut.get("appname")
        if not isinstance(appid, int) or appid == 0 or not isinstance(name, str) or not name:
            return None
        executable = _first_string(shortcut, "Exe", "exe", "executable")
        arguments = _first_string(shortcut, "LaunchOptions", "launchoptions", "launch_options", "arguments")
        start_dir = _first_string(shortcut, "StartDir", "startdir", "start_dir")
        game: Dict[str, object] = {
            "appid": str(appid & 0xFFFFFFFF),
            "name": name,
            "nonSteam": True,
        }
        for key, value in (("executable", executable), ("arguments", arguments), ("startDir", start_dir)):
            if value is not None:
                game[key] = value
        return game

    def _shortcut_games(self):
        games = {}
        for root in self._steam_roots():
            for path in sorted((root / "userdata").glob("*/config/shortcuts.vdf")):
                try:
                    shortcuts = self._read_shortcuts(path.read_bytes()).get("shortcuts", {})
                except (OSError, ValueError):
                    continue
                if not isinstance(shortcuts, dict):
                    continue
                for shortcut in shortcuts.values():
                    game = self._shortcut_game(shortcut)
                    if game and game["appid"] not in self.GAME_SELECTOR_EXCLUDED_APPIDS:
                        games.setdefault(game["appid"], game)
        return list(games.values())

    def _manifest_path(self) -> Optional[Path]:
        return next((
            path
            for root in self._steam_library_roots()
            if (path := root / "steamapps" / self.MANIFEST_FILENAME).is_file()
        ), None)

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
            elif character == '"':
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
        start, end, _ = bounds
        pattern = re.compile(r'(?m)^[ \t]*"(?P<key>[^"]+)"[ \t]+"(?P<value>(?:\\.|[^"\\])*)"')
        return next((
            match.group("value")
            for match in pattern.finditer(content, start, end)
            if match.group("key") == key
        ), None)

    @classmethod
    def _branch_or_default(cls, branch: Optional[str]) -> str:
        return branch or cls.DEFAULT_BRANCH

    def _status_fields(self, manifest_path: Path, content: str) -> Dict[str, object]:
        selected = self._branch_or_default(self._section_value(content, "UserConfig", "BetaKey"))
        current = self._branch_or_default(
            self._section_value(content, "MountedConfig", "BetaKey")
            or self._section_value(content, "UserConfig", "BetaKey")
        )
        needs_switch = selected != STEAM_LOSSLESS_SCALING_BRANCH or current != STEAM_LOSSLESS_SCALING_BRANCH
        return {
            "installed": True,
            "manifest_path": str(manifest_path),
            "selected_branch": selected,
            "current_branch": current,
            "target_branch": STEAM_LOSSLESS_SCALING_BRANCH,
            "needs_switch": needs_switch,
            "restart_required": selected == STEAM_LOSSLESS_SCALING_BRANCH and current != STEAM_LOSSLESS_SCALING_BRANCH,
        }

    @staticmethod
    def _missing_branch_fields() -> Dict[str, object]:
        return {
            "installed": False,
            "manifest_path": None,
            "selected_branch": None,
            "current_branch": None,
            "target_branch": STEAM_LOSSLESS_SCALING_BRANCH,
            "needs_switch": False,
            "restart_required": False,
        }

    def find_lsfg_vk_dll(self) -> Optional[str]:
        if self.get_branch_status().get("needs_switch"):
            return None
        return next((
            str(path)
            for root in self._steam_library_roots()
            if (path := root / "steamapps/common/Lossless Scaling/lsfg-vk.dll").is_file()
        ), None)

    def get_branch_status(self) -> Dict[str, object]:
        try:
            manifest = self._manifest_path()
            if manifest is None:
                return self._success_response(
                    dict,
                    "Lossless Scaling is not installed through Steam",
                    **self._missing_branch_fields(),
                )
            fields = self._status_fields(manifest, manifest.read_text(encoding="utf-8"))
            message = (
                "Lossless Scaling is using the lsfg-vk Steam branch"
                if not fields["needs_switch"]
                else "lsfg-vk is selected; restart Steam to finish the branch switch"
                if fields["restart_required"]
                else "Select lsfg-vk in Lossless Scaling's Steam Properties > Betas"
            )
            return self._success_response(dict, message, **fields)
        except Exception as error:
            return self._error_response(dict, str(error), **self._missing_branch_fields())

    def get_installed_games(self) -> Dict[str, object]:
        try:
            games: Dict[str, Dict[str, object]] = {}
            for root in self._steam_library_roots():
                for manifest in (root / "steamapps").glob("appmanifest_*.acf"):
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
                    games[appid] = {
                        "appid": appid,
                        "name": self._section_value(content, "AppState", "name") or f"App {appid}",
                        "nonSteam": False,
                    }
            for game in self._shortcut_games():
                games.setdefault(str(game["appid"]), game)
            return self._success_response(
                dict,
                games=sorted(games.values(), key=lambda game: str(game["name"]).lower()),
            )
        except Exception as error:
            return self._error_response(dict, str(error), games=[])
