"""A small, polite HTTP client: identifies itself, keeps a minimum gap between
requests and retries rate limits and dropped connections with backoff."""

from __future__ import annotations

import logging
import time
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import httpx

log = logging.getLogger(__name__)

RETRY_STATUS = frozenset({429, 500, 502, 503, 504})


class HttpClient:
    def __init__(
        self,
        *,
        user_agent: str,
        min_interval: float = 0.0,
        retries: int = 4,
        timeout: float = 60.0,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        self._client = httpx.Client(
            headers={"User-Agent": user_agent, **(headers or {})},
            timeout=timeout,
            follow_redirects=True,
        )
        self._min_interval = min_interval
        self._retries = retries
        self._last_request = 0.0

    def get_json(self, url: str, headers: Mapping[str, str] | None = None) -> Any:
        return self._get(url, headers).json()

    def get_bytes(self, url: str, headers: Mapping[str, str] | None = None) -> bytes:
        return self._get(url, headers).content

    def download(self, url: str, target: Path) -> None:
        """Streams a large file to disk; a broken transfer leaves no half-written file behind."""
        target.parent.mkdir(parents=True, exist_ok=True)
        partial = target.with_name(target.name + ".part")
        for attempt in range(self._retries + 1):
            self._wait_for_slot()
            try:
                with self._client.stream("GET", url) as response:
                    response.raise_for_status()
                    with partial.open("wb") as file:
                        for chunk in response.iter_bytes(1 << 20):
                            file.write(chunk)
                partial.replace(target)
                return
            except httpx.TransportError as error:
                if attempt == self._retries:
                    raise
                self._back_off(attempt, reason=str(error))

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> HttpClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def _get(self, url: str, headers: Mapping[str, str] | None) -> httpx.Response:
        for attempt in range(self._retries + 1):
            self._wait_for_slot()
            try:
                response = self._client.get(url, headers=dict(headers or {}))
            except httpx.TransportError as error:
                if attempt == self._retries:
                    raise
                self._back_off(attempt, reason=str(error))
                continue
            if response.status_code in RETRY_STATUS and attempt < self._retries:
                self._back_off(attempt, reason=f"HTTP {response.status_code}", response=response)
                continue
            response.raise_for_status()
            return response
        raise AssertionError("unreachable")

    def _wait_for_slot(self) -> None:
        gap = time.monotonic() - self._last_request
        if gap < self._min_interval:
            time.sleep(self._min_interval - gap)
        self._last_request = time.monotonic()

    @staticmethod
    def _back_off(attempt: int, *, reason: str, response: httpx.Response | None = None) -> None:
        retry_after = response.headers.get("Retry-After") if response is not None else None
        delay = float(retry_after) if retry_after and retry_after.isdigit() else 5.0 * 2**attempt
        log.warning("Retrying in %.0fs (%s)", delay, reason)
        time.sleep(delay)
