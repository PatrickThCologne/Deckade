"""Artwork for the page background: the most striking cards of recent sets.

Per set the most valuable rares and mythics in their regular printing are chosen --
usually the cards people talk about. Only Scryfall's art crops are used, unchanged, and the
artist is always credited next to them.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from rotation_radar.domain.cards import Price, Printing
from rotation_radar.domain.sets import MtgSet

FEATURED_RARITIES = frozenset({"rare", "mythic"})


@dataclass(frozen=True)
class FeaturedArt:
    card_name: str
    set_code: str
    set_name: str
    artist: str
    image_url: str


def featured_art(
    sets: Sequence[MtgSet],
    printings: Sequence[Printing],
    prices: Mapping[int, Price],
    per_set: int = 1,
) -> tuple[FeaturedArt, ...]:
    """Up to ``per_set`` artworks per set, in the order of ``sets``, most valuable first."""
    by_set: dict[str, list[Printing]] = {}
    for printing in printings:
        if (
            printing.rarity in FEATURED_RARITIES
            and not printing.is_variant
            and printing.art_crop
            and printing.artist
        ):
            by_set.setdefault(printing.set_code, []).append(printing)

    def value(printing: Printing) -> float:
        price = prices.get(printing.cardmarket_id) if printing.cardmarket_id else None
        return (price.trend or 0.0) if price else 0.0

    chosen = []
    for mtg_set in sets:
        seen: set[str] = set()
        for best in sorted(by_set.get(mtg_set.code, ()), key=value, reverse=True):
            if best.oracle_id in seen:
                continue
            seen.add(best.oracle_id)
            chosen.append(
                FeaturedArt(
                    card_name=best.name,
                    set_code=mtg_set.code,
                    set_name=mtg_set.name,
                    artist=best.artist or "",
                    image_url=best.art_crop or "",
                )
            )
            if len(seen) == per_set:
                break
    return tuple(chosen)
