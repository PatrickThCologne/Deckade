"""Builds the snapshot: fetch -> apply the rules -> enrich -> write.

1. Sources: Scryfall sets, every printing from the Scryfall bulk file, the Cardmarket
   price guide and recent Standard decklists.
2. Rules: Standard status and rotation; which sets are legal in Pioneer, Modern and
   Commander (from the card legalities in the bulk file).
3. Enrichment for every set that is legal anywhere: card rows, products, pack images
   (official images from Wizards where a product page has one; the website shows the set
   symbol for the others).
"""

from __future__ import annotations

import logging
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from rotation_radar.config import (
    OFFICIAL_PACK_IMAGES_SINCE,
    PLAY_RATE_WINDOW_DAYS,
    USER_AGENT,
    Paths,
)
from rotation_radar.domain.art import featured_art
from rotation_radar.domain.cards import (
    COLOR_ORDER,
    CardRow,
    Price,
    Printing,
    build_set_cards,
    count_legality,
    mana_symbols,
)
from rotation_radar.domain.formats import FormatRule, format_candidates, legal_sets
from rotation_radar.domain.play import PlayRate, PlaySummary, play_rates
from rotation_radar.domain.products import (
    Product,
    ProductCategory,
    SealedProduct,
    parse_contents,
)
from rotation_radar.domain.rotation import (
    RotationEstimate,
    SetRotation,
    assign_rotation,
    classify,
    estimate_next_rotation,
    standard_candidates,
)
from rotation_radar.domain.sets import MtgSet, SetStatus
from rotation_radar.images import PackImageStore, store_symbols
from rotation_radar.rules import RotationRules
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
from rotation_radar.sources.cardmarket import fetch_price_guide
from rotation_radar.sources.decklists import DecklistArchive
from rotation_radar.sources.http import HttpClient
from rotation_radar.sources.mtgjson import fetch_sealed_products
from rotation_radar.sources.scryfall import REQUEST_INTERVAL, ScryfallClient
from rotation_radar.sources.scryfall_bulk import BulkCards
from rotation_radar.sources.wizards import REQUEST_INTERVAL as WIZARDS_INTERVAL
from rotation_radar.sources.wizards import find_pack_image

log = logging.getLogger(__name__)

PRODUCT_CATEGORIES = frozenset(c.value for c in ProductCategory)
FEATURED_SET_COUNT = 16
FEATURED_PER_SET = 2
STANDARD_BANLIST = "https://magic.wizards.com/en/banned-restricted-list#standard-banned"


@dataclass(frozen=True)
class BuildOptions:
    today: date
    github_token: str | None = None


@dataclass(frozen=True)
class StandardResult:
    sets: list[MtgSet]  # in Standard or upcoming
    statuses: dict[str, SetStatus]
    rotation: dict[str, SetRotation]
    estimate: RotationEstimate


