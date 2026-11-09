from __future__ import annotations

import io
import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import cast

from PIL import Image, ImageDraw

from rotation_radar.domain.rotation import Certainty
from rotation_radar.images import (
    PackImageStore,
    art_hues,
    cut_out,
    make_upright,
    pack_file_name,
    prepare_pack,
    symbol_file_name,
)
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


def test_transparent_official_images_are_only_cropped() -> None:
    image = Image.new("RGBA", (40, 60), (0, 0, 0, 0))
    image.paste((200, 30, 30, 255), (10, 10, 30, 50))

    result = prepare_pack(image, frame=4)

    # No cut-out and no eroded outline: exactly the 20x40 pack
    assert result.size == (20, 40)
    assert result.getpixel((0, 0)) == (200, 30, 30, 255)


def test_the_grey_frame_of_older_official_photos_is_cut_off_first() -> None:
    photo = Image.new("RGB", (40, 60), (150, 150, 150))  # grey frame ...
    photo.paste((255, 255, 255), (4, 4, 36, 56))  # ... around the white background
    photo.paste((200, 30, 30), (10, 10, 30, 50))

    assert prepare_pack(photo, frame=4).size == (18, 38)
    # Without cutting it off, the frame stops the flood fill: the whole photo stays
    assert prepare_pack(photo).size == (40, 60)


def turned_pack() -> Image.Image:
    """A 100x200 pack seen slightly from the left: the right edge is further away."""
    image = Image.new("RGBA", (130, 230), (0, 0, 0, 0))
    ImageDraw.Draw(image).polygon(
        [(10, 10), (110, 22), (110, 208), (10, 220)], fill=(200, 30, 30, 255)
    )
    return image


def test_a_turned_pack_is_made_to_face_the_viewer() -> None:
    image = turned_pack()
    # Before: the bounding box corners on the far side are empty
    box = image.getchannel("A").getbbox()
    assert box is not None
    assert image.getpixel((box[2] - 3, box[1] + 2))[3] == 0  # type: ignore[index]

    result = make_upright(image)

    width, height = result.size
    assert 95 <= width <= 106 and 196 <= height <= 206
    # Every corner is filled, a few pixels inside the soft, anti-aliased edge
    for x, y in ((5, 5), (width - 6, 5), (width - 6, height - 6), (5, height - 6)):
        assert result.getpixel((x, y))[3] == 255  # type: ignore[index]


def test_a_pack_that_faces_the_viewer_is_left_alone() -> None:
    image = Image.new("RGBA", (40, 60), (0, 0, 0, 0))
    image.paste((200, 30, 30, 255), (5, 5, 35, 55))

    assert make_upright(image) is image
    assert make_upright(make_upright(turned_pack())).size == make_upright(turned_pack()).size


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


class FakeArt:
    """Serves a plain-coloured PNG per URL; unknown URLs fail like a broken download."""

    def __init__(self, colours: dict[str, tuple[int, int, int]]) -> None:
        self.colours = colours
        self.requested: list[str] = []

    def get_bytes(self, url: str) -> bytes:
        self.requested.append(url)
        if url not in self.colours:
            raise OSError("connection lost")
        buffer = io.BytesIO()
        Image.new("RGB", (60, 40), self.colours[url]).save(buffer, "PNG")
        return buffer.getvalue()


def test_art_hues_are_read_once_and_kept_in_the_cache(tmp_path: Path) -> None:
    cache = tmp_path / "art-hues.json"
    http = FakeArt({"https://img/blue.jpg": (0, 0, 255), "https://img/grey.jpg": (90, 90, 90)})

    first = art_hues(
        cast(HttpClient, http), ["https://img/blue.jpg", "https://img/grey.jpg"], cache
    )
    again = art_hues(cast(HttpClient, NoDownloads()), ["https://img/blue.jpg"], cache)

    assert first == {"https://img/blue.jpg": 240, "https://img/grey.jpg": None}
    assert again == {"https://img/blue.jpg": 240}
    assert http.requested == ["https://img/blue.jpg", "https://img/grey.jpg"]
    # Only artwork still in use stays in the cache
    assert json.loads(cache.read_text(encoding="utf-8")) == {"https://img/blue.jpg": 240}


