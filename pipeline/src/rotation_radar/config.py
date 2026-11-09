"""Data source endpoints and file locations."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

USER_AGENT = "Deckade/0.1 (data pipeline of a Magic: The Gathering fan site)"

SCRYFALL_API = "https://api.scryfall.com"
MTGJSON_SET_LIST = "https://mtgjson.com/api/v5/SetList.json"
CARDMARKET_PRICE_GUIDE = (
    "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_1.json"
)
TCGPLAYER_PRODUCT_IMAGE = (
    "https://tcgplayer-cdn.tcgplayer.com/product/{product_id}_in_{size}x{size}.jpg"
)

GITHUB_API = "https://api.github.com"
GITHUB_RAW = "https://raw.githubusercontent.com"
DECKLIST_REPOSITORY = "Jiliac/MTGODecklistCache"
DECKLIST_BRANCH = "master"
DECKLIST_SOURCES = ("mtgo.com_limited_data", "melee.gg")

PLAY_RATE_WINDOW_DAYS = 30


@dataclass(frozen=True)
class Paths:
    """Where the pipeline reads its rules and writes its output."""

    rules_file: Path
    data_dir: Path
    image_dir: Path
    cache_dir: Path

    @classmethod
    def for_repository(cls, root: Path) -> Paths:
        return cls(
            rules_file=root / "pipeline" / "rules.toml",
            data_dir=root / "web" / "src" / "data" / "generated",
            image_dir=root / "web" / "public" / "images",
            cache_dir=root / "pipeline" / ".cache",
        )
