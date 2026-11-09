"""Magic sets and their Standard status."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from enum import StrEnum

STANDARD_SET_TYPES = frozenset({"expansion", "core"})


class SetStatus(StrEnum):
    UPCOMING = "upcoming"
    LEGAL = "legal"
    NOT_LEGAL = "not_legal"


@dataclass(frozen=True)
class MtgSet:
    code: str
    name: str
    released_at: date
    set_type: str
    parent_code: str | None = None
    digital: bool = False
    icon_url: str | None = None

    @property
    def is_premier(self) -> bool:
        """A premier set: a main paper expansion, not a bonus sheet or digital release."""
        return self.set_type == "expansion" and self.parent_code is None and not self.digital


@dataclass(frozen=True)
class LegalityCount:
    """Distinct cards printed in a set and how many of them are Standard-legal."""

    cards: int
    legal: int

    @property
    def legal_share(self) -> float:
        return self.legal / self.cards if self.cards else 0.0