def test_an_artwork_that_cannot_be_read_gets_no_colour_and_is_tried_again(
    tmp_path: Path,
) -> None:
    cache = tmp_path / "art-hues.json"

    hues = art_hues(cast(HttpClient, FakeArt({})), ["https://img/missing.jpg"], cache)

    assert hues == {"https://img/missing.jpg": None}
    assert json.loads(cache.read_text(encoding="utf-8")) == {}


def test_pack_images_under_earlier_names_are_renamed_not_downloaded(tmp_path: Path) -> None:
    packs = tmp_path / "packs"
    packs.mkdir()
    (packs / "dsk.webp").write_bytes(b"old")
    (packs / "fdn-old-name.webp").write_bytes(b"older")
    dsk, fdn = (
        "https://images.ctfassets.net/s/1/2/MTGDSK.png",
        "https://images.ctfassets.net/s/1/2/MTGFDN.png",
    )
    (packs / "sources.json").write_text(f'{{"dsk": "{dsk}", "fdn": "{fdn}"}}')
    store = PackImageStore(cast(HttpClient, NoDownloads()), tmp_path)

    assert store.ensure_official("dsk", "Duskmourn: House of Horror", dsk) == (
        "images/packs/dsk-duskmourn-house-of-horror.webp"
    )
    assert store.ensure_official("fdn", "Foundations", fdn) == ("images/packs/fdn-foundations.webp")
    assert sorted(path.name for path in packs.glob("*.webp")) == [
        "dsk-duskmourn-house-of-horror.webp",
        "fdn-foundations.webp",
    ]
    assert (packs / "dsk-duskmourn-house-of-horror.webp").read_bytes() == b"old"


def test_official_images_from_an_earlier_build_are_kept_without_a_lookup(tmp_path: Path) -> None:
    packs = tmp_path / "packs"
    packs.mkdir()
    official = "https://images.ctfassets.net/s/1/2/MTGDSK_EN_Bstr_Play_01_03.png"
    (packs / "dsk-duskmourn-house-of-horror.webp").write_bytes(b"official")
    (packs / "fdn-foundations.webp").write_bytes(b"tcgplayer")
    (packs / "sources.json").write_text(f'{{"dsk": "{official}", "fdn": "456"}}')
    store = PackImageStore(cast(HttpClient, NoDownloads()), tmp_path)

    expected = "images/packs/dsk-duskmourn-house-of-horror.webp"
    assert store.official("dsk", "Duskmourn: House of Horror") == expected
    assert store.ensure_official("dsk", "Duskmourn: House of Horror", official) == expected
    # A TCGplayer photo is no reason to skip the lookup
    assert store.official("fdn", "Foundations") is None
    assert store.official("blb", "Bloomburrow") is None


def test_images_no_set_uses_any_more_are_removed(tmp_path: Path) -> None:
    packs = tmp_path / "packs"
    packs.mkdir()
    for name in ("dsk-duskmourn-house-of-horror.webp", "lea-limited-edition-alpha.webp"):
        (packs / name).write_bytes(b"image")
    (packs / "sources.json").write_text('{"dsk": "https://images.ctfassets.net/x", "lea": "1"}')
    store = PackImageStore(cast(HttpClient, NoDownloads()), tmp_path)

    store.remove_unused(["images/packs/dsk-duskmourn-house-of-horror.webp"])

    assert [path.name for path in packs.glob("*.webp")] == ["dsk-duskmourn-house-of-horror.webp"]
    assert json.loads((packs / "sources.json").read_text()) == {
        "dsk": "https://images.ctfassets.net/x"
    }
