"""Artwork for the page background: the most striking cards of recent sets.

Per set the most valuable rares and mythics in their regular printing are chosen --
usually the cards people talk about. Only Scryfall's art crops are used, unchanged, and the
artist is always credited next to them. Each artwork's main colour lets the website sort
the wall by colour.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, replace

from rotation_radar.domain.cards import Printing
from rotation_radar.domain.sets import MtgSet

FEATURED_RARITIES = frozenset({"rare", "mythic"})
# Below this the pixel hues cancel each other out: the artwork has no main colour
MIN_HUE_STRENGTH = 0.05


@dataclass(frozen=True)
class FeaturedArt:
    card_name: str
    set_code: str
    set_name: str
    artist: str
    image_url: str
    hue: int | None = None  # main colour in degrees (0 red, 120 green, 240 blue), see main_hue


def main_hue(pixels: Iterable[tuple[int, int, int]]) -> int | None:
    """The main colour of an image as a hue in degrees, or None if it has none (grey).

    The average of all pixel hues on the colour wheel, so red at 350° and 10° average to
    red, not cyan. Saturated, bright pixels count most; grey ones not at all.
    """
    x = y = total = 0.0
    for red, green, blue in pixels:
        r, g, b = red / 255, green / 255, blue / 255
        high, low = max(r, g, b), min(r, g, b)
        spread = high - low
        if spread == 0:
            continue
        if high == r:
            sector = ((g - b) / spread) % 6
        elif high == g:
            sector = (b - r) / spread + 2
        else:
            sector = (r - g) / spread + 4
        angle = math.radians(sector * 60)
        weight = spread * high
        x += math.cos(angle) * weight
        y += math.sin(angle) * weight
        total += weight
    if total == 0 or math.hypot(x, y) / total < MIN_HUE_STRENGTH:
        return None
    return round(math.degrees(math.atan2(y, x))) % 360


def with_hues(
    art: Sequence[FeaturedArt], hues: Mapping[str, int | None]
) -> tuple[FeaturedArt, ...]:
    """The artworks with their main colour, looked up by image URL."""
    return tuple(replace(a, hue=hues.get(a.image_url)) for a in art)


def featured_art(
    sets: Sequence[MtgSet],
    printings: Sequence[Printing],
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
        return printing.price_eur or 0.0

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
