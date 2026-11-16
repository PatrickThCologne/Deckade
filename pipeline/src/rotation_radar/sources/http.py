"""A small, polite HTTP client: identifies itself, keeps a minimum gap between
requests and retries rate limits and dropped connections with backoff."""

from __future__ import annotations

import logging
import time
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

import httpx

log = logging.getLogger(__name__)

RETRY_STATUS = frozenset({429, 500, 502, 503, 504})
# A server asking to wait an hour would stall the daily build; a minute is enough to be polite
MAX_RETRY_AFTER = 60.0


class HttpClient:
    """``transport``, ``sleep`` and ``clock`` are for tests: no network and no waiting."""

    def __init__(
        self,
        *,
        user_agent: str,
        min_interval: float = 0.0,
        retries: int = 4,
        timeout: float = 60.0,
        headers: Mapping[str, str] | None = None,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._client = httpx.Client(
            headers={"User-Agent": user_agent, **(headers or {})},
            timeout=timeout,
            follow_redirects=True,
            transport=transport,
        )
        self._min_interval = min_interval
        self._retries = retries
        self._sleep = sleep
        self._clock = clock
        self._last_request: float | None = None

    def get_json(self, url: str, headers: Mapping[str, str] | None = None) -> Any:
        return self._get(url, headers, _read).json()

    def get_bytes(self, url: str, headers: Mapping[str, str] | None = None) -> bytes:
        return self._get(url, headers, _read).content

    def download(self, url: str, target: Path) -> None:
        """Streams a large file to disk; a broken transfer leaves no half-written file behind
        and an older ``target`` untouched."""
        target.parent.mkdir(parents=True, exist_ok=True)
        partial = target.with_name(target.name + ".part")

        def save(response: httpx.Response) -> None:
            # Opened anew on every attempt: a retry starts the file from the beginning
            with partial.open("wb") as file:
                for chunk in response.iter_bytes(1 << 20):
                    file.write(chunk)

        try:
            self._get(url, None, save)
            partial.replace(target)
        finally:
            partial.unlink(missing_ok=True)

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> HttpClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def _get[T](
        self,
        url: str,
        headers: Mapping[str, str] | None,
        receive: Callable[[httpx.Response], T],
    ) -> T:
        """A GET with retries; ``receive`` reads the body of a successful response. A transfer
        that breaks while reading is retried like a dropped connection."""
        for attempt in range(self._retries + 1):
            self._wait_for_slot()
            try:
                with self._client.stream("GET", url, headers=dict(headers or {})) as response:
                    if response.status_code not in RETRY_STATUS or attempt == self._retries:
                        response.raise_for_status()
                        return receive(response)
            except httpx.TransportError as error:
                if attempt == self._retries:
                    raise
                self._back_off(attempt, reason=str(error))
                continue
            self._back_off(attempt, reason=f"HTTP {response.status_code}", response=response)
        raise AssertionError("unreachable")

    def _wait_for_slot(self) -> None:
        if self._last_request is not None:
            gap = self._clock() - self._last_request
            if gap < self._min_interval:
                self._sleep(self._min_interval - gap)
        self._last_request = self._clock()

    def _back_off(
        self, attempt: int, *, reason: str, response: httpx.Response | None = None
    ) -> None:
        retry_after = response.headers.get("Retry-After") if response is not None else None
        if retry_after and retry_after.isdigit():
            delay = min(float(retry_after), MAX_RETRY_AFTER)
        else:
            delay = 5.0 * 2**attempt
        log.warning("Retrying in %.0fs (%s)", delay, reason)
        self._sleep(delay)


def _read(response: httpx.Response) -> httpx.Response:
    response.read()
    return response
