"""Cardmarket price guide: one public JSON file with trend prices for every Magic product,
regenerated daily. Products are matched by id, never by name."""

from __future__ import annotations

from datetime import date
from typing import Any

from rotation_radar.config import CARDMARKET_PRICE_GUIDE
from rotation_radar.domain.cards import Price
from rotation_radar.sources.http import HttpClient


def fetch_price_guide(http: HttpClient) -> tuple[dict[int, Price], date | None]:
    payload = http.get_json(CARDMARKET_PRICE_GUIDE)
    created = str(payload.get("createdAt") or "")[:10]
    prices = {int(raw["idProduct"]): _parse_price(raw) for raw in payload["priceGuides"]}
    return prices, date.fromisoformat(created) if created else None


def _parse_price(raw: dict[str, Any]) -> Price:
    return Price(
        trend=_positive(raw.get("trend")),
        trend_foil=_positive(raw.get("trend-foil")),
        average_sale=_positive(raw.get("avg")),
    )


def _positive(value: Any) -> float | None:
    return float(value) if isinstance(value, int | float) and value > 0 else None
