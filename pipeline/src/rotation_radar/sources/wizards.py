"""Wizards Play Network product pages (https://wpn.wizards.com/en/products): the official
product images of every set since Throne of Eldraine (2019).

The page of a set is found by its name ("Bloomburrow" -> /products/bloomburrow); a few use the
prefix "magic-the-gathering-" (Foundations, Assassin's Creed). Images are on Contentful and
named by Wizards' internal scheme, e.g. MTGBLB_EN_Bstr_Play_01_01.png,
MTGZNR_EN_DrftBstr_01_02_1600279777.jpg or tarkir-dragonstorm-play-booster-product-image-0-en.png
(observed 2026-11-09). Display boxes, bundles and infographics sit on the same page.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from collections.abc import Iterable

import httpx

from rotation_radar.config import WIZARDS_IMAGE_HOST, WIZARDS_PRODUCT_PAGE
from rotation_radar.sources.http import HttpClient

log = logging.getLogger(__name__)

REQUEST_INTERVAL = 1.0  # seconds between page requests; no published limit, so stay gentle
SLUG_PREFIX = "magic-the-gathering-"

# Protocol-relative in the page source, partly with JSON-escaped slashes (/)
IMAGE_URL = re.compile(
    r"(?:https:)?//images\.ctfassets\.net/[^\"'\s)?&,]+\.(?:png|jpe?g|webp)", re.IGNORECASE
)
NOT_A_SINGLE_PACK = re.compile(
    r"dsp|display|box|bx|bndl|bundle|cmndr|deck|kit|case|gift|prerelease|prrls|slv|sleeve"
    r"|brkdwn|breakdown|jumpstart|thumb|family",
    re.IGNORECASE,
)
# The pack you would buy in a store first
PACK_PREFERENCE = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"bstr_?play|play_?bstr|play-booster",
        r"set_?bstr|bstr_?set|set-booster",
        r"drft_?bstr|bstr_?drft|draft-booster",
        r"bynd_?bstr|beyond-booster",
        r"booster-pack",
        r"(?<![a-z])bstr",  # the plain booster of sets before Play/Set/Draft boosters
        r"clctr|collector-booster",
    )
)


def product_slug(set_name: str) -> str:
    """'Marvel's Spider-Man' -> 'marvels-spider-man'."""
    decomposed = unicodedata.normalize("NFKD", set_name)
    plain = "".join(c for c in decomposed if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", "-", plain.replace("'", "")).strip("-")


def image_urls(page: str) -> list[str]:
    """Every Contentful image on a product page, as absolute https URLs, sorted."""
    found = IMAGE_URL.findall(re.sub(r"\\+u002F", "/", page))
    return sorted({f"https:{url}" if url.startswith("//") else url for url in found})


def single_booster_image(urls: Iterable[str]) -> str | None:
    """The image of one booster pack; None if the page only shows boxes or bundles."""

    def file_name(url: str) -> str:
        return url.rsplit("/", 1)[-1]

    singles = [
        url
        for url in urls
        if re.search(r"bstr|booster", file_name(url), re.IGNORECASE)
        and not NOT_A_SINGLE_PACK.search(file_name(url))
    ]
    for pattern in PACK_PREFERENCE:
        hits = sorted(url for url in singles if pattern.search(file_name(url)))
        if hits:
            return hits[0]
    return None


def find_pack_image(http: HttpClient, set_name: str) -> str | None:
    """URL of the official single booster image of a set, or None.

    A missing page or a network error only means no official image: the caller falls back.
    """
    slug = product_slug(set_name)
    for candidate in (slug, SLUG_PREFIX + slug):
        try:
            page = http.get_bytes(WIZARDS_PRODUCT_PAGE.format(slug=candidate))
        except httpx.HTTPStatusError as error:
            if error.response.status_code == httpx.codes.NOT_FOUND:
                continue
            log.warning("No product page for %s: %s", set_name, error)
            return None
        except httpx.HTTPError as error:
            log.warning("No product page for %s: %s", set_name, error)
            return None
        url = single_booster_image(image_urls(page.decode("utf-8", errors="replace")))
        return url if url and url.startswith(WIZARDS_IMAGE_HOST) else None
    return None