def build(
    paths: Paths,
    rules: RotationRules,
    formats: Sequence[FormatRule],
    options: BuildOptions,
) -> Snapshot:
    today = options.today
    with (
        HttpClient(
            user_agent=USER_AGENT,
            min_interval=REQUEST_INTERVAL,
            headers={"Accept": "application/json"},
        ) as scryfall_http,
        HttpClient(user_agent=USER_AGENT) as http,
        HttpClient(user_agent=USER_AGENT, min_interval=WIZARDS_INTERVAL) as wizards_http,
    ):
        scryfall = ScryfallClient(scryfall_http)
        all_sets = scryfall.sets()
        standard_pool = standard_candidates(all_sets, today, rules)
        format_pools = {rule.id: format_candidates(all_sets, rule, today) for rule in formats}
        candidate_codes = {s.code for s in standard_pool} | {
            s.code for pool in format_pools.values() for s in pool
        }

        log.info("Printings of %d candidate sets from the Scryfall bulk file", len(candidate_codes))
        bulk = BulkCards(scryfall_http, paths.cache_dir / "scryfall")
        printings = bulk.printings(candidate_codes)
        log.info("%d printings", len(printings))

        standard = _standard(all_sets, standard_pool, printings, rules, today)
        legal_by_format = {
            rule.id: {s.code for s in _legal(rule, format_pools[rule.id], printings, rules)}
            for rule in formats
        }
        catalog = _catalog(all_sets, standard, legal_by_format, rules.hidden_sets)
        catalog_codes = {s.code for s in catalog}

        prices, price_date = fetch_price_guide(http)
        rates, play_summary = _play_rates(http, paths, options)
        log.info("German printings from the Scryfall bulk file with all languages")
        german = bulk.translations(catalog_codes, "de")
        log.info("%d cards with a German printing", len(german))
        cards_by_set = build_set_cards(
            [p for p in printings if p.set_code in catalog_codes], prices, rates, german
        )

        log.info("Banned lists, products and pack images")
        format_entries = (
            _format_entry("standard", "Standard", True, RULE_SOURCE, STANDARD_BANLIST, scryfall),
            *(
                _format_entry(r.id, r.name, False, r.info_url, r.banlist_url, scryfall)
                for r in formats
            ),
        )
        sealed = fetch_sealed_products(http, catalog_codes)
        packs = PackImageStore(http, paths.image_dir)
        pack_images = {s.code: _pack_image(s, packs, wizards_http) for s in catalog}
        packs.remove_unused(path for path in pack_images.values() if path)
        store_symbols(
            scryfall_http,
            scryfall.symbol_svgs(),
            _used_symbols(cards_by_set, format_entries),
            paths.image_dir,
        )

    snapshot = Snapshot(
        schema_version=SCHEMA_VERSION,
        generated_at=datetime.now(UTC),
        rotation=standard.estimate,
        rules=RuleSummary(
            rotating_set_count=rules.rotating_set_count,
            source_url=RULE_SOURCE,
            special_rule_sources={code: r.source for code, r in rules.special_rules.items()},
        ),
        sources=_source_info(price_date, play_summary),
        sets=tuple(
            _set_entry(
                s,
                _formats_of(s.code, standard, legal_by_format),
                standard,
                cards_by_set.get(s.code, ()),
                sealed.get(s.code, ()),
                prices,
                pack_images.get(s.code),
            )
            for s in catalog
        ),
        formats=format_entries,
        featured_art=featured_art(
            _recent_main_sets(standard, today), printings, prices, FEATURED_PER_SET
        ),
    )
    write_snapshot(
        snapshot, {code: cards_by_set.get(code, []) for code in catalog_codes}, paths.data_dir
    )
    log.info("Snapshot with %d sets written to %s", len(catalog), paths.data_dir)
    return snapshot


def _standard(
    all_sets: Sequence[MtgSet],
    pool: Sequence[MtgSet],
    printings: Sequence[Printing],
    rules: RotationRules,
    today: date,
) -> StandardResult:
    statuses = classify(pool, count_legality(printings, "standard"), today, rules)
    tracked = [s for s in pool if statuses[s.code] is not SetStatus.NOT_LEGAL]
    estimate = estimate_next_rotation(all_sets, today, rules)
    log.info("Standard: %d sets, next rotation %s", len(tracked), estimate.day)
    return StandardResult(
        sets=tracked,
        statuses=statuses,
        rotation=assign_rotation(tracked, statuses, estimate, rules),
        estimate=estimate,
    )


def _recent_main_sets(standard: StandardResult, today: date) -> list[MtgSet]:
    """The newest released Standard sets, newest first -- their art goes into the background."""
    codes = {s.code for s in standard.sets}
    released = [s for s in standard.sets if s.released_at <= today and s.parent_code not in codes]
    return sorted(released, key=lambda s: s.released_at, reverse=True)[:FEATURED_SET_COUNT]


def _legal(
    rule: FormatRule, pool: Sequence[MtgSet], printings: Sequence[Printing], rules: RotationRules
) -> list[MtgSet]:
    legal = legal_sets(pool, count_legality(printings, rule.id), rules.legal_share_threshold)
    log.info("%s: %d legal sets of %d candidates", rule.name, len(legal), len(pool))
    return legal


def _catalog(
    all_sets: Sequence[MtgSet],
    standard: StandardResult,
    legal_by_format: Mapping[str, set[str]],
    hidden: frozenset[str] = frozenset(),
) -> list[MtgSet]:
    """Every set that is in Standard, about to be, or legal in another format; newest first.
    Sets listed as hidden in rules.toml are left out."""
    wanted = {s.code for s in standard.sets}.union(*legal_by_format.values()) - hidden
    return sorted(
        (s for s in all_sets if s.code in wanted),
        key=lambda s: (s.released_at, s.code),
        reverse=True,
    )


def _formats_of(
    code: str, standard: StandardResult, legal_by_format: Mapping[str, set[str]]
) -> tuple[str, ...]:
    in_standard = standard.statuses.get(code) is SetStatus.LEGAL
    others = tuple(fmt for fmt, codes in legal_by_format.items() if code in codes)
    return (("standard",) if in_standard else ()) + others


