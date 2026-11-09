from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

import pytest

from rotation_radar.domain.rotation import (
    Certainty,
    RotationEstimate,
    assign_rotation,
    classify,
    estimate_next_rotation,
    standard_candidates,
)
from rotation_radar.domain.sets import LegalityCount, MtgSet, SetStatus
from rotation_radar.rules import RotationRules, SpecialRule, load_rules
from tests.factories import mtg_set

TODAY = date(2026, 11, 3)
RULES = RotationRules()
NEXT_ROTATION = RotationEstimate(day=date(2027, 1, 29), certainty=Certainty.ESTIMATED)


def legal(sets: list[MtgSet]) -> dict[str, SetStatus]:
    return {s.code: SetStatus.LEGAL for s in sets}


def yearly_sets(count: int, first_year: int = 2023) -> list[MtgSet]:
    """`count` main sets, two months apart, oldest first."""
    start = date(first_year, 1, 15)
    return [
        mtg_set(f"s{i:02d}", (start + timedelta(days=61 * i)).isoformat()) for i in range(count)
    ]


class TestCandidatesAndStatus:
    def test_keeps_recent_paper_expansions_and_core_sets(self) -> None:
        sets = [
            mtg_set("new", "2026-10-02"),
            mtg_set("core", "2024-11-15", set_type="core"),
            mtg_set("old", "2021-09-24"),
            mtg_set("alc", "2026-01-01", set_type="alchemy", digital=True),
            mtg_set("cmd", "2026-03-01", set_type="commander"),
        ]
        codes = [s.code for s in standard_candidates(sets, TODAY, RULES)]
        assert codes == ["new", "core"]

    def test_status_from_release_date_and_legal_share(self) -> None:
        sets = [
            mtg_set("up", "2026-12-01"),
            mtg_set("in", "2025-01-01"),
            mtg_set("out", "2022-01-01"),
        ]
        legality = {
            "in": LegalityCount(cards=100, legal=100),
            "out": LegalityCount(cards=100, legal=10),
        }
        assert classify(sets, legality, TODAY, RULES) == {
            "up": SetStatus.UPCOMING,
            "in": SetStatus.LEGAL,
            "out": SetStatus.NOT_LEGAL,
        }


class TestNextRotation:
    def test_is_prerelease_of_next_years_first_premier_set(self) -> None:
        sets = [
            mtg_set("ecl", "2026-01-23"),
            mtg_set("nau", "2027-02-05"),
            mtg_set("mdd", "2027-04-09"),
            mtg_set("bonus", "2027-01-10", parent="nau"),
            mtg_set("digital", "2027-01-05", digital=True),
        ]
        estimate = estimate_next_rotation(sets, TODAY, RULES)
        assert estimate == RotationEstimate(
            day=date(2027, 1, 29), certainty=Certainty.ESTIMATED, trigger_set="nau"
        )

    def test_official_date_wins(self) -> None:
        rules = RotationRules(official_rotation_date=date(2027, 1, 30))
        estimate = estimate_next_rotation([mtg_set("nau", "2027-02-05")], TODAY, rules)
        assert estimate.day == date(2027, 1, 30)
        assert estimate.certainty is Certainty.OFFICIAL

    def test_unknown_without_announced_sets(self) -> None:
        assert estimate_next_rotation([], TODAY, RULES).day is None


class TestAssignRotation:
    def test_six_oldest_rotate_next_and_later_sets_follow_in_groups_of_six(self) -> None:
        sets = yearly_sets(13)
        result = assign_rotation(sets, legal(sets), NEXT_ROTATION, RULES)

        assert [result[s.code].wave for s in sets] == [0] * 6 + [1] * 6 + [2]
        assert all(result[s.code].certain for s in sets[:6])
        assert not any(result[s.code].certain for s in sets[6:])
        assert result["s06"].earliest == date(2028, 1, 29)
        assert result["s12"].earliest == date(2029, 1, 29)

    def test_special_rule_set_is_skipped_so_later_sets_get_their_earliest_date(self) -> None:
        sets = yearly_sets(13)
        rules = RotationRules(special_rules={"s07": SpecialRule(2029, "test")})
        result = assign_rotation(sets, legal(sets), NEXT_ROTATION, rules)

        assert result["s07"].wave is None
        assert result["s07"].legal_until_at_least == 2029
        # s12 moves up into the 2028 wave: it cannot rotate earlier than that.
        assert result["s12"].wave == 1

    def test_special_rule_among_the_six_oldest_makes_the_next_set_uncertain(self) -> None:
        sets = yearly_sets(8)
        rules = RotationRules(special_rules={"s02": SpecialRule(2029, "test")})
        result = assign_rotation(sets, legal(sets), NEXT_ROTATION, rules)

        assert [s.code for s in sets if result[s.code].certain] == [
            "s00",
            "s01",
            "s03",
            "s04",
            "s05",
        ]
        assert result["s06"].wave == 0
        assert result["s06"].certain is False
        assert result["s07"].wave == 1

    def test_bonus_sheet_rotates_with_its_main_set(self) -> None:
        sets = [*yearly_sets(7), mtg_set("big", "2023-03-17", parent="s01")]
        result = assign_rotation(sets, legal(sets), NEXT_ROTATION, RULES)
        assert result["big"] == result["s01"]

    def test_upcoming_sets_queue_behind_legal_ones(self) -> None:
        sets = yearly_sets(7)
        statuses = {**legal(sets), "s06": SetStatus.UPCOMING}
        result = assign_rotation(sets, statuses, NEXT_ROTATION, RULES)
        assert result["s06"].wave == 1

    def test_without_a_known_date_waves_have_no_dates(self) -> None:
        sets = yearly_sets(7)
        unknown = RotationEstimate(day=None, certainty=Certainty.ESTIMATED)
        result = assign_rotation(sets, legal(sets), unknown, RULES)
        assert result["s00"].wave == 0
        assert result["s00"].earliest is None

    @pytest.mark.parametrize("status", [SetStatus.NOT_LEGAL])
    def test_sets_outside_standard_get_no_rotation(self, status: SetStatus) -> None:
        sets = yearly_sets(2)
        result = assign_rotation(
            sets, {"s00": status, "s01": SetStatus.LEGAL}, NEXT_ROTATION, RULES
        )
        assert "s00" not in result


def test_hidden_sets_are_read_from_the_catalog_table(tmp_path: Path) -> None:
    source = Path(__file__).parents[1] / "rules.toml"
    rules_file = tmp_path / "rules.toml"
    rules_file.write_text(
        source.read_text(encoding="utf-8").replace('"mbc"', '"MBC", "abc"'), encoding="utf-8"
    )
    assert load_rules(rules_file).hidden_sets == frozenset({"mbc", "abc"})
