from __future__ import annotations

from datetime import date
from pathlib import Path

from rotation_radar.domain.formats import FormatRule, format_candidates, legal_sets
from rotation_radar.domain.sets import LegalityCount
from rotation_radar.rules import load_formats
from tests.factories import mtg_set

TODAY = date(2026, 11, 5)
PIONEER = FormatRule(
    id="pioneer",
    name="Pioneer",
    set_types=frozenset({"expansion", "core"}),
    earliest_release=date(2012, 10, 5),
    info_url="https://example.org/pioneer",
    banlist_url="https://example.org/pioneer-banned",
)


def test_candidates_are_released_paper_sets_of_the_format_types() -> None:
    sets = [
        mtg_set("rtr", "2012-10-05"),
        mtg_set("isd", "2011-09-30"),
        mtg_set("cmm", "2023-08-04", set_type="masters"),
        mtg_set("y24", "2024-01-01", digital=True),
        mtg_set("nau", "2027-02-05"),
    ]
    assert [s.code for s in format_candidates(sets, PIONEER, TODAY)] == ["rtr"]


def test_legal_sets_follow_the_card_data_newest_first() -> None:
    sets = [
        mtg_set("rtr", "2012-10-05"),
        mtg_set("tla", "2025-11-21"),
        mtg_set("j25", "2024-11-15"),
    ]
    legality = {
        "rtr": LegalityCount(cards=274, legal=274),
        "tla": LegalityCount(cards=286, legal=286),
        "j25": LegalityCount(cards=700, legal=120),  # mostly cards that are not Pioneer-legal
    }
    assert [s.code for s in legal_sets(sets, legality, 0.8)] == ["tla", "rtr"]


def test_bonus_sheets_stay_in_so_their_cards_can_be_shown() -> None:
    sets = [mtg_set("otj", "2024-04-19"), mtg_set("big", "2024-04-19", parent="otj")]
    legality = {code: LegalityCount(cards=10, legal=10) for code in ("otj", "big")}
    assert {s.code for s in legal_sets(sets, legality, 0.8)} == {"otj", "big"}


def test_load_formats(tmp_path: Path) -> None:
    rules = tmp_path / "rules.toml"
    rules.write_text(
        """
[formats.pioneer]
name = "Pioneer"
set_types = ["expansion", "core"]
earliest_release = "2012-10-05"
info_url = "https://example.org/pioneer"
banlist_url = "https://example.org/pioneer-banned"
""",
        encoding="utf-8",
    )
    assert load_formats(rules) == (PIONEER,)
