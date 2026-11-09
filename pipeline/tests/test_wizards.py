from __future__ import annotations

from typing import cast

import httpx

from rotation_radar.sources.http import HttpClient
from rotation_radar.sources.wizards import (
    find_pack_image,
    image_urls,
    product_slug,
    single_booster_image,
)

HOST = "https://images.ctfassets.net/0piqveu8x9oj/a1/b2/"


def urls(*file_names: str) -> list[str]:
    return [HOST + name for name in file_names]


def test_slugs_follow_the_product_pages() -> None:
    assert product_slug("Marvel's Spider-Man") == "marvels-spider-man"
    assert product_slug("Commander Legends: Battle for Baldur's Gate") == (
        "commander-legends-battle-for-baldurs-gate"
    )
    assert product_slug("Phyrexia: All Will Be One") == "phyrexia-all-will-be-one"


def test_the_play_booster_wins_over_collector_boosters_and_boxes() -> None:
    page = urls(
        "MTGBLB_EN_BstrDspBx_Play_01_01.png",
        "MTGBLB_EN_Bstr_Clctr_01_01.png",
        "MTGBLB_EN_Bstr_Play_01_01.png",
        "MTGBLB_EN_Bndl_01_01.png",
    )
    assert single_booster_image(page) == HOST + "MTGBLB_EN_Bstr_Play_01_01.png"


def test_set_boosters_come_before_draft_boosters() -> None:
    page = urls("MTGSTX_EN_Bstr_Drft_04_02.png", "MTGSTX_EN_Bstr_Set_04_02.png")
    assert single_booster_image(page) == HOST + "MTGSTX_EN_Bstr_Set_04_02.png"


def test_the_many_naming_schemes_are_recognised() -> None:
    assert single_booster_image(urls("MTGZNR_EN_DrftBstr_01_02_1600279777.jpg")) is not None
    assert single_booster_image(urls("tarkir-dragonstorm-play-booster-product-image-0-en.png"))
    assert single_booster_image(urls("MTGELD_EN_Bstr_01_02_1569864833.jpg")) is not None
    # Assassin's Creed: the Beyond Booster is the pack sold in stores
    assert single_booster_image(
        urls("MTGACR_EN_ClctrBstr_01_01.png", "MTGACR_EN_ByndBstr_01_01.png")
    ) == (HOST + "MTGACR_EN_ByndBstr_01_01.png")
    assert single_booster_image(
        urls("img_mdd_collector-booster.webp", "img_mdd_booster-pack.webp")
    ) == (HOST + "img_mdd_booster-pack.webp")


def test_pages_with_only_boxes_bundles_or_infographics_have_no_pack_image() -> None:
    page = urls(
        "MTGTSR_EN_BstrDspBx_01_01.png",
        "MTGFIN_EN_BstrBrkdwn_01_01.png",
        "MTGDSK_EN_Bndl_Bstr_01_01.png",
        "MTGDSK_EN_PrrlsKit_Bstr_01_01.png",
        "MTGDSK_EN_Bstr_Play_thumb.png",
    )
    assert single_booster_image(page) is None


def test_image_urls_are_absolute_and_unescaped() -> None:
    page = (
        '<img src="//images.ctfassets.net/s/1/2/MTGBLB_EN_Bstr_Play_01_01.png?w=300">'
        '"url":"\\u002F\\u002Fimages.ctfassets.net\\u002Fs\\u002F3\\u002F4\\u002FMTGBLB.jpg"'
    )
    assert image_urls(page) == [
        "https://images.ctfassets.net/s/1/2/MTGBLB_EN_Bstr_Play_01_01.png",
        "https://images.ctfassets.net/s/3/4/MTGBLB.jpg",
    ]


class FakePages:
    """Answers with a page per slug; every other URL is a 404."""

    def __init__(self, pages: dict[str, str], error: Exception | None = None) -> None:
        self.pages = pages
        self.error = error
        self.requested: list[str] = []

    def get_bytes(self, url: str) -> bytes:
        self.requested.append(url)
        if self.error:
            raise self.error
        slug = url.rsplit("/", 1)[-1]
        if slug not in self.pages:
            request = httpx.Request("GET", url)
            raise httpx.HTTPStatusError("404", request=request, response=httpx.Response(404))
        return self.pages[slug].encode()


def test_a_missing_page_is_retried_with_the_magic_prefix() -> None:
    page = '<img src="//images.ctfassets.net/s/1/2/fdn-play-booster-product-image-0-en.png">'
    http = FakePages({"magic-the-gathering-foundations": page})

    url = find_pack_image(cast(HttpClient, http), "Foundations")

    assert url == "https://images.ctfassets.net/s/1/2/fdn-play-booster-product-image-0-en.png"
    assert [u.rsplit("/", 1)[-1] for u in http.requested] == [
        "foundations",
        "magic-the-gathering-foundations",
    ]


def test_no_page_or_a_network_error_means_no_official_image() -> None:
    assert find_pack_image(cast(HttpClient, FakePages({})), "Alpha") is None
    broken = FakePages({}, error=httpx.ConnectError("offline"))
    assert find_pack_image(cast(HttpClient, broken), "Bloomburrow") is None
    assert len(broken.requested) == 1
