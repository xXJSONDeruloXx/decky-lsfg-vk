import os
import re
import tempfile
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
    def _set_section_value(cls, content: str, section_name: str, key: str, value: str) -> str:
        bounds = cls._section_bounds(content, section_name)
        if bounds is None:
            if section_name != "UserConfig":
                raise ValueError(f"Steam manifest is missing the {section_name} section")
            app_state = cls._section_bounds(content, "AppState")
            if app_state is None:
                raise ValueError("Steam manifest is missing the AppState section")
            _, app_state_end, app_state_indent = app_state
            prefix = content[:app_state_end]
            if not prefix.endswith(("\n", "\r")):
                prefix += "\n"
            entry_indent = app_state_indent + "\t"
            section = (
                f'{entry_indent}"UserConfig"\n'
                f'{entry_indent}{{\n'
                f'{entry_indent}\t"{key}"\t"{value}"\n'
                f'{entry_indent}}}\n'
            )
            return prefix + section + content[app_state_end:]

        body_start, body_end, section_indent = bounds
        pattern = re.compile(
            rf'(?m)^[ \t]*"{re.escape(key)}"[ \t]+"(?P<value>(?:\\.|[^"\\])*)"'
        )
        match = pattern.search(content, body_start, body_end)
        if match is not None:
            return content[: match.start("value")] + value + content[match.end("value") :]

        prefix = content[:body_end]
        if not prefix.endswith(("\n", "\r")):
            prefix += "\n"
        entry_indent = section_indent + "\t"
        return prefix + f'{entry_indent}"{key}"\t"{value}"\n' + content[body_end:]

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

    def select_branch(self) -> Dict[str, object]:
        try:
            manifest_path = self._manifest_path()
            if manifest_path is None:
                raise FileNotFoundError("Lossless Scaling is not installed through Steam")

            content = manifest_path.read_text(encoding="utf-8")
            fields = self._status_fields(manifest_path, content)
            if not fields["needs_switch"]:
                return self._success_response(
                    dict,
                    "Lossless Scaling is already using the lsfg-vk Steam branch",
                    changed=False,
                    **fields,
                )

            updated = self._set_section_value(
                content,
                "UserConfig",
                "BetaKey",
                STEAM_LOSSLESS_SCALING_BRANCH,
            )
            if updated != content:
                file_mode = manifest_path.stat().st_mode & 0o777
                temporary_path = None
                try:
                    with tempfile.NamedTemporaryFile(
                        mode="w",
                        encoding="utf-8",
                        dir=manifest_path.parent,
                        prefix=f".{manifest_path.name}.",
                        delete=False,
                    ) as temporary_file:
                        temporary_path = Path(temporary_file.name)
                        temporary_file.write(updated)
                        temporary_file.flush()
                        os.fsync(temporary_file.fileno())
                    temporary_path.chmod(file_mode)
                    os.replace(temporary_path, manifest_path)
                except Exception:
                    if temporary_path is not None:
                        temporary_path.unlink(missing_ok=True)
                    raise

            new_fields = dict(fields)
            new_fields["selected_branch"] = STEAM_LOSSLESS_SCALING_BRANCH
            new_fields["needs_switch"] = new_fields["current_branch"] != STEAM_LOSSLESS_SCALING_BRANCH
            new_fields["restart_required"] = new_fields["needs_switch"]
            return self._success_response(
                dict,
                "lsfg-vk selected for Lossless Scaling; restart Steam to download it",
                changed=updated != content,
                **new_fields,
            )
        except Exception as error:
            return self._error_response(
                dict,
                str(error),
                changed=False,
                installed=False,
                manifest_path=None,
                selected_branch=None,
                current_branch=None,
                target_branch=STEAM_LOSSLESS_SCALING_BRANCH,
                needs_switch=False,
                restart_required=False,
            )
