"""Play rate: how often a card shows up in recent tournament decks."""

from __future__ import annotations

import unicodedata
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date


def card_key(name: str) -> str:
    """Comparable card name: front face only, without accents, lower case.

    Decklists write "Fable of the Mirror-Breaker" while Scryfall knows
    "Fable of the Mirror-Breaker // Reflection of Kiki-Jiki"; both map to one key.
    """
    front = str(name).split(" // ")[0].split("/")[0].strip()
    decomposed = unicodedata.normalize("NFKD", front)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()


@dataclass(frozen=True)
class Deck:
    mainboard: Mapping[str, int]  # card key -> copies
    sideboard: frozenset[str]


@dataclass(frozen=True)
class Tournament:
    day: date
    decks: tuple[Deck, ...]


@dataclass(frozen=True)
class PlayRate:
    share: float  # percent of decks that contain the card (main deck or sideboard)
    average_copies: float | None  # main deck copies, averaged over decks that play it


@dataclass(frozen=True)
class PlaySummary:
    tournaments: int
    decks: int
    first_day: date | None
    last_day: date | None


def play_rates(tournaments: Iterable[Tournament]) -> tuple[dict[str, PlayRate], PlaySummary]:
    decks_with: dict[str, int] = {}
    main_decks_with: dict[str, int] = {}
    main_copies: dict[str, int] = {}
    days: list[date] = []
    total_decks = 0
    total_tournaments = 0

    for tournament in tournaments:
        counted = [deck for deck in tournament.decks if deck.mainboard]
        if not counted:
            continue
        total_tournaments += 1
        days.append(tournament.day)
        for deck in counted:
            total_decks += 1
            for key in set(deck.mainboard) | deck.sideboard:
                decks_with[key] = decks_with.get(key, 0) + 1
            for key, copies in deck.mainboard.items():
                main_decks_with[key] = main_decks_with.get(key, 0) + 1
                main_copies[key] = main_copies.get(key, 0) + copies

    rates = {
        key: PlayRate(
            share=round(count / total_decks * 100, 1),
            average_copies=(
                round(main_copies[key] / main_decks_with[key], 1)
                if main_decks_with.get(key)
                else None
            ),
        )
        for key, count in decks_with.items()
    }
    summary = PlaySummary(
        tournaments=total_tournaments,
        decks=total_decks,
        first_day=min(days, default=None),
        last_day=max(days, default=None),
    )
    return rates, summary
