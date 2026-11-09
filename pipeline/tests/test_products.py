from __future__ import annotations

import pytest

from rotation_radar.domain.products import (
    PackCount,
    PackKind,
    Product,
    ProductCategory,
    SealedItem,
    SealedProduct,
    choose_pack_art,
    classify_pack,
    parse_contents,
)


@pytest.mark.parametrize(
    ("name", "count", "kind"),
    [
        ("Aetherdrift Play Booster Pack", 30, PackKind.PLAY),
        ("Wilds of Eldraine Set Booster Pack", 8, PackKind.SET),
        ("The Lost Caverns of Ixalan Draft Booster Pack", 36, PackKind.DRAFT),
        ("Marvel Super Heroes Jumpstart Booster Pack", 24, PackKind.JUMPSTART),
        ("Final Fantasy Collector Booster Pack", 12, PackKind.COLLECTOR),
        ("The Hobbit Box Topper Pack", 1, PackKind.TOPPER),
        ("Marvel Darkhold Destiny Booster Pack", 30, PackKind.BOOSTER),
        ("Final Fantasy Chocobo Booster Pack", 1, PackKind.BONUS),
    ],
)
def test_classify_pack(name: str, count: int, kind: PackKind) -> None:
    assert classify_pack(name, count) is kind


def test_contents_list_extras_last() -> None:
    contents = parse_contents(
        [SealedItem("Hobbit Box Topper Pack", 1), SealedItem("Hobbit Play Booster Pack", 30)]
    )
    assert contents == (PackCount(30, PackKind.PLAY), PackCount(1, PackKind.TOPPER))


def product(price: float | None, *contents: PackCount) -> Product:
    return Product(
        name="Test",
        category=ProductCategory.BOOSTER_BOX,
        subtype="play",
        contents=contents,
        cardmarket_id=1,
        price=price,
        average_sale=None,
    )


class TestPricePerPack:
    def test_single_booster_type(self) -> None:
        assert product(120.0, PackCount(30, PackKind.PLAY)).price_per_pack == 4.0

    def test_box_toppers_do_not_count(self) -> None:
        box = product(93.0, PackCount(30, PackKind.PLAY), PackCount(1, PackKind.TOPPER))
        assert box.price_per_pack == 3.1

    def test_mixed_booster_types_have_no_meaningful_average(self) -> None:
        bundle = product(90.0, PackCount(8, PackKind.PLAY), PackCount(1, PackKind.COLLECTOR))
        assert bundle.price_per_pack is None

    def test_unknown_price(self) -> None:
        assert product(None, PackCount(30, PackKind.PLAY)).price_per_pack is None


def test_pack_art_prefers_the_play_booster() -> None:
    def pack(subtype: str) -> SealedProduct:
        return SealedProduct(f"{subtype} pack", "booster_pack", subtype, None, "123")

    products = [pack("collector"), pack("play"), pack("draft")]
    chosen = choose_pack_art(products)
    assert chosen is not None
    assert chosen.subtype == "play"


def test_pack_art_needs_an_image_id() -> None:
    assert choose_pack_art([SealedProduct("pack", "booster_pack", "play", None, None)]) is None
