"""Sanity checks on a finished snapshot, before it replaces the last good one.

A source that answers with too little (an empty decklist archive, a half-delivered set list)
does not crash the build; it produces a snapshot that looks fine and shows an empty site.
These checks catch that: absolute floors for what every build must have, and a comparison
with the previous build for a sudden drop.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from fractions import Fraction
from typing import Any

from rotation_radar.domain.cards import CardRow
from rotation_radar.domain.sets import SetStatus
from rotation_radar.snapshot import Snapshot

# The site had 182 sets in November 2026; the set list only grows.
MIN_SETS = 100
# About three quarters of the cards had a German printing in November 2026; far fewer means
# the German bulk file was not read properly.
MIN_GERMAN_SHARE = 0.5
# Against the last build: the set list only grows, the number of decks in the play rate
# window varies, but not by a factor of three from one day to the next. Fractions keep the
# limits exact (180 of 200 sets is still fine).
MIN_SET_SHARE = Fraction(9, 10)
MIN_DECK_SHARE = Fraction(1, 3)


class SnapshotError(Exception):
    """The snapshot failed the sanity checks and must not be written."""


def check_snapshot(
    snapshot: Snapshot,
    cards_by_set: Mapping[str, Sequence[CardRow]],
    previous: Mapping[str, Any] | None = None,
) -> list[str]:
    """Every problem found, in plain words; empty when the snapshot looks fine.
    ``previous`` is the parsed ``snapshot.json`` of the last build."""
    problems = []
    set_count = len(snapshot.sets)
    if set_count < MIN_SETS:
        problems.append(f"only {set_count} sets, expected at least {MIN_SETS}")
    if not any(s.standard and s.standard.status is SetStatus.LEGAL for s in snapshot.sets):
        problems.append("no set is legal in Standard")
    decks = snapshot.sources.play_rate_decks
    if decks == 0:
        problems.append("no decks for the play rate")
    problems += _german_problems(cards_by_set)
    if previous is not None:
        problems += _drops_since(previous, set_count, decks)
    return problems


def ensure_snapshot_ok(
    snapshot: Snapshot,
    cards_by_set: Mapping[str, Sequence[CardRow]],
    previous: Mapping[str, Any] | None = None,
) -> None:
    """Raises ``SnapshotError`` listing every problem ``check_snapshot`` finds."""
    problems = check_snapshot(snapshot, cards_by_set, previous)
    if problems:
        listed = "\n".join(f"- {problem}" for problem in problems)
        raise SnapshotError(f"The snapshot failed its checks and was not written:\n{listed}")


def _german_problems(cards_by_set: Mapping[str, Sequence[CardRow]]) -> list[str]:
    rows = [row for rows in cards_by_set.values() for row in rows]
    if not rows:
        return ["no cards at all"]
    german = sum(1 for row in rows if row.de is not None)
    if german < MIN_GERMAN_SHARE * len(rows):
        return [f"only {german} of {len(rows)} cards have a German translation"]
    return []


def _drops_since(previous: Mapping[str, Any], set_count: int, decks: int) -> list[str]:
    # The file of the last build may come from an older contract version: compare only
    # what is there in the expected shape.
    problems = []
    previous_sets = previous.get("sets")
    if isinstance(previous_sets, list) and set_count < MIN_SET_SHARE * len(previous_sets):
        problems.append(f"{set_count} sets, down from {len(previous_sets)} in the last build")
    sources = previous.get("sources")
    previous_decks = sources.get("playRateDecks") if isinstance(sources, Mapping) else None
    if isinstance(previous_decks, int) and decks < MIN_DECK_SHARE * previous_decks:
        problems.append(f"{decks} decks for the play rate, down from {previous_decks}")
    return problems
