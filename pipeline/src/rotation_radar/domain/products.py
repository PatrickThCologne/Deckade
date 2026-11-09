"""Sealed products: bundles and booster boxes and what is inside them."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from enum import StrEnum


class ProductCategory(StrEnum):
    BUNDLE = "bundle"
    BOOSTER_BOX = "booster_box"


class PackKind(StrEnum):
    PLAY = "play"
    SET = "set"
    DRAFT = "draft"
    JUMPSTART = "jumpstart"
    COLLECTOR = "collector"
    BOOSTER = "booster"  # main booster without a type in its name
    BONUS = "bonus"  # single special pack, e.g. "Chocobo Booster Pack"
    TOPPER = "topper"

    @property
    def is_extra(self) -> bool:
        return self in (PackKind.BONUS, PackKind.TOPPER)


# A typeless booster that appears fewer times than this is a bonus, not the main content.
MAIN_CONTENT_MIN_COUNT = 6

# Booster pack whose image represents a set, in order of preference.
PACK_ART_PREFERENCE = ("play", "set", "draft", "collector", "default")


@dataclass(frozen=True)
class PackCount:
    count: int
    kind: PackKind


@dataclass(frozen=True)
class SealedItem:
    """One line of a product's contents as listed by MTGJSON."""

    name: str
    count: int


@dataclass(frozen=True)
class SealedProduct:
    name: str
    category: str
    subtype: str | None
    cardmarket_id: int | None
    tcgplayer_id: str | None
    contents: tuple[SealedItem, ...] = ()


@dataclass(frozen=True)
class Product:
    name: str
    category: ProductCategory
    subtype: str | None
    contents: tuple[PackCount, ...]
    cardmarket_id: int | None
    price: float | None
    average_sale: float | None

    @property
    def price_per_pack(self) -> float | None:
        """Price per booster, only when the product holds a single booster type."""
        main = [c for c in self.contents if not c.kind.is_extra]
        if self.price is None or len({c.kind for c in main}) != 1:
            return None
        return round(self.price / sum(c.count for c in main), 2)


def classify_pack(name: str, count: int) -> PackKind:
    """Booster type from an MTGJSON item name, e.g. 'Aetherdrift Play Booster Pack'."""
    if "Collector" in name:
        return PackKind.COLLECTOR
    if "Topper" in name:
        return PackKind.TOPPER
    for kind in (PackKind.PLAY, PackKind.SET, PackKind.DRAFT, PackKind.JUMPSTART):
        if f"{kind.value.capitalize()} Booster" in name:
            return kind
    return PackKind.BOOSTER if count >= MAIN_CONTENT_MIN_COUNT else PackKind.BONUS


def parse_contents(items: Iterable[SealedItem]) -> tuple[PackCount, ...]:
    """Pack counts with the main content first and extras (toppers, bonus packs) last."""
    counts = [PackCount(item.count, classify_pack(item.name, item.count)) for item in items]
    return tuple(sorted(counts, key=lambda c: c.kind.is_extra))


def choose_pack_art(products: Sequence[SealedProduct]) -> SealedProduct | None:
    """The booster pack that represents a set: the one you would buy in a store."""
    packs = [
        p
        for p in products
        if p.category == "booster_pack" and p.tcgplayer_id and p.subtype in PACK_ART_PREFERENCE
    ]
    return min(packs, key=lambda p: PACK_ART_PREFERENCE.index(p.subtype or ""), default=None)
