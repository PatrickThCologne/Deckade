# 0003 – Card prices from Scryfall, sealed products as links

Date: 2026-11-10 · Status: accepted

## Context

Card and sealed prices came from the Cardmarket price guide, a public JSON file. Cardmarket's
terms (20/02/2026) forbid publicly reproducing platform content without consent (no. 10.2) and
say that presenting cards with their prices needs their prior written agreement (no. 9.1).

Scryfall's bulk file, which the pipeline downloads anyway, has daily price estimates per
printing (`prices.eur`, `prices.eur_foil`). Its API terms allow community use as long as the
site adds value and is not behind a paywall; prices are "daily estimates and/or market values
provided by our affiliates" without guarantee, and bulk prices should only be used "to track
trends or provide a general estimate". Scryfall has no prices for sealed products.

## Decision

- Card prices are Scryfall's euro estimates: the cheapest non-foil printing, the foil price
  only for cards that exist in foil alone (as before with the Cardmarket trend).
- The Cardmarket price guide is no longer downloaded (`sources/cardmarket.py` removed).
- Sealed products keep their contents but get no price. Each links to Cardmarket's search for
  it ("Prices on Cardmarket"). The `price` fields of products stay in the data format for a
  licensed source later; the pipeline leaves them empty.
- The site names Scryfall as the price source and calls the prices estimates.

## Consequences

- No Cardmarket content is shown any more; a link to its search is a plain link.
- Prices are a day old at most and only estimates, as the site says.
- Open: Scryfall's euro values most likely come from Cardmarket as an affiliate. Using them
  under Scryfall's terms is the usual way fan sites show prices, but whether Cardmarket's
  rights reach through to them was not checked legally.
- Schema version 6: `sources.cardmarketPriceDate` is gone.
