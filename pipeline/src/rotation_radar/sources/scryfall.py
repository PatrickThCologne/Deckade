"""Scryfall (https://scryfall.com/docs/api): sets, banned lists and mana symbols.

Card printings come from the bulk data file instead (sources/scryfall_bulk.py):
Scryfall asks to use bulk data rather than paging through searches for large amounts.
"""

from __future__ import annotations

import time
import urllib.parse
from collections.abc import Iterator
from datetime import date
from typing import Any

import httpx

from rotation_radar.config import SCRYFALL_API
from rotation_radar.domain.cards import Printing, Translation, normalize_colors
from rotation_radar.domain.sets import MtgSet
from rotation_radar.sources.http import HttpClient

# Scryfall asks for 50-100 ms between requests. Searches are limited more strictly:
# 100 ms and even 500 ms between searches still ran into HTTP 429 (observed 2026-11-05).
REQUEST_INTERVAL = 0.1
SEARCH_INTERVAL = 1.0

TRACKED_FORMATS = ("standard", "pioneer", "modern", "commander")
VARIANT_FRAME_EFFECTS = frozenset({"showcase", "extendedart", "etched", "inverted"})
# Markers that say nothing about a special treatment: every regular Universes Beyond
# printing carries "universesbeyond" (observed in the bulk data on 2026-11-05).
NEUTRAL_PROMO_TYPES = frozenset({"universesbeyond"})


class ScryfallClient:
    def __init__(self, http: HttpClient) -> None:
        self._http = http
        self._last_search = 0.0

    def sets(self) -> list[MtgSet]:
        payload = self._http.get_json(f"{SCRYFALL_API}/sets")
        return [_parse_set(raw) for raw in payload["data"] if raw.get("released_at")]

    def banned(self, game_format: str) -> list[Printing]:
        """Cards on a format's banned list, alphabetically."""
        url = f"{SCRYFALL_API}/cards/search?" + urllib.parse.urlencode(
            {"q": f"banned:{game_format}", "unique": "cards", "order": "name"}
        )
        return [p for raw in self._pages(url) if (p := parse_printing(raw)) is not None]

    def symbol_svgs(self) -> dict[str, str]:
        """Mana symbol -> SVG URL, e.g. 'W/U' -> https://svgs.scryfall.io/card-symbols/WU.svg."""
        payload = self._http.get_json(f"{SCRYFALL_API}/symbology")
        return {
            raw["symbol"].strip("{}"): raw["svg_uri"]
            for raw in payload["data"]
            if raw.get("svg_uri")
        }

    def _search(self, url: str) -> dict[str, Any]:
        gap = time.monotonic() - self._last_search
        if gap < SEARCH_INTERVAL:
            time.sleep(SEARCH_INTERVAL - gap)
        self._last_search = time.monotonic()
        result: dict[str, Any] = self._http.get_json(url)
        return result

    def _pages(self, url: str | None) -> Iterator[dict[str, Any]]:
        while url:
            try:
                page = self._search(url)
            except httpx.HTTPStatusError as error:
                if error.response.status_code == 404:  # Scryfall answers "no match" with 404
                    return
                raise
            yield from page["data"]
            url = page.get("next_page")


def _parse_set(raw: dict[str, Any]) -> MtgSet:
    return MtgSet(
        code=raw["code"],
        name=raw["name"],
        released_at=date.fromisoformat(raw["released_at"]),
        set_type=raw["set_type"],
        parent_code=raw.get("parent_set_code"),
        digital=bool(raw.get("digital")),
        icon_url=raw.get("icon_svg_uri"),
    )


def parse_printing(raw: dict[str, Any]) -> Printing | None:
    """A Scryfall card object as a Printing; None for objects without an Oracle id (tokens etc.)."""
    faces = raw.get("card_faces") or [{}]
    front = faces[0]
    oracle_id = raw.get("oracle_id") or front.get("oracle_id")
    if not oracle_id:
        return None
    images = raw.get("image_uris") or front.get("image_uris") or {}
    mana_cost = raw.get("mana_cost")
    legalities = raw.get("legalities") or {}
    prices = raw.get("prices") or {}
    return Printing(
        scryfall_id=raw["id"],
        oracle_id=oracle_id,
        name=raw["name"],
        set_code=raw["set"],
        collector_number=raw.get("collector_number", ""),
        rarity=raw.get("rarity", ""),
        finishes=frozenset(raw.get("finishes") or ()),
        cardmarket_id=raw.get("cardmarket_id"),
        legalities={fmt: legalities.get(fmt, "not_legal") for fmt in TRACKED_FORMATS},
        color_identity=normalize_colors(raw.get("color_identity") or ()),
        cmc=float(raw.get("cmc") or 0),
        mana_cost=str(mana_cost if mana_cost is not None else front.get("mana_cost") or ""),
        type_line=raw.get("type_line") or front.get("type_line") or "",
        image_small=images.get("small"),
        image_normal=images.get("normal"),
        scryfall_url=raw.get("scryfall_uri", ""),
        is_variant=_is_variant(raw),
        art_crop=images.get("art_crop"),
        artist=raw.get("artist") or front.get("artist"),
        oracle_text=_text(raw, faces, "oracle_text"),
        price_eur=_euro(prices.get("eur")),
        price_eur_foil=_euro(prices.get("eur_foil")),
    )


def _euro(value: Any) -> float | None:
    """Scryfall writes prices as strings ("0.25"), or null where it has none."""
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def parse_translation(raw: dict[str, Any]) -> tuple[Printing, Translation] | None:
    """A printing in another language and how it reads there: Scryfall keeps the printed
    name and text next to the English Oracle fields."""
    printing = parse_printing(raw)
    if printing is None:
        return None
    faces = raw.get("card_faces") or [{}]
    name = raw.get("printed_name") or " // ".join(
        face.get("printed_name") or face.get("name") or "" for face in faces
    )
    return printing, Translation(
        name=name or printing.name,
        text=_text(raw, faces, "printed_text"),
        image_small=printing.image_small,
        image_normal=printing.image_normal,
        scryfall_url=printing.scryfall_url,
    )


def _text(raw: dict[str, Any], faces: list[dict[str, Any]], key: str) -> str:
    """A text field of the card, or of all faces separated by a blank line."""
    if raw.get(key):
        return str(raw[key])
    return "\n\n".join(str(face[key]) for face in faces if face.get(key))


def _is_variant(raw: dict[str, Any]) -> bool:
    """Showcase, borderless, full-art and similar treatments of a regular card."""
    return bool(
        raw.get("border_color") == "borderless"
        or raw.get("full_art")
        or set(raw.get("promo_types") or ()) - NEUTRAL_PROMO_TYPES
        or VARIANT_FRAME_EFFECTS & set(raw.get("frame_effects") or ())
    )
