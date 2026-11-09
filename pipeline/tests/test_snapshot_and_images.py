from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import cast

from PIL import Image

from rotation_radar.domain.rotation import Certainty
from rotation_radar.images import PackImageStore, cut_out, pack_file_name, symbol_file_name
from rotation_radar.snapshot import to_json_value
from rotation_radar.sources.http import HttpClient


@dataclass(frozen=True)
class Example:
    released_at: date
    certainty: Certainty
    price_per_pack: float | None
    tags: frozenset[str]


def test_json_uses_camel_case_iso_dates_and_enum_values() -> None:
    value = to_json_value(Example(date(2026, 10, 2), Certainty.ESTIMATED, None, frozenset("ba")))
    assert value == {
        "releasedAt": "2026-10-02",
        "certainty": "estimated",
        "pricePerPack": None,
        "tags": ["a", "b"],
    }


def test_symbol_file_names_follow_scryfall() -> None:
    assert symbol_file_name("W/U") == "WU.svg"
    assert symbol_file_name("2") == "2.svg"


def test_cut_out_removes_white_background_and_keeps_the_pack() -> None:
    image = Image.new("RGB", (40, 60), (255, 255, 255))
    image.paste((200, 30, 30), (10, 10, 30, 50))  # a red "pack" in the middle
    image.paste((255, 255, 255), (18, 25, 22, 30))  # white print on the pack itself

    result = cut_out(image)

    assert result.mode == "RGBA"
    # Cropped to the 20x40 pack, minus the eroded one-pixel outline
    assert result.size == (18, 38)
    assert result.getpixel((9, 30)) == (200, 30, 30, 255)
    # White print on the pack is not connected to the border and stays opaque
    assert result.getpixel((9, 15)) == (255, 255, 255, 255)


def test_pack_file_names_contain_code_and_set_name() -> None:
    assert (
        pack_file_name("dsk", "Duskmourn: House of Horror") == "dsk-duskmourn-house-of-horror.webp"
    )
    assert pack_file_name("usg", "Urza's Saga") == "usg-urzas-saga.webp"
    assert pack_file_name("ltr", "The Lord of the Rings: Tales of Middle-earth") == (
        "ltr-the-lord-of-the-rings-tales-of-middle-earth.webp"
    )
    assert pack_file_name("x", "Révolte") == "x-revolte.webp"
    assert pack_file_name("x", "???") == "x.webp"


class NoDownloads:
    def get_bytes(self, url: str) -> bytes:
        raise AssertionError(f"unexpected download: {url}")


def test_pack_images_under_earlier_names_are_renamed_not_downloaded(tmp_path: Path) -> None:
    packs = tmp_path / "packs"
    packs.mkdir()
    (packs / "dsk.webp").write_bytes(b"old")
    (packs / "fdn-old-name.webp").write_bytes(b"older")
    (packs / "sources.json").write_text('{"dsk": "123", "fdn": "456"}')
    store = PackImageStore(cast(HttpClient, NoDownloads()), tmp_path)

    assert store.ensure("dsk", "Duskmourn: House of Horror", "123") == (
        "images/packs/dsk-duskmourn-house-of-horror.webp"
    )
    assert store.ensure("fdn", "Foundations", "456") == "images/packs/fdn-foundations.webp"
    assert sorted(path.name for path in packs.glob("*.webp")) == [
        "dsk-duskmourn-house-of-horror.webp",
        "fdn-foundations.webp",
    ]
    assert (packs / "dsk-duskmourn-house-of-horror.webp").read_bytes() == b"old"
