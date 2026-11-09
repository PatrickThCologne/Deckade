from __future__ import annotations

from datetime import date

from rotation_radar.domain.play import Deck, PlayRate, Tournament, play_rates


def deck(main: dict[str, int], side: tuple[str, ...] = ()) -> Deck:
    return Deck(mainboard=main, sideboard=frozenset(side))


def test_share_counts_decks_and_average_counts_main_deck_copies() -> None:
    tournaments = [
        Tournament(date(2026, 10, 20), (deck({"opt": 4}), deck({"opt": 2}, side=("duress",)))),
        Tournament(date(2026, 10, 27), (deck({"bolt": 4}, side=("opt",)), deck({"bolt": 3}))),
    ]
    rates, summary = play_rates(tournaments)

    assert rates["opt"] == PlayRate(share=75.0, average_copies=3.0)
    assert rates["duress"] == PlayRate(share=25.0, average_copies=None)
    assert summary.decks == 4
    assert summary.tournaments == 2
    assert (summary.first_day, summary.last_day) == (date(2026, 10, 20), date(2026, 10, 27))


def test_empty_decks_and_tournaments_are_ignored() -> None:
    rates, summary = play_rates([Tournament(date(2026, 10, 1), (deck({}),))])
    assert rates == {}
    assert summary.tournaments == 0
    assert summary.first_day is None
