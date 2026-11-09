"""Tournament decklists from github.com/Jiliac/MTGODecklistCache.

The repository archives public decklists from MTGO (Challenges, Leagues) and
Melee (paper tournaments) as one JSON file per event, sorted by date. Event files
never change once published, so they are cached on disk.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Iterator
from datetime import date
from pathlib import Path
from typing import Any

import httpx

from rotation_radar.config import (
    DECKLIST_BRANCH,
    DECKLIST_REPOSITORY,
    DECKLIST_SOURCES,
    GITHUB_API,
    GITHUB_RAW,
)
from rotation_radar.domain.play import Deck, Tournament, card_key
from rotation_radar.sources.http import HttpClient

log = logging.getLogger(__name__)


class DecklistArchive:
    def __init__(self, http: HttpClient, cache_dir: Path, github_token: str | None = None) -> None:
        self._http = http
        self._cache_dir = cache_dir
        self._api_headers = {"Accept": "application/vnd.github+json"}
        if github_token:
            self._api_headers["Authorization"] = f"Bearer {github_token}"

    def tournaments(self, game_format: str, start: date, end: date) -> list[Tournament]:
        events = []
        for source, path, day in self._event_files(game_format, start, end):
            raw = self._load_event(source, path)
            if raw is not None and _declares_format(raw, game_format):
                events.append(_parse_tournament(raw, day))
        return events

    def _event_files(
        self, game_format: str, start: date, end: date
    ) -> Iterator[tuple[str, str, date]]:
        months = sorted({(start.year, start.month), (end.year, end.month)})
        pattern = re.compile(rf"(^|[^a-z]){re.escape(game_format)}([^a-z]|$)")
        for source in DECKLIST_SOURCES:
            for year, month in months:
                for path in self._month_files(source, year, month):
                    day_part, _, filename = path.partition("/")
                    if not day_part.isdigit() or not pattern.search(filename.lower()):
                        continue
                    day = date(year, month, int(day_part))
                    if start <= day <= end:
                        yield source, f"{year}/{month:02d}/{path}", day

    def _month_files(self, source: str, year: int, month: int) -> list[str]:
        """Paths like '24/some-event.json' inside one month folder (two API requests)."""
        base = f"{GITHUB_API}/repos/{DECKLIST_REPOSITORY}"
        try:
            months = self._http.get_json(
                f"{base}/contents/Tournaments/{source}/{year}", self._api_headers
            )
        except httpx.HTTPStatusError as error:
            log.warning("No decklists for %s %s: %s", source, year, error.response.status_code)
            return []
        sha = next((m["sha"] for m in months if m["name"] == f"{month:02d}"), None)
        if sha is None:
            return []
        tree = self._http.get_json(f"{base}/git/trees/{sha}?recursive=1", self._api_headers)
        return [
            entry["path"]
            for entry in tree.get("tree", [])
            if entry["type"] == "blob" and entry["path"].endswith(".json")
        ]

    def _load_event(self, source: str, path: str) -> dict[str, Any] | None:
        cached = self._cache_dir / source / path
        if cached.exists():
            data: dict[str, Any] = json.loads(cached.read_bytes())
            return data
        url = f"{GITHUB_RAW}/{DECKLIST_REPOSITORY}/{DECKLIST_BRANCH}/Tournaments/{source}/{path}"
        try:
            content = self._http.get_bytes(url)
            data = json.loads(content)
        except (httpx.HTTPError, ValueError) as error:
            log.warning("Skipping %s: %s", path, error)
            return None
        cached.parent.mkdir(parents=True, exist_ok=True)
        cached.write_bytes(content)
        return data


def _declares_format(raw: dict[str, Any], game_format: str) -> bool:
    """The file name said 'standard'; make sure the event did not declare another format."""
    declared = str((raw.get("Tournament") or {}).get("Formats") or "").lower()
    return not declared or game_format in declared


def _parse_tournament(raw: dict[str, Any], day: date) -> Tournament:
    decks = []
    for deck in raw.get("Decks") or ():
        mainboard: dict[str, int] = {}
        for entry in deck.get("Mainboard") or ():
            key = card_key(entry.get("CardName") or "")
            mainboard[key] = mainboard.get(key, 0) + int(entry.get("Count") or 0)
        sideboard = frozenset(
            card_key(e.get("CardName") or "") for e in deck.get("Sideboard") or ()
        )
        decks.append(Deck(mainboard=mainboard, sideboard=sideboard))
    return Tournament(day=day, decks=tuple(decks))
