"""The data contract with the website, tested from both sides.

A small snapshot with every optional field filled once and empty once is written by the
real writer and compared with the files in ``web/tests/contract``. The website parses the
same files with its Zod schemas (``web/tests/contract.test.ts``). A change on one side
that the other does not follow fails one of the two tests.

After an intended change of the contract:

    UPDATE_CONTRACT=1 pytest tests/test_contract.py

then check the diff of ``web/tests/contract`` and run the website tests.
"""

from __future__ import annotations

import os
import shutil
from datetime import UTC, date, datetime
from pathlib import Path

from rotation_radar.domain.art import FeaturedArt
from rotation_radar.domain.cards import CardRow, Translation
from rotation_radar.domain.products import PackCount, PackKind
from rotation_radar.domain.rotation import Certainty, RotationEstimate, SetRotation
from rotation_radar.domain.sets import SetStatus
from rotation_radar.snapshot import (
    RULE_SOURCE,
    SCHEMA_VERSION,
    BannedCard,
    FormatEntry,
    ProductEntry,
    RuleSummary,
    SetEntry,
    Snapshot,
    SourceInfo,
    StandardInfo,
    write_snapshot,
)

FIXTURE = Path(__file__).resolve().parents[2] / "web" / "tests" / "contract"
SCRYFALL = "https://scryfall.com/card"
IMAGES = "https://cards.scryfall.io"


