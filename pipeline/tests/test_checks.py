"""The sanity check that stops a broken snapshot before it reaches the website.

``check_snapshot`` returns every problem it finds (empty: fine); ``ensure_snapshot_ok`` raises
with all of them. ``previous`` is the parsed ``snapshot.json`` of the last build, as written
by ``write_snapshot``; the build reads it before writing the new one.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest

from rotation_radar.domain.cards import CardRow, Translation
from rotation_radar.domain.checks import SnapshotError, check_snapshot, ensure_snapshot_ok
from rotation_radar.domain.rotation import Certainty, RotationEstimate, SetRotation
from rotation_radar.domain.sets import SetStatus
from rotation_radar.snapshot import (
    RULE_SOURCE,
    SCHEMA_VERSION,
    RuleSummary,
    SetEntry,
    Snapshot,
    SourceInfo,
    StandardInfo,
    to_json_value,
)

LEGAL = StandardInfo(
    status=SetStatus.LEGAL, rotation=SetRotation(wave=0, earliest=None, certain=True)
)
UPCOMING = StandardInfo(
    status=SetStatus.UPCOMING, rotation=SetRotation(wave=None, earliest=None, certain=True)
)


def set_entry(index: int, standard: StandardInfo | None) -> SetEntry:
    return SetEntry(
        code=f"s{index:03d}",
        name=f"Set {index}",
        released_at=date(2026, 1, 1) - timedelta(days=30 * index),
        set_type="expansion",
        parent_code=None,
        card_count=0,
        icon_url=None,
        pack_image=None,
        formats=("standard",) if standard is LEGAL else ("modern",),
        standard=standard,
        products=(),
    )


def snapshot(
    *, sets: int = 120, standard_sets: int = 8, decks: int = 2500, upcoming: int = 0
) -> Snapshot:
    entries = [
        set_entry(i, UPCOMING if i < upcoming else LEGAL if i < upcoming + standard_sets else None)
        for i in range(sets)
    ]
    return Snapshot(
        schema_version=SCHEMA_VERSION,
        generated_at=datetime(2026, 11, 16, 4, 30, tzinfo=UTC),
        rotation=RotationEstimate(day=date(2027, 1, 22), certainty=Certainty.ESTIMATED),
        rules=RuleSummary(rotating_set_count=4, source_url=RULE_SOURCE, special_rule_sources={}),
        sources=SourceInfo(
            play_rate_from=date(2026, 10, 17) if decks else None,
            play_rate_to=date(2026, 11, 15) if decks else None,
            play_rate_decks=decks,
            play_rate_tournaments=decks // 50,
        ),
        sets=tuple(entries),
        formats=(),
        featured_art=(),
    )


def card(index: int, *, german: bool) -> CardRow:
    return CardRow(
        oracle_id=f"o{index}",
        name=f"Card {index}",
        colors="U",
        mana_cost="{U}",
        cmc=1.0,
        type_line="Instant",
        text="",
        rarity="common",
        is_land=False,
        banned=False,
        image_small=None,
        image_normal=None,
        scryfall_url=f"https://scryfall.com/card/s000/{index}",
        price=None,
        play_share=None,
        average_copies=None,
        de=(
            Translation(
                name=f"Karte {index}",
                text="",
                image_small=None,
                image_normal=None,
                scryfall_url=f"https://scryfall.com/card/s000/{index}/de",
            )
            if german
            else None
        ),
    )


def cards(total: int = 100, german: int = 75) -> dict[str, list[CardRow]]:
    """``total`` cards spread over two sets, the first ``german`` of them translated."""
    rows = [card(i, german=i < german) for i in range(total)]
    return {"s000": rows[: total // 2], "s001": rows[total // 2 :]}


def previous_of(old: Snapshot) -> Mapping[str, Any]:
    value: Mapping[str, Any] = to_json_value(old)
    return value


def problems(
    current: Snapshot,
    card_rows: Mapping[str, Sequence[CardRow]] | None = None,
    previous: Mapping[str, Any] | None = None,
) -> list[str]:
    return check_snapshot(current, cards() if card_rows is None else card_rows, previous)


def test_a_normal_snapshot_has_no_problems() -> None:
    assert problems(snapshot()) == []
    assert problems(snapshot(), previous=previous_of(snapshot())) == []


def test_fewer_than_100_sets_is_a_problem() -> None:
    assert problems(snapshot(sets=100)) == []
    found = problems(snapshot(sets=99))
    assert len(found) == 1
    assert "99" in found[0]


def test_a_snapshot_without_standard_sets_is_a_problem() -> None:
    found = problems(snapshot(standard_sets=0))
    assert len(found) == 1
    assert "Standard" in found[0]


def test_announced_sets_alone_do_not_count_as_standard() -> None:
    found = problems(snapshot(standard_sets=0, upcoming=2))
    assert len(found) == 1
    assert "Standard" in found[0]


def test_no_decks_for_the_play_rate_is_a_problem() -> None:
    found = problems(snapshot(decks=0))
    assert len(found) == 1
    assert "deck" in found[0].lower()


def test_fewer_than_half_the_cards_in_german_is_a_problem() -> None:
    assert problems(snapshot(), cards(total=100, german=50)) == []
    found = problems(snapshot(), cards(total=100, german=49))
    assert len(found) == 1
    assert "German" in found[0]


def test_no_cards_at_all_is_a_problem_not_a_crash() -> None:
    assert problems(snapshot(), {}) != []
    assert problems(snapshot(), {"s000": [], "s001": []}) != []


def test_losing_more_than_a_tenth_of_the_sets_since_the_last_build_is_a_problem() -> None:
    before = previous_of(snapshot(sets=200))
    assert problems(snapshot(sets=180), previous=before) == []
    found = problems(snapshot(sets=179), previous=before)
    assert len(found) == 1
    assert "200" in found[0] and "179" in found[0]


def test_more_sets_than_last_time_is_fine() -> None:
    assert problems(snapshot(sets=300), previous=previous_of(snapshot(sets=120))) == []


def test_falling_below_a_third_of_the_last_deck_count_is_a_problem() -> None:
    before = previous_of(snapshot(decks=3000))
    assert problems(snapshot(decks=1000), previous=before) == []
    found = problems(snapshot(decks=999), previous=before)
    assert len(found) == 1
    assert "3000" in found[0] and "999" in found[0]


def test_a_previous_snapshot_without_the_expected_keys_is_not_compared() -> None:
    assert problems(snapshot(), previous={}) == []
    assert problems(snapshot(), previous={"schemaVersion": 1, "sets": None}) == []


def test_every_problem_is_reported_not_only_the_first() -> None:
    found = problems(
        snapshot(sets=50, standard_sets=0, decks=0),
        cards(total=10, german=1),
        previous=previous_of(snapshot(sets=200, decks=3000)),
    )
    # at least: too few sets, no Standard, no decks, too little German, sets dropped
    assert len(found) >= 5


def test_ensure_snapshot_ok_passes_a_normal_snapshot() -> None:
    ensure_snapshot_ok(snapshot(), cards())
    ensure_snapshot_ok(snapshot(), cards(), previous_of(snapshot()))


def test_ensure_snapshot_ok_raises_with_every_problem_in_the_message() -> None:
    broken = snapshot(sets=50, standard_sets=0, decks=0)
    expected = check_snapshot(broken, cards(), None)

    with pytest.raises(SnapshotError) as error:
        ensure_snapshot_ok(broken, cards())

    assert len(expected) == 3
    for problem in expected:
        assert problem in str(error.value)
