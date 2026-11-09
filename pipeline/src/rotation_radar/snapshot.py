"""The data contract with the website: what the pipeline writes and how.

``snapshot.json`` holds the sets and the rotation, ``cards/<set>.json`` the cards of
one set. Keys are camelCase; the website validates both files at build time
(``web/src/lib/data/schema.ts``). Bump ``SCHEMA_VERSION`` on breaking changes.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, fields, is_dataclass
from datetime import date, datetime
from enum import Enum
from pathlib import Path
from typing import Any

from rotation_radar.domain.art import FeaturedArt
from rotation_radar.domain.cards import CardRow
from rotation_radar.domain.products import PackCount
from rotation_radar.domain.rotation import RotationEstimate, SetRotation
from rotation_radar.domain.sets import SetStatus

SCHEMA_VERSION = 4
RULE_SOURCE = "https://magic.wizards.com/en/formats/standard"


@dataclass(frozen=True)
class ProductEntry:
    name: str
    category: str
    subtype: str | None
    contents: tuple[PackCount, ...]
    price: float | None
    average_sale: float | None
    price_per_pack: float | None


@dataclass(frozen=True)
class StandardInfo:
    """Only for sets that are in Standard or about to be."""

    status: SetStatus
    rotation: SetRotation


@dataclass(frozen=True)
class SetEntry:
    code: str
    name: str
    released_at: date
    set_type: str
    parent_code: str | None
    card_count: int
    icon_url: str | None
    pack_image: str | None
    formats: tuple[str, ...]  # formats the set is legal in, e.g. ("pioneer", "modern", "commander")
    standard: StandardInfo | None
    products: tuple[ProductEntry, ...]


@dataclass(frozen=True)
class BannedCard:
    name: str
    colors: str
    mana_cost: str
    image_normal: str | None
    scryfall_url: str


@dataclass(frozen=True)
class FormatEntry:
    id: str
    name: str
    rotates: bool
    info_url: str
    banlist_url: str
    banned: tuple[BannedCard, ...]


@dataclass(frozen=True)
class RuleSummary:
    rotating_set_count: int
    source_url: str
    special_rule_sources: Mapping[str, str]


@dataclass(frozen=True)
class SourceInfo:
    cardmarket_price_date: date | None
    play_rate_from: date | None
    play_rate_to: date | None
    play_rate_decks: int
    play_rate_tournaments: int


@dataclass(frozen=True)
class Snapshot:
    schema_version: int
    generated_at: datetime
    rotation: RotationEstimate
    rules: RuleSummary
    sources: SourceInfo
    sets: tuple[SetEntry, ...]  # every set with a page, newest first
    formats: tuple[FormatEntry, ...]
    featured_art: tuple[FeaturedArt, ...]  # background artwork, artist credited on the page


def write_snapshot(
    snapshot: Snapshot, cards_by_set: Mapping[str, Sequence[CardRow]], data_dir: Path
) -> None:
    cards_dir = data_dir / "cards"
    cards_dir.mkdir(parents=True, exist_ok=True)
    _write_json(data_dir / "snapshot.json", snapshot)
    wanted = {f"{code}.json" for code in cards_by_set}
    for stale in cards_dir.glob("*.json"):
        if stale.name not in wanted:
            stale.unlink()
    for code, rows in cards_by_set.items():
        # Compact: card files are large and only read by the build, not by people
        _write_json(cards_dir / f"{code}.json", {"setCode": code, "cards": list(rows)}, indent=None)


def to_json_value(value: object) -> Any:
    """Dataclasses become camelCase objects, dates ISO strings, enums their value."""
    if is_dataclass(value) and not isinstance(value, type):
        return {_camel(f.name): to_json_value(getattr(value, f.name)) for f in fields(value)}
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, datetime):
        return value.isoformat(timespec="seconds")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Mapping):
        return {str(key): to_json_value(item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [to_json_value(item) for item in value]
    if isinstance(value, set | frozenset):
        return [to_json_value(item) for item in sorted(value)]
    return value


def _camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(part.capitalize() for part in rest)


def _write_json(path: Path, value: object, indent: int | None = 2) -> None:
    separators = (",", ":") if indent is None else None
    text = json.dumps(
        to_json_value(value), ensure_ascii=False, indent=indent, separators=separators
    )
    path.write_text(text + "\n", encoding="utf-8")
