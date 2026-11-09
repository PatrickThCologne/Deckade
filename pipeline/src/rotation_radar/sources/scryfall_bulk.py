"""Card printings from Scryfall's bulk files, refreshed by Scryfall daily.

"Default Cards" (about 80 MB gzip-compressed JSON Lines, one card per line) holds every
printing in English. "All Cards" (about 400 MB) holds every language; only the German
lines are parsed from it. Each file is downloaded once per version and read line by
line, so memory stays low.
"""

from __future__ import annotations

import gzip
import json
import logging
from collections.abc import Collection, Iterator
from pathlib import Path

from rotation_radar.config import SCRYFALL_API
from rotation_radar.domain.cards import Printing, Translation, representative
from rotation_radar.sources.http import HttpClient
from rotation_radar.sources.scryfall import parse_printing, parse_translation

log = logging.getLogger(__name__)

DEFAULT_CARDS = "default-cards"
ALL_CARDS = "all-cards"


class BulkCards:
    def __init__(self, http: HttpClient, cache_dir: Path) -> None:
        self._http = http
        self._cache_dir = cache_dir

    def printings(self, set_codes: Collection[str]) -> list[Printing]:
        """Paper printings of the given sets."""
        wanted = set(set_codes)
        return [p for p in self._read(self._download(DEFAULT_CARDS)) if p.set_code in wanted]

    def translations(
        self, set_codes: Collection[str], lang: str
    ) -> dict[tuple[str, str], Translation]:
        """How the cards of the given sets are printed in a language, per (set, Oracle id).

        Of several printings in a set, the regular one is used, as for the English rows."""
        wanted = set(set_codes)
        marker = f'"lang":"{lang}"'  # the file is compact JSON; skip other languages unparsed
        groups: dict[tuple[str, str], list[Printing]] = {}
        texts: dict[str, Translation] = {}
        path = self._download(ALL_CARDS)
        with gzip.open(path, "rt", encoding="utf-8") as lines:
            for line in lines:
                if marker not in line:
                    continue
                raw = json.loads(line)
                if raw.get("lang") != lang or raw.get("set") not in wanted:
                    continue
                if raw.get("digital") or "paper" not in (raw.get("games") or ()):
                    continue
                parsed = parse_translation(raw)
                if parsed is None:
                    continue
                printing, translation = parsed
                groups.setdefault((printing.set_code, printing.oracle_id), []).append(printing)
                texts[printing.scryfall_id] = translation
        return {key: texts[representative(group).scryfall_id] for key, group in groups.items()}

    def _download(self, kind: str) -> Path:
        """The current bulk file of a kind; older versions are removed."""
        info = self._http.get_json(f"{SCRYFALL_API}/bulk-data/{kind}")
        url: str = info["jsonl_download_uri"]
        target = self._cache_dir / url.rsplit("/", 1)[-1]
        if not target.exists():
            log.info("Downloading %s (%d MB)", target.name, info["compressed_size"] // 1_000_000)
            self._http.download(url, target)
        for old in self._cache_dir.glob(f"{kind}-*.jsonl.gz"):
            if old != target:
                old.unlink()
        return target

    @staticmethod
    def _read(path: Path) -> Iterator[Printing]:
        with gzip.open(path, "rt", encoding="utf-8") as lines:
            for line in lines:
                raw = json.loads(line)
                if raw.get("digital") or "paper" not in (raw.get("games") or ()):
                    continue
                printing = parse_printing(raw)
                if printing is not None:
                    yield printing
