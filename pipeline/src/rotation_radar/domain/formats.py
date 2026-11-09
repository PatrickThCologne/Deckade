"""Non-rotating formats (Pioneer, Modern, Commander): which sets are legal in them.

No set list is hard-coded. A set counts as legal in a format when enough of its cards
are legal there according to Scryfall -- the same rule that decides Standard.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date

from rotation_radar.domain.sets import LegalityCount, MtgSet


@dataclass(frozen=True)
class FormatRule:
    id: str
    name: str
    set_types: frozenset[str]
    earliest_release: date  # narrows the candidates only; legality comes from card data
    info_url: str
    banlist_url: str


def format_candidates(sets: Iterable[MtgSet], rule: FormatRule, today: date) -> list[MtgSet]:
    """Released paper sets of the format's set types."""
    return [
        s
        for s in sets
        if s.set_type in rule.set_types
        and not s.digital
        and rule.earliest_release <= s.released_at <= today
    ]


def legal_sets(
    candidates: Iterable[MtgSet],
    legality: Mapping[str, LegalityCount],
    threshold: float,
) -> list[MtgSet]:
    """Legal sets, newest first. Bonus sheets stay in; the site shows them with their main set."""
    legal = [
        s for s in candidates if legality.get(s.code, LegalityCount(0, 0)).legal_share >= threshold
    ]
    return sorted(legal, key=lambda s: (s.released_at, s.code), reverse=True)
