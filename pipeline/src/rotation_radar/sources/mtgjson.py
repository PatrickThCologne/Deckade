"""MTGJSON (https://mtgjson.com): sealed products of every set, with Cardmarket and
TCGplayer product ids."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from rotation_radar.config import MTGJSON_SET_LIST
from rotation_radar.domain.products import SealedItem, SealedProduct
from rotation_radar.sources.http import HttpClient


def fetch_sealed_products(
    http: HttpClient, set_codes: Iterable[str]
) -> dict[str, tuple[SealedProduct, ...]]:
    wanted = {code.upper() for code in set_codes}
    payload = http.get_json(MTGJSON_SET_LIST)
    return {
        raw["code"].lower(): tuple(_parse_product(p) for p in raw.get("sealedProduct") or ())
        for raw in payload["data"]
        if raw.get("code") in wanted
    }


def _parse_product(raw: dict[str, Any]) -> SealedProduct:
    ids = raw.get("identifiers") or {}
    mcm_id = str(ids.get("mcmId") or "")
    contents = (raw.get("contents") or {}).get("sealed") or ()
    return SealedProduct(
        name=raw["name"],
        category=raw.get("category") or "",
        subtype=raw.get("subtype"),
        cardmarket_id=int(mcm_id) if mcm_id.isdigit() else None,
        tcgplayer_id=ids.get("tcgplayerProductId"),
        contents=tuple(
            SealedItem(name=item.get("name") or "", count=int(item.get("count") or 1))
            for item in contents
        ),
    )