def contract_snapshot() -> tuple[Snapshot, dict[str, list[CardRow]]]:
    current = SetEntry(
        code="dsk",
        name="Duskmourn: House of Horror",
        released_at=date(2024, 9, 27),
        set_type="expansion",
        parent_code=None,
        card_count=2,
        icon_url="https://svgs.scryfall.io/sets/dsk.svg",
        pack_image="images/packs/dsk-duskmourn-house-of-horror.webp",
        formats=("standard", "pioneer", "modern", "commander"),
        standard=StandardInfo(
            status=SetStatus.LEGAL,
            rotation=SetRotation(wave=0, earliest=date(2027, 1, 1), certain=False),
        ),
        products=(
            ProductEntry(
                name="Duskmourn Play Booster Box",
                category="booster_box",
                subtype="play",
                contents=(PackCount(30, PackKind.PLAY),),
                price=129.9,
                average_sale=124.5,
                price_per_pack=4.33,
            ),
            ProductEntry(
                name="Duskmourn Bundle",
                category="bundle",
                subtype=None,
                contents=(PackCount(9, PackKind.PLAY), PackCount(1, PackKind.COLLECTOR)),
                price=None,
                average_sale=None,
                price_per_pack=None,
            ),
        ),
    )
    upcoming = SetEntry(
        code="zzz",
        name="Announced Set",
        released_at=date(2027, 2, 5),
        set_type="expansion",
        parent_code=None,
        card_count=0,
        icon_url=None,
        pack_image=None,
        formats=(),
        standard=StandardInfo(
            status=SetStatus.UPCOMING,
            rotation=SetRotation(wave=None, earliest=None, certain=True, legal_until_at_least=2029),
        ),
        products=(),
    )
    old = SetEntry(
        code="tsb",
        name="Time Spiral Timeshifted",
        released_at=date(2006, 10, 6),
        set_type="masterpiece",
        parent_code="tsp",
        card_count=0,
        icon_url="https://svgs.scryfall.io/sets/tsb.svg",
        pack_image=None,
        formats=("modern", "commander"),
        standard=None,
        products=(),
    )
    snapshot = Snapshot(
        schema_version=SCHEMA_VERSION,
        generated_at=datetime(2026, 11, 9, 4, 30, tzinfo=UTC),
        rotation=RotationEstimate(
            day=date(2027, 1, 22), certainty=Certainty.ESTIMATED, trigger_set="zzz"
        ),
        rules=RuleSummary(
            rotating_set_count=4,
            source_url=RULE_SOURCE,
            special_rule_sources={"fdn": "https://magic.wizards.com/en/news/announcements"},
        ),
        sources=SourceInfo(
            play_rate_from=date(2026, 10, 10),
            play_rate_to=date(2026, 11, 8),
            play_rate_decks=2586,
            play_rate_tournaments=55,
        ),
        sets=(upcoming, current, old),
        formats=(
            FormatEntry(
                id="standard",
                name="Standard",
                rotates=True,
                info_url=RULE_SOURCE,
                banlist_url="https://magic.wizards.com/en/banned-restricted-list",
                banned=(
                    BannedCard(
                        name="Banned Card",
                        colors="UB",
                        mana_cost="{U}{B}",
                        image_normal=f"{IMAGES}/normal/front/a/b/ab.jpg",
                        scryfall_url=f"{SCRYFALL}/dsk/1",
                    ),
                ),
            ),
            FormatEntry(
                id="pioneer",
                name="Pioneer",
                rotates=False,
                info_url="https://magic.wizards.com/en/formats/pioneer",
                banlist_url="https://magic.wizards.com/en/banned-restricted-list",
                banned=(),
            ),
        ),
        featured_art=(
            FeaturedArt(
                card_name="Valgavoth, Terror Eater",
                set_code="dsk",
                set_name="Duskmourn: House of Horror",
                artist="Someone",
                image_url=f"{IMAGES}/art_crop/front/c/d/cd.jpg",
                hue=17,
            ),
            FeaturedArt(
                card_name="Grey Ghost",
                set_code="dsk",
                set_name="Duskmourn: House of Horror",
                artist="Someone Else",
                image_url=f"{IMAGES}/art_crop/front/g/h/gh.jpg",
                hue=None,
            ),
        ),
    )
    cards = {
        "dsk": [
            CardRow(
                oracle_id="o1",
                name="Translated Creature",
                colors="G",
                mana_cost="{2}{G}",
                cmc=3.0,
                type_line="Creature — Spider",
                text="Reach",
                rarity="rare",
                is_land=False,
                banned=False,
                image_small=f"{IMAGES}/small/front/e/f/ef.jpg",
                image_normal=f"{IMAGES}/normal/front/e/f/ef.jpg",
                scryfall_url=f"{SCRYFALL}/dsk/2",
                price=1.25,
                play_share=0.12,
                average_copies=3.5,
                de=Translation(
                    name="Übersetzte Kreatur",
                    text="Reichweite",
                    image_small=None,
                    image_normal=f"{IMAGES}/normal/front/e/f/ef-de.jpg",
                    scryfall_url=f"{SCRYFALL}/dsk/2/de",
                ),
            ),
            CardRow(
                oracle_id="o2",
                name="Plain Land",
                colors="",
                mana_cost="",
                cmc=0.0,
                type_line="Land",
                text="",
                rarity="common",
                is_land=True,
                banned=True,
                image_small=None,
                image_normal=None,
                scryfall_url=f"{SCRYFALL}/dsk/3",
                price=None,
                play_share=None,
                average_copies=None,
            ),
        ],
        "zzz": [],
        "tsb": [],
    }
    return snapshot, cards


def files(root: Path) -> dict[str, str]:
    return {p.relative_to(root).as_posix(): p.read_text("utf-8") for p in root.rglob("*.json")}


def test_the_website_fixture_is_what_the_pipeline_writes(tmp_path: Path) -> None:
    snapshot, cards = contract_snapshot()
    write_snapshot(snapshot, cards, tmp_path)
    if os.environ.get("UPDATE_CONTRACT"):
        shutil.rmtree(FIXTURE, ignore_errors=True)
        shutil.copytree(tmp_path, FIXTURE)

    assert files(tmp_path) == files(FIXTURE), (
        "The data contract changed. If intended: UPDATE_CONTRACT=1 pytest tests/test_contract.py,"
        " check the diff of web/tests/contract and run the website tests."
    )


def test_every_optional_field_is_filled_once_and_empty_once() -> None:
    snapshot, cards = contract_snapshot()
    sets = snapshot.sets
    rows = cards["dsk"]
    for values in (
        [s.pack_image for s in sets],
        [s.icon_url for s in sets],
        [s.standard for s in sets],
        [s.parent_code for s in sets],
        [p.price for s in sets for p in s.products],
        [r.de for r in rows],
        [r.price for r in rows],
        [r.image_normal for r in rows],
    ):
        assert None in values and any(v is not None for v in values)
