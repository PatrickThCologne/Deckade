"""The polite HTTP client: retries, backoff, the gap between requests and safe downloads.

The client takes an httpx transport and its own ``sleep``/``clock`` so these tests run
without the network and without waiting.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from pathlib import Path

import httpx
import pytest

from rotation_radar.sources.http import HttpClient

URL = "https://example.org/data.json"
Handler = Callable[[httpx.Request], httpx.Response]


class FakeTime:
    """A clock that only moves when the client sleeps."""

    def __init__(self, start: float = 1000.0) -> None:
        self.now = start
        self.sleeps: list[float] = []

    def clock(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def replies(*responses: httpx.Response | Exception) -> tuple[Handler, list[httpx.Request]]:
    """A handler that answers with the given responses in turn (the last one repeats)."""
    requests: list[httpx.Request] = []

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        reply = responses[min(len(requests), len(responses)) - 1]
        if isinstance(reply, Exception):
            raise reply
        return reply

    return handle, requests


def client(
    handler: Handler, time: FakeTime, *, retries: int = 4, min_interval: float = 0.0
) -> HttpClient:
    return HttpClient(
        user_agent="test",
        min_interval=min_interval,
        retries=retries,
        transport=httpx.MockTransport(handler),
        sleep=time.sleep,
        clock=time.clock,
    )


def test_server_errors_and_rate_limits_are_retried_with_growing_backoff() -> None:
    time = FakeTime()
    handler, requests = replies(
        httpx.Response(503), httpx.Response(429), httpx.Response(500), httpx.Response(200, json=[1])
    )

    assert client(handler, time).get_json(URL) == [1]

    assert len(requests) == 4
    assert len(time.sleeps) == 3
    assert 0 < time.sleeps[0] < time.sleeps[1] < time.sleeps[2]


def test_a_dropped_connection_is_retried() -> None:
    time = FakeTime()
    handler, requests = replies(httpx.ConnectError("reset"), httpx.Response(200, content=b"ok"))

    assert client(handler, time).get_bytes(URL) == b"ok"
    assert len(requests) == 2
    assert len(time.sleeps) == 1


def test_retry_after_is_honoured() -> None:
    time = FakeTime()
    handler, _ = replies(
        httpx.Response(429, headers={"Retry-After": "7"}), httpx.Response(200, json={})
    )

    client(handler, time).get_json(URL)

    assert time.sleeps == [7.0]


def test_a_huge_retry_after_is_capped() -> None:
    time = FakeTime()
    handler, _ = replies(
        httpx.Response(429, headers={"Retry-After": "3600"}), httpx.Response(200, json={})
    )

    client(handler, time).get_json(URL)

    assert len(time.sleeps) == 1
    assert 0 < time.sleeps[0] <= 60


def test_gives_up_after_the_retry_limit_with_an_error() -> None:
    time = FakeTime()
    handler, requests = replies(httpx.Response(503))

    with pytest.raises(httpx.HTTPStatusError) as error:
        client(handler, time, retries=2).get_json(URL)

    assert error.value.response.status_code == 503
    assert len(requests) == 3
    assert len(time.sleeps) == 2


def test_a_dropped_connection_that_stays_dropped_ends_in_an_error() -> None:
    time = FakeTime()
    handler, requests = replies(httpx.ConnectError("reset"))

    with pytest.raises(httpx.ConnectError):
        client(handler, time, retries=2).get_bytes(URL)
    assert len(requests) == 3


def test_not_found_is_not_retried() -> None:
    time = FakeTime()
    handler, requests = replies(httpx.Response(404))

    with pytest.raises(httpx.HTTPStatusError) as error:
        client(handler, time).get_json(URL)

    assert error.value.response.status_code == 404
    assert len(requests) == 1
    assert time.sleeps == []


def test_keeps_the_minimum_interval_between_requests() -> None:
    time = FakeTime()
    handler, _ = replies(httpx.Response(200, json={}))
    http = client(handler, time, min_interval=1.5)

    http.get_json(URL)  # the first request does not wait
    assert time.sleeps == []
    http.get_json(URL)  # right after it: waits for the rest of the gap
    assert time.sleeps == [pytest.approx(1.5)]
    time.now += 0.5
    http.get_json(URL)  # half a second passed on its own: waits one more second
    assert time.sleeps[1:] == [pytest.approx(1.0)]
    time.now += 10
    http.get_json(URL)  # long after: no wait
    assert len(time.sleeps) == 2


class Body(httpx.SyncByteStream):
    """A response body in chunks; ``fail`` breaks the transfer after the first chunk.
    ``seen`` records whether the target and the .part file existed while streaming."""

    def __init__(self, target: Path, *, fail: bool = False) -> None:
        self.target = target
        self.fail = fail
        self.seen: list[tuple[bool, bool]] = []

    def __iter__(self) -> Iterator[bytes]:
        partial = self.target.with_name(self.target.name + ".part")
        yield b"first "
        self.seen.append((self.target.exists(), partial.exists()))
        if self.fail:
            raise httpx.ReadError("connection lost")
        yield b"second"


def test_a_download_is_written_to_a_part_file_and_then_renamed(tmp_path: Path) -> None:
    target = tmp_path / "bulk" / "cards.json"
    body = Body(target)
    time = FakeTime()

    client(lambda _: httpx.Response(200, stream=body), time).download(URL, target)

    assert body.seen == [(False, True)]  # while streaming: only the .part file
    assert target.read_bytes() == b"first second"
    assert list(target.parent.iterdir()) == [target]


def test_a_failed_download_leaves_no_file_behind(tmp_path: Path) -> None:
    target = tmp_path / "cards.json"
    time = FakeTime()

    with pytest.raises(httpx.ReadError):
        client(
            lambda _: httpx.Response(200, stream=Body(target, fail=True)), time, retries=1
        ).download(URL, target)

    assert not target.exists()
    assert list(tmp_path.iterdir()) == []  # no half-written .part file either


def test_a_failed_download_keeps_the_previous_file(tmp_path: Path) -> None:
    target = tmp_path / "cards.json"
    target.write_bytes(b"yesterday")
    time = FakeTime()

    with pytest.raises(httpx.ReadError):
        client(
            lambda _: httpx.Response(200, stream=Body(target, fail=True)), time, retries=1
        ).download(URL, target)

    assert target.read_bytes() == b"yesterday"


def test_a_download_retries_server_errors(tmp_path: Path) -> None:
    target = tmp_path / "cards.json"
    time = FakeTime()
    handler, requests = replies(httpx.Response(503), httpx.Response(200, content=b"cards"))

    client(handler, time).download(URL, target)

    assert target.read_bytes() == b"cards"
    assert len(requests) == 2
    assert len(time.sleeps) == 1


def test_a_download_that_is_not_found_fails_at_once_without_a_file(tmp_path: Path) -> None:
    target = tmp_path / "cards.json"
    time = FakeTime()
    handler, requests = replies(httpx.Response(404))

    with pytest.raises(httpx.HTTPStatusError):
        client(handler, time).download(URL, target)

    assert len(requests) == 1
    assert list(tmp_path.iterdir()) == []
