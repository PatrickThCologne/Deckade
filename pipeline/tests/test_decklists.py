"""Decklists from GitHub: a failed listing or download stops the build instead of silently
leaving the play rate empty; only a single broken event file is skipped."""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from datetime import date
from pathlib import Path
from typing import Any

import httpx
import pytest

from rotation_radar.config import (
    DECKLIST_BRANCH,
    DECKLIST_REPOSITORY,
    DECKLIST_SOURCES,
    GITHUB_API,
    GITHUB_RAW,
)
from rotation_radar.sources.decklists import DecklistArchive
from rotation_radar.sources.http import HttpClient

START, END = date(2026, 11, 1), date(2026, 11, 15)
EVENT = "05/standard-challenge-32-2026-11-0512345.json"
API = f"{GITHUB_API}/repos/{DECKLIST_REPOSITORY}"
RAW = f"{GITHUB_RAW}/{DECKLIST_REPOSITORY}/{DECKLIST_BRANCH}/Tournaments"


def event(card: str = "Opt") -> bytes:
    raw = {
        "Tournament": {"Formats": "Standard"},
        "Decks": [{"Mainboard": [{"CardName": card, "Count": 4}], "Sideboard": []}],
    }
    return json.dumps(raw).encode()


class GitHub:
    """Answers like the GitHub API and raw.githubusercontent.com for November 2026, with one
    Standard event per source. ``overrides`` replaces the answer for one URL."""

    def __init__(self, overrides: dict[str, httpx.Response] | None = None) -> None:
        self.overrides = overrides or {}
        self.requested: list[str] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        self.requested.append(url)
        if url in self.overrides:
            return self.overrides[url]
        for source in DECKLIST_SOURCES:
            if url == f"{API}/contents/Tournaments/{source}/2026":
                return httpx.Response(200, json=[{"name": "11", "sha": f"sha-{source}"}])
            if url == f"{API}/git/trees/sha-{source}?recursive=1":
                tree: dict[str, Any] = {"tree": [{"path": EVENT, "type": "blob"}]}
                return httpx.Response(200, json=tree)
            if url == f"{RAW}/{source}/2026/11/{EVENT}":
                return httpx.Response(200, content=event())
        return httpx.Response(404)


def archive(handler: Callable[[httpx.Request], httpx.Response], cache: Path) -> DecklistArchive:
    http = HttpClient(
        user_agent="test",
        retries=1,
        transport=httpx.MockTransport(handler),
        sleep=lambda _: None,
    )
    return DecklistArchive(http, cache)


def test_reads_the_events_of_every_source(tmp_path: Path) -> None:
    tournaments = archive(GitHub(), tmp_path).tournaments("standard", START, END)

    assert len(tournaments) == len(DECKLIST_SOURCES)
    assert {t.day for t in tournaments} == {date(2026, 11, 5)}


def test_a_failed_folder_listing_is_an_error_not_an_empty_play_rate(tmp_path: Path) -> None:
    listing = f"{API}/contents/Tournaments/{DECKLIST_SOURCES[0]}/2026"
    github = GitHub({listing: httpx.Response(500)})

    with pytest.raises(httpx.HTTPStatusError) as error:
        archive(github, tmp_path).tournaments("standard", START, END)

    assert listing in str(error.value)
    assert github.requested.count(listing) == 2  # tried again once before giving up


def test_a_rate_limited_listing_is_an_error(tmp_path: Path) -> None:
    listing = f"{API}/contents/Tournaments/{DECKLIST_SOURCES[0]}/2026"
    github = GitHub({listing: httpx.Response(403, json={"message": "API rate limit exceeded"})})

    with pytest.raises(httpx.HTTPStatusError):
        archive(github, tmp_path).tournaments("standard", START, END)


def test_a_failed_tree_listing_is_an_error(tmp_path: Path) -> None:
    tree = f"{API}/git/trees/sha-{DECKLIST_SOURCES[0]}?recursive=1"

    with pytest.raises(httpx.HTTPStatusError):
        archive(GitHub({tree: httpx.Response(502)}), tmp_path).tournaments("standard", START, END)


def test_a_failed_event_download_is_an_error(tmp_path: Path) -> None:
    download = f"{RAW}/{DECKLIST_SOURCES[0]}/2026/11/{EVENT}"
    github = GitHub({download: httpx.Response(503)})

    with pytest.raises(httpx.HTTPStatusError) as error:
        archive(github, tmp_path).tournaments("standard", START, END)

    assert download in str(error.value)
    assert github.requested.count(download) == 2


def test_a_broken_event_file_is_skipped_with_a_warning(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    download = f"{RAW}/{DECKLIST_SOURCES[0]}/2026/11/{EVENT}"
    github = GitHub({download: httpx.Response(200, content=b"{not json")})

    with caplog.at_level(logging.WARNING):
        tournaments = archive(github, tmp_path).tournaments("standard", START, END)

    assert len(tournaments) == len(DECKLIST_SOURCES) - 1
    assert any("standard-challenge" in record.getMessage() for record in caplog.records)
    # Not cached: the next build downloads it again
    assert not (tmp_path / DECKLIST_SOURCES[0] / "2026" / "11" / EVENT).exists()


def test_a_month_without_a_folder_has_no_events(tmp_path: Path) -> None:
    listing = f"{API}/contents/Tournaments/{DECKLIST_SOURCES[0]}/2026"
    github = GitHub({listing: httpx.Response(200, json=[{"name": "10", "sha": "older"}])})

    tournaments = archive(github, tmp_path).tournaments("standard", START, END)

    assert len(tournaments) == len(DECKLIST_SOURCES) - 1
