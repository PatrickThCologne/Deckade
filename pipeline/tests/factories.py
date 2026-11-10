"""Small builders that keep the tests readable."""

from __future__ import annotations

from datetime import date

from rotation_radar.domain.cards import Printing
from rotation_radar.domain.sets import MtgSet


def mtg_set(
    code: str,
    released: str,
    *,
    set_type: str = "expansion",
    parent: str | None = None,
    digital: bool = False,
) -> MtgSet:
    return MtgSet(
        code=code,
        name=code.upper(),
        released_at=date.fromisoformat(released),
        set_type=set_type,
        parent_code=parent,
        digital=digital,
    )


def printing(
    name: str,
    *,
    set_code: str = "aaa",
    oracle_id: str | None = None,
    number: str = "1",
    cardmarket_id: int | None = None,
    finishes: tuple[str, ...] = ("nonfoil", "foil"),
    standard: str = "legal",
    legalities: dict[str, str] | None = None,
    type_line: str = "Creature — Human",
    variant: bool = False,
    eur: float | None = None,
    eur_foil: float | None = None,
) -> Printing:
    return Printing(
        scryfall_id=f"{set_code}-{number}",
        oracle_id=oracle_id or name,
        name=name,
        set_code=set_code,
        collector_number=number,
        rarity="common",
        finishes=frozenset(finishes),
        cardmarket_id=cardmarket_id,
        legalities=legalities or {"standard": standard},
        color_identity="U",
        cmc=2.0,
        mana_cost="{1}{U}",
        type_line=type_line,
        image_small=None,
        image_normal=None,
        scryfall_url=f"https://scryfall.com/card/{set_code}/{number}",
        is_variant=variant,
        price_eur=eur,
        price_eur_foil=eur_foil,
    )
