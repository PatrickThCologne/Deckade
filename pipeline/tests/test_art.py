from __future__ import annotations

from dataclasses import replace

from rotation_radar.domain.art import FeaturedArt, featured_art, main_hue, with_hues
from rotation_radar.domain.cards import Printing
from tests.factories import mtg_set, printing


def art(name: str, *, eur: float, rarity: str = "mythic", variant: bool = False) -> Printing:
    base = printing(name, eur=eur, variant=variant)
    return replace(base, rarity=rarity, art_crop=f"https://img/{name}.jpg", artist="Some Artist")


def test_picks_the_most_valuable_regular_rare_or_mythic_per_set() -> None:
    prints = [
        art("Cheap Mythic", eur=2.0),
        art("Pricey Mythic", eur=40.0),
        art("Pricey Showcase", eur=90.0, variant=True),
        art("Pricey Common", eur=99.0, rarity="common"),
    ]
    result = featured_art([mtg_set("aaa", "2026-01-01")], prints)
    assert result == (
        FeaturedArt("Pricey Mythic", "aaa", "AAA", "Some Artist", "https://img/Pricey Mythic.jpg"),
    )


def test_several_per_set_without_duplicates() -> None:
    prints = [
        art("A", eur=1.0),
        art("A", eur=2.0),  # second printing of the same card
        art("B", eur=3.0),
    ]
    names = [a.card_name for a in featured_art([mtg_set("aaa", "2026-01-01")], prints, 2)]
    assert names == ["B", "A"]


def test_sets_without_art_are_skipped() -> None:
    assert featured_art([mtg_set("bbb", "2026-01-01")], []) == ()


def test_main_hue_of_plain_colours() -> None:
    assert main_hue([(255, 0, 0)] * 4) == 0
    assert main_hue([(0, 200, 0)] * 4) == 120
    assert main_hue([(0, 0, 255)] * 4) == 240


def test_main_hue_averages_on_the_colour_wheel() -> None:
    # Pink-red (350°) and orange-red (10°) average to red, not to cyan (180°)
    assert main_hue([(255, 0, 43), (255, 43, 0)]) == 0


def test_saturated_bright_pixels_outweigh_dull_ones() -> None:
    dull_blue = (90, 90, 110)
    hue = main_hue([(255, 0, 0)] + [dull_blue] * 3)
    assert hue is not None
    assert min(hue, 360 - hue) <= 10  # still red, only nudged towards blue


def test_grey_or_balanced_images_have_no_main_hue() -> None:
    assert main_hue([(128, 128, 128), (0, 0, 0), (255, 255, 255)]) is None
    assert main_hue([(255, 0, 0), (0, 255, 255)]) is None  # opposite colours cancel out
    assert main_hue([]) is None


def test_with_hues_adds_the_colour_by_image_url() -> None:
    plain = FeaturedArt("A", "aaa", "AAA", "Someone", "https://img/a.jpg")
    other = FeaturedArt("B", "aaa", "AAA", "Someone", "https://img/b.jpg")

    result = with_hues([plain, other], {"https://img/a.jpg": 210})

    assert result == (replace(plain, hue=210), other)
