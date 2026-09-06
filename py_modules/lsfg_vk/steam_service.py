import re
from pathlib import Path
from typing import Dict, Optional, Tuple

from .base_service import BaseService
from .constants import STEAM_LOSSLESS_SCALING_APP_ID, STEAM_LOSSLESS_SCALING_BRANCH


class SteamService(BaseService):
    DEFAULT_BRANCH = "public"
    MANIFEST_FILENAME = f"appmanifest_{STEAM_LOSSLESS_SCALING_APP_ID}.acf"

    def _steam_library_roots(self):
        candidates = (
            self.user_home / ".local/share/Steam",
            self.user_home / ".steam/steam",
            self.user_home / ".steam/root",
            self.user_home / ".var/app/com.valvesoftware.Steam/.local/share/Steam",
        )
        seen = set()

        for candidate in candidates:
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
