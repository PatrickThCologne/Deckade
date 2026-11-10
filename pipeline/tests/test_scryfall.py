from __future__ import annotations

from typing import Any

from rotation_radar.sources.scryfall import parse_printing, parse_translation


def card(**overrides: Any) -> dict[str, Any]:
    raw: dict[str, Any] = {
        "id": "1",
        "oracle_id": "o",
        "name": "Aang",
        "set": "tla",
        "legalities": {"standard": "legal", "vintage": "legal"},
        "image_uris": {"normal": "n.jpg", "art_crop": "a.jpg"},
        "artist": "Someone",
    }
    return {**raw, **overrides}


def test_universes_beyond_marker_is_not_a_special_treatment() -> None:
    regular = parse_printing(card(promo_types=["universesbeyond"]))
    showcase = parse_printing(card(promo_types=["universesbeyond", "boosterfun"]))
    assert regular is not None and regular.is_variant is False
    assert showcase is not None and showcase.is_variant is True


def test_keeps_only_the_tracked_formats_and_the_art() -> None:
    printing = parse_printing(card())
    assert printing is not None
    assert printing.legality("standard") == "legal"
    assert printing.legality("modern") == "not_legal"
    assert "vintage" not in printing.legalities
    assert (printing.art_crop, printing.artist) == ("a.jpg", "Someone")


def test_tokens_without_oracle_id_are_skipped() -> None:
    assert parse_printing(card(oracle_id=None)) is None


def test_reads_the_rules_text_of_every_face() -> None:
    single = parse_printing(card(oracle_text="Flying"))
    faces = parse_printing(
        card(card_faces=[{"oracle_text": "Flash"}, {"oracle_text": "Defender"}], image_uris=None)
    )
    assert single is not None and single.oracle_text == "Flying"
    assert faces is not None and faces.oracle_text == "Flash\n\nDefender"


def test_reads_the_printed_name_and_text_of_a_translation() -> None:
    parsed = parse_translation(
        card(lang="de", printed_name="Aang, der Luftnomade", printed_text="Fliegend")
    )
    assert parsed is not None
    printing, translation = parsed
    assert printing.name == "Aang"
    assert (translation.name, translation.text) == ("Aang, der Luftnomade", "Fliegend")
    assert translation.image_normal == "n.jpg"


def test_translation_of_a_double_faced_card_names_both_faces() -> None:
    parsed = parse_translation(
        card(
            image_uris=None,
            card_faces=[
                {"printed_name": "Vorn", "printed_text": "A", "image_uris": {"normal": "f.jpg"}},
                {"printed_name": "Hinten", "printed_text": "B"},
            ],
        )
    )
    assert parsed is not None
    _, translation = parsed
    assert (translation.name, translation.text) == ("Vorn // Hinten", "A\n\nB")
    assert translation.image_normal == "f.jpg"


def test_reads_the_euro_prices_and_skips_missing_ones() -> None:
    printing = parse_printing(card(prices={"usd": "0.30", "eur": "0.25", "eur_foil": None}))
    assert printing is not None
    assert (printing.price_eur, printing.price_eur_foil) == (0.25, None)
    bare = parse_printing(card())
    assert bare is not None and bare.price_eur is None
