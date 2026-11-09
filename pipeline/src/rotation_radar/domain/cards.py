"""Cards of a set as shown on the website: price, play rate, colors, mana cost."""

from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass

from rotation_radar.domain.play import PlayRate, card_key
from rotation_radar.domain.sets import LegalityCount

COLOR_ORDER = "WUBRG"
LEGAL_IN_FORMAT = frozenset({"legal", "banned", "restricted"})


@dataclass(frozen=True)
class Price:
    trend: float | None
    trend_foil: float | None
    average_sale: float | None = None


@dataclass(frozen=True)
class Printing:
    """One printing of a card, as delivered by Scryfall."""

    scryfall_id: str
    oracle_id: str
    name: str
    set_code: str
    collector_number: str
    rarity: str
    finishes: frozenset[str]
    cardmarket_id: int | None
    legalities: Mapping[str, str]  # format -> legal | banned | restricted | not_legal
    color_identity: str
    cmc: float
    mana_cost: str
    type_line: str
    image_small: str | None
    image_normal: str | None
    scryfall_url: str
    is_variant: bool = False
    art_crop: str | None = None
    artist: str | None = None
    oracle_text: str = ""  # rules text, faces separated by a blank line

    def legality(self, game_format: str) -> str:
        return self.legalities.get(game_format, "not_legal")

    @property
    def front_type(self) -> str:
        return self.type_line.split(" // ")[0]

    @property
    def is_basic_land(self) -> bool:
        return self.front_type.startswith("Basic Land")

    @property
    def is_foil_only(self) -> bool:
        return "nonfoil" not in self.finishes


@dataclass(frozen=True)
class Translation:
    """How a card is printed in another language: from the printing in the same set."""

    name: str
    text: str
    image_small: str | None
    image_normal: str | None
    scryfall_url: str


@dataclass(frozen=True)
class CardRow:
    oracle_id: str
    name: str
    colors: str
    mana_cost: str
    cmc: float
    type_line: str
    text: str
    rarity: str
    is_land: bool
    banned: bool
    image_small: str | None
    image_normal: str | None
    scryfall_url: str
    price: float | None
    play_share: float | None
    average_copies: float | None
    de: Translation | None = None  # German printing; None if the set has none


def normalize_colors(identity: Iterable[str]) -> str:
    """Color identity in WUBRG order, '' for colorless."""
    present = set(identity)
    return "".join(c for c in COLOR_ORDER if c in present)


def count_legality(
    printings: Iterable[Printing], game_format: str = "standard"
) -> dict[str, LegalityCount]:
    """Distinct cards per set and how many of them belong to the format (banned ones included)."""
    cards: dict[str, set[str]] = defaultdict(set)
    legal: dict[str, set[str]] = defaultdict(set)
    for printing in printings:
        cards[printing.set_code].add(printing.oracle_id)
        if printing.legality(game_format) in LEGAL_IN_FORMAT:
            legal[printing.set_code].add(printing.oracle_id)
    return {
        code: LegalityCount(cards=len(ids), legal=len(legal[code])) for code, ids in cards.items()
    }


def market_price(printings: Iterable[Printing], prices: Mapping[int, Price]) -> float | None:
    """What it costs to play the card: the cheapest Cardmarket trend over its non-foil
    printings. Cards that only exist in foil fall back to their foil trend."""
    regular: list[float] = []
    foil_only: list[float] = []
    for printing in printings:
        price = prices.get(printing.cardmarket_id) if printing.cardmarket_id else None
        if price is None:
            continue
        if printing.is_foil_only:
            if price.trend_foil:
                foil_only.append(price.trend_foil)
        elif price.trend:
            regular.append(price.trend)
    return min(regular or foil_only, default=None)


def representative(printings: Sequence[Printing]) -> Printing:
    """The regular printing of a card within one set (no showcase or borderless variant)."""
    return min(printings, key=lambda p: (p.is_variant, _collector_order(p.collector_number)))


def build_set_cards(
    printings: Sequence[Printing],
    prices: Mapping[int, Price],
    play: Mapping[str, PlayRate],
    german: Mapping[tuple[str, str], Translation] | None = None,
) -> dict[str, list[CardRow]]:
    """Card rows per set, most played first. Basic lands are left out.

    German texts are looked up by (set code, Oracle id)."""
    german = german or {}
    by_card: dict[str, list[Printing]] = defaultdict(list)
    by_set_card: dict[tuple[str, str], list[Printing]] = defaultdict(list)
    for printing in printings:
        by_card[printing.oracle_id].append(printing)
        by_set_card[(printing.set_code, printing.oracle_id)].append(printing)

    price_of = {oracle_id: market_price(group, prices) for oracle_id, group in by_card.items()}
    rows: dict[str, list[CardRow]] = defaultdict(list)
    for (set_code, oracle_id), group in by_set_card.items():
        card = representative(group)
        if card.is_basic_land:
            continue
        rate = play.get(card_key(card.name))
        rows[set_code].append(
            CardRow(
                oracle_id=oracle_id,
                name=card.name,
                colors=card.color_identity,
                mana_cost=card.mana_cost,
                cmc=card.cmc,
                type_line=card.type_line,
                text=card.oracle_text,
                rarity=card.rarity,
                is_land="Land" in card.front_type,
                banned=card.legality("standard") == "banned",
                image_small=card.image_small,
                image_normal=card.image_normal,
                scryfall_url=card.scryfall_url,
                price=price_of[oracle_id],
                play_share=rate.share if rate else None,
                average_copies=rate.average_copies if rate else None,
                de=german.get((set_code, oracle_id)),
            )
        )
    for set_rows in rows.values():
        set_rows.sort(key=lambda r: (-(r.play_share or 0), -(r.price or 0), r.name))
    return dict(rows)


def mana_symbols(mana_cost: str) -> set[str]:
    """Symbols of a mana cost: '{2}{W/U}' -> {'2', 'W/U'}."""
    return set(re.findall(r"\{([^}]+)\}", mana_cost))


def _collector_order(number: str) -> tuple[int, str]:
    digits = re.match(r"\d+", number)
    return (int(digits.group()) if digits else 1_000_000, number)
