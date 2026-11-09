from __future__ import annotations

from rotation_radar.domain.cards import (
    Price,
    Translation,
    build_set_cards,
    count_legality,
    mana_symbols,
    market_price,
    normalize_colors,
    representative,
)
from rotation_radar.domain.play import PlayRate, card_key
from rotation_radar.domain.sets import LegalityCount
from tests.factories import printing


def test_card_key_matches_decklist_and_scryfall_names() -> None:
    assert card_key("Fable of the Mirror-Breaker // Reflection of Kiki-Jiki") == card_key(
        "Fable of the Mirror-Breaker"
    )
    assert card_key("Lim-Dûl's Vault") == "lim-dul's vault"


def test_colors_in_wubrg_order() -> None:
    assert normalize_colors(["G", "U", "W"]) == "WUG"
    assert normalize_colors([]) == ""


def test_mana_symbols() -> None:
    assert mana_symbols("{2}{W/U}{W/U} // {B}") == {"2", "W/U", "B"}


class TestMarketPrice:
    def test_cheapest_non_foil_printing(self) -> None:
        prints = [printing("Opt", cardmarket_id=1), printing("Opt", cardmarket_id=2, number="2")]
        prices = {1: Price(trend=0.5, trend_foil=2.0), 2: Price(trend=0.2, trend_foil=1.0)}
        assert market_price(prints, prices) == 0.2

    def test_foil_only_printing_counts_only_without_regular_one(self) -> None:
        foil = printing("Opt", cardmarket_id=1, finishes=("foil",))
        regular = printing("Opt", cardmarket_id=2, number="2")
        prices = {1: Price(trend=None, trend_foil=0.1), 2: Price(trend=0.3, trend_foil=None)}
        assert market_price([foil, regular], prices) == 0.3
        assert market_price([foil], prices) == 0.1

    def test_no_price(self) -> None:
        assert market_price([printing("Opt")], {}) is None


def test_representative_skips_showcase_variants() -> None:
    regular = printing("Opt", number="250")
    showcase = printing("Opt", number="12", variant=True)
    assert representative([showcase, regular]) is regular


def test_count_legality_counts_distinct_cards() -> None:
    prints = [
        printing("Opt", number="1"),
        printing("Opt", number="300", variant=True),
        printing("Banned Card", standard="banned"),
        printing("Old Card", standard="not_legal"),
    ]
    assert count_legality(prints) == {"aaa": LegalityCount(cards=3, legal=2)}


def test_count_legality_per_format() -> None:
    commander_only = printing("Old Card", legalities={"commander": "legal"})
    modern = printing("Modern Card", legalities={"modern": "legal", "commander": "legal"})
    assert count_legality([commander_only, modern], "modern") == {
        "aaa": LegalityCount(cards=2, legal=1)
    }


def test_set_cards_most_played_first_without_basic_lands() -> None:
    prints = [
        printing("Opt", cardmarket_id=1),
        printing("Bolt", cardmarket_id=2, number="2"),
        printing("Island", number="3", type_line="Basic Land — Island"),
        printing("Watery Grave", number="4", type_line="Land — Island Swamp"),
    ]
    prices = {1: Price(trend=0.2, trend_foil=None), 2: Price(trend=1.0, trend_foil=None)}
    play = {"opt": PlayRate(share=31.5, average_copies=3.2)}

    rows = build_set_cards(prints, prices, play)["aaa"]

    assert [row.name for row in rows] == ["Opt", "Bolt", "Watery Grave"]
    assert rows[0].play_share == 31.5
    assert rows[1].play_share is None
    assert rows[2].is_land is True


def test_set_cards_carry_the_german_printing_of_the_same_set() -> None:
    prints = [printing("Opt", set_code="aaa"), printing("Opt", set_code="bbb")]
    german = {
        ("aaa", "Opt"): Translation(
            name="Omen", text="Fliegend", image_small=None, image_normal="de.jpg", scryfall_url="u"
        )
    }

    rows = build_set_cards(prints, {}, {}, german)

    assert rows["aaa"][0].de is not None and rows["aaa"][0].de.name == "Omen"
    assert rows["bbb"][0].de is None
