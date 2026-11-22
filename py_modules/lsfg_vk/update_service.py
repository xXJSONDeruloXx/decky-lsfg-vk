import re
import time
import urllib.request
from typing import Any, Callable, Dict, Optional, Tuple

from .base_service import BaseService
from .constants import BUNDLED_LSFG_VERSION, LSFG_BUILDS_URL

_RELEASE_PATTERN = re.compile(r"Latest release \((\d+\.\d+\.\d+)\)")


def parse_latest_release(page: str) -> Optional[str]:
    """Pull the stable version out of upstream's autobuild index page."""
    match = _RELEASE_PATTERN.search(page)
    return match.group(1) if match else None


def version_tuple(version: str) -> Tuple[int, ...]:
    return tuple(int(part) for part in version.split("."))


def is_newer(latest: str, installed: str) -> bool:
    return version_tuple(latest) > version_tuple(installed)


class UpdateService(BaseService):
    """Tells the user when upstream has published a newer lsfg-vk than the one bundled here.

    It only reads a public web page. Nothing is downloaded or installed: a newer
    build reaches users through a new plugin release.
    """

    CACHE_SECONDS = 6 * 3600
    MAX_BYTES = 256 * 1024
    TIMEOUT_SECONDS = 8

    def __init__(self, logger=None, fetch: Optional[Callable[[], str]] = None):
        super().__init__(logger)
        self._fetch = fetch or self._fetch_builds_page
        self._cached: Optional[Tuple[float, str]] = None

    def _fetch_builds_page(self) -> str:
        request = urllib.request.Request(
            LSFG_BUILDS_URL, headers={"User-Agent": "decky-lsfg-vk"}
        )
        with urllib.request.urlopen(request, timeout=self.TIMEOUT_SECONDS) as response:
            return response.read(self.MAX_BYTES).decode("utf-8", errors="replace")

    def check(self, force: bool = False) -> Dict[str, Any]:
        installed = BUNDLED_LSFG_VERSION
        try:
            now = time.time()
            if not force and self._cached and now - self._cached[0] < self.CACHE_SECONDS:
                latest = self._cached[1]
            else:
                latest = parse_latest_release(self._fetch())
                if latest is None:
                    raise ValueError("Could not find the latest version on the lsfg-vk builds page")
                self._cached = (now, latest)
            return self._success_response(
                dict,
                installed_version=installed,
                latest_version=latest,
                update_available=is_newer(latest, installed),
            )
        except Exception as error:
            self.log.warning(f"Could not check for lsfg-vk updates: {error}")
            return self._error_response(
                dict,
                str(error),
                installed_version=installed,
                latest_version=None,
                update_available=False,
            )