def _play_rates(
    http: HttpClient, paths: Paths, options: BuildOptions
) -> tuple[dict[str, PlayRate], PlaySummary]:
    archive = DecklistArchive(http, paths.cache_dir / "decklists", options.github_token)
    window_start = options.today - timedelta(days=PLAY_RATE_WINDOW_DAYS)
    rates, summary = play_rates(archive.tournaments("standard", window_start, options.today))
    log.info("Play rate: %d decks, %d events", summary.decks, summary.tournaments)
    return rates, summary


def _source_info(price_date: date | None, play: PlaySummary) -> SourceInfo:
    return SourceInfo(
        cardmarket_price_date=price_date,
        play_rate_from=play.first_day,
        play_rate_to=play.last_day,
        play_rate_decks=play.decks,
        play_rate_tournaments=play.tournaments,
    )


def _format_entry(
    format_id: str,
    name: str,
    rotates: bool,
    info_url: str,
    banlist_url: str,
    scryfall: ScryfallClient,
) -> FormatEntry:
    return FormatEntry(
        id=format_id,
        name=name,
        rotates=rotates,
        info_url=info_url,
        banlist_url=banlist_url,
        banned=_banned(scryfall.banned(format_id)),
    )


def _banned(printings: Iterable[Printing]) -> tuple[BannedCard, ...]:
    return tuple(
        BannedCard(
            name=p.name,
            colors=p.color_identity,
            mana_cost=p.mana_cost,
            image_normal=p.image_normal,
            scryfall_url=p.scryfall_url,
        )
        for p in printings
    )


def _pack_image(mtg_set: MtgSet, packs: PackImageStore, wizards_http: HttpClient) -> str | None:
    """The official pack image; None for older sets, which have none."""
    if mtg_set.released_at < OFFICIAL_PACK_IMAGES_SINCE:
        return None
    stored = packs.official(mtg_set.code, mtg_set.name)
    if stored is None and (url := find_pack_image(wizards_http, mtg_set.name)):
        return packs.ensure_official(mtg_set.code, mtg_set.name, url)
    return stored


def _set_entry(
    mtg_set: MtgSet,
    formats: tuple[str, ...],
    standard: StandardResult,
    cards: Sequence[CardRow],
    sealed: Sequence[SealedProduct],
    prices: Mapping[int, Price],
    pack_image: str | None,
) -> SetEntry:
    status = standard.statuses.get(mtg_set.code)
    in_standard = status is not None and status is not SetStatus.NOT_LEGAL
    return SetEntry(
        code=mtg_set.code,
        name=mtg_set.name,
        released_at=mtg_set.released_at,
        set_type=mtg_set.set_type,
        parent_code=mtg_set.parent_code,
        card_count=len(cards),
        icon_url=mtg_set.icon_url,
        pack_image=pack_image,
        formats=formats,
        standard=(
            StandardInfo(status=status, rotation=standard.rotation[mtg_set.code])
            if in_standard and status is not None
            else None
        ),
        products=tuple(
            _product_entry(p, prices) for p in sealed if p.category in PRODUCT_CATEGORIES
        ),
    )


def _product_entry(sealed: SealedProduct, prices: Mapping[int, Price]) -> ProductEntry:
    price = prices.get(sealed.cardmarket_id) if sealed.cardmarket_id else None
    product = Product(
        name=sealed.name,
        category=ProductCategory(sealed.category),
        subtype=sealed.subtype,
        contents=parse_contents(sealed.contents),
        cardmarket_id=sealed.cardmarket_id,
        price=price.trend if price else None,
        average_sale=price.average_sale if price else None,
    )
    return ProductEntry(
        name=product.name,
        category=product.category.value,
        subtype=product.subtype,
        contents=product.contents,
        price=product.price,
        average_sale=product.average_sale,
        price_per_pack=product.price_per_pack,
    )


def _used_symbols(
    cards_by_set: Mapping[str, Sequence[CardRow]], formats: Iterable[FormatEntry]
) -> set[str]:
    symbols = set(COLOR_ORDER) | {"C"}
    for rows in cards_by_set.values():
        for row in rows:
            symbols |= mana_symbols(row.mana_cost)
    for entry in formats:
        for card in entry.banned:
            symbols |= mana_symbols(card.mana_cost)
    return symbols
