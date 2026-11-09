"""Standard rotation: which sets are in Standard and when they can rotate out.

Official rule (https://magic.wizards.com/en/formats/standard): once per year, after
the Prerelease of the year's first premier set, the six oldest sets rotate out.

This module only claims what follows from that rule:

* The next rotation removes the six oldest sets -> ``certain=True``.
* For every later set only the *earliest possible* rotation is known. Sets with a
  special rule are left out of the count, so each set moves up as early as it could.
  "Stays at least until ..." is therefore true as long as the rule holds.
* If a special-rule set is among the six oldest, Wizards has not said whether
  another set takes its place. That set is reported with ``wave=0, certain=False``.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from enum import StrEnum

from rotation_radar.domain.sets import STANDARD_SET_TYPES, LegalityCount, MtgSet, SetStatus
from rotation_radar.rules import RotationRules


class Certainty(StrEnum):
    OFFICIAL = "official"
    ESTIMATED = "estimated"


@dataclass(frozen=True)
class RotationEstimate:
    day: date | None
    certainty: Certainty
    trigger_set: str | None = None


@dataclass(frozen=True)
class SetRotation:
    """When a set leaves Standard.

    ``wave`` 0 is the next rotation, 1 the one after, and so on; ``None`` means the
    set follows a special rule. ``earliest`` is the earliest possible date.
    """

    wave: int | None
    earliest: date | None
    certain: bool
    legal_until_at_least: int | None = None


def standard_candidates(sets: Iterable[MtgSet], today: date, rules: RotationRules) -> list[MtgSet]:
    """Paper expansions and core sets recent enough to be in Standard, plus announced ones."""
    since = today.replace(day=1).replace(year=today.year - rules.lookback_years)
    return [
        s
        for s in sets
        if s.set_type in STANDARD_SET_TYPES and not s.digital and s.released_at >= since
    ]


def classify(
    sets: Iterable[MtgSet],
    legality: Mapping[str, LegalityCount],
    today: date,
    rules: RotationRules,
) -> dict[str, SetStatus]:
    statuses: dict[str, SetStatus] = {}
    for mtg_set in sets:
        count = legality.get(mtg_set.code, LegalityCount(cards=0, legal=0))
        if mtg_set.released_at > today:
            statuses[mtg_set.code] = SetStatus.UPCOMING
        elif count.legal_share >= rules.legal_share_threshold:
            statuses[mtg_set.code] = SetStatus.LEGAL
        else:
            statuses[mtg_set.code] = SetStatus.NOT_LEGAL
    return statuses


def estimate_next_rotation(
    sets: Iterable[MtgSet], today: date, rules: RotationRules
) -> RotationEstimate:
    """Official date if configured, else the Prerelease of the next year's first premier set."""
    official = rules.official_rotation_date
    if official is not None and official >= today:
        return RotationEstimate(day=official, certainty=Certainty.OFFICIAL)

    first_of_year: dict[int, MtgSet] = {}
    for mtg_set in sets:
        if not mtg_set.is_premier:
            continue
        year = mtg_set.released_at.year
        current = first_of_year.get(year)
        if current is None or mtg_set.released_at < current.released_at:
            first_of_year[year] = mtg_set

    for year in (today.year, today.year + 1):
        first = first_of_year.get(year)
        if first is None:
            continue
        prerelease = first.released_at - rules.prerelease_lead
        if prerelease > today:
            return RotationEstimate(
                day=prerelease, certainty=Certainty.ESTIMATED, trigger_set=first.code
            )
    return RotationEstimate(day=None, certainty=Certainty.ESTIMATED)


def assign_rotation(
    sets: Sequence[MtgSet],
    statuses: Mapping[str, SetStatus],
    estimate: RotationEstimate,
    rules: RotationRules,
) -> dict[str, SetRotation]:
    """Rotation wave and earliest rotation date for every set in Standard or upcoming."""
    tracked = {s.code for s in sets if statuses.get(s.code) is not SetStatus.NOT_LEGAL}
    main_sets = sorted(
        (s for s in sets if s.code in tracked and s.parent_code not in tracked),
        key=lambda s: s.released_at,
    )
    special = rules.special_rules
    size = rules.rotating_set_count

    oldest_legal = [s for s in main_sets if statuses[s.code] is SetStatus.LEGAL][:size]
    rotating_next = [s for s in oldest_legal if s.code not in special]
    open_slots = len(oldest_legal) - len(rotating_next)
    queue = [s for s in main_sets if s not in rotating_next and s.code not in special]

    def wave_rotation(wave: int, certain: bool) -> SetRotation:
        day = _add_years(estimate.day, wave) if estimate.day else None
        return SetRotation(wave=wave, earliest=day, certain=certain)

    result = {s.code: wave_rotation(0, certain=True) for s in rotating_next}
    for position, mtg_set in enumerate(queue):
        if position < open_slots:
            result[mtg_set.code] = wave_rotation(0, certain=False)
        else:
            result[mtg_set.code] = wave_rotation(1 + (position - open_slots) // size, False)

    for mtg_set in main_sets:
        rule = special.get(mtg_set.code)
        if rule is not None:
            result[mtg_set.code] = SetRotation(
                wave=None,
                earliest=None,
                certain=False,
                legal_until_at_least=rule.legal_until_at_least,
            )

    # Bonus sheets such as "The Big Score" rotate together with their main set.
    for mtg_set in sets:
        if mtg_set.code in tracked and mtg_set.parent_code in result:
            result[mtg_set.code] = result[mtg_set.parent_code]
    return result


def _add_years(day: date, years: int) -> date:
    try:
        return day.replace(year=day.year + years)
    except ValueError:  # 29 February in a non-leap year
        return day.replace(year=day.year + years, day=28)
