from __future__ import annotations

from dataclasses import replace

from rotation_radar.domain.art import FeaturedArt, featured_art
from rotation_radar.domain.cards import Price, Printing
from tests.factories import mtg_set, printing


def art(
    name: str, *, cardmarket_id: int, rarity: str = "mythic", variant: bool = False
) -> Printing:
    base = printing(name, cardmarket_id=cardmarket_id, variant=variant)
    return replace(base, rarity=rarity, art_crop=f"https://img/{name}.jpg", artist="Some Artist")


def test_picks_the_most_valuable_regular_rare_or_mythic_per_set() -> None:
    prints = [
        art("Cheap Mythic", cardmarket_id=1),
        art("Pricey Mythic", cardmarket_id=2),
        art("Pricey Showcase", cardmarket_id=3, variant=True),
        art("Pricey Common", cardmarket_id=4, rarity="common"),
    ]
    prices = {
        1: Price(trend=2.0, trend_foil=None),
        2: Price(trend=40.0, trend_foil=None),
        3: Price(trend=90.0, trend_foil=None),
        4: Price(trend=99.0, trend_foil=None),
    }
    result = featured_art([mtg_set("aaa", "2026-01-01")], prints, prices)
    assert result == (
        FeaturedArt("Pricey Mythic", "aaa", "AAA", "Some Artist", "https://img/Pricey Mythic.jpg"),
    )


def test_several_per_set_without_duplicates() -> None:
    prints = [
        art("A", cardmarket_id=1),
        art("A", cardmarket_id=2),  # second printing of the same card
        art("B", cardmarket_id=3),
    ]
    prices = {i: Price(trend=float(i), trend_foil=None) for i in (1, 2, 3)}
    names = [a.card_name for a in featured_art([mtg_set("aaa", "2026-01-01")], prints, prices, 2)]
    assert names == ["B", "A"]


def test_sets_without_art_are_skipped() -> None:
    assert featured_art([mtg_set("bbb", "2026-01-01")], [], {}) == ()
