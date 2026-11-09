# To-do

Open work, roughly in order. Done items move to the commit history.

## Images

- [ ] Find pack images for the sets without an official one (everything before War of the
      Spark, Modern Horizons, Core Set 2020, Double Masters, Time Spiral Remastered). They
      show their set symbol for now. Ideas: own photos, written permission from a shop,
      card art of the set's most iconic card. TCGplayer photos are not allowed (Terms of
      Service), see [ADR 0001](docs/adr/0001-pack-image-sources.md).
- [ ] Background art wall: try sorting the artwork by colour.

## Card list and set window

- [ ] Column headers (Karte, Typ, Mana, Gespielt, Preis) no longer sticky; the filter and
      search bar stays at the top while scrolling instead.
- [ ] Remove the hint "Fahre über eine Karte, um sie groß zu sehen".
- [ ] Pack and card preview: join their panel with the card list panel (one shape, like a T).

## Site

- [ ] Feedback in the info menu: a form with text fields that sends to the operator e-mail.
- [ ] Logo: "Deck" + a capital "A" ("DeckAde").
- [ ] Page size: some set pages are several MB; the set overlay prefetches whole pages on hover.
- [ ] Screenshots for the README.

## Data and legal

- [ ] Prices: get written permission from Cardmarket or switch to a source whose terms
      allow republishing; then name the source on the site again.
- [ ] Decide whether the repository and the site are public.

## Engineering (from the review on 2026-11-09)

- [ ] Python lockfile and Dependabot (pip, npm, NuGet, GitHub Actions).
- [ ] Pin GitHub Actions to commit SHAs, add `timeout-minutes`.
- [ ] Deploy cache: key per run id stores hundreds of MB each day; cache only pack images
      and decklists, keyed by a hash.
- [ ] The deployment should fail when `OPERATOR_*` variables are missing instead of
      publishing an imprint with placeholders.
- [ ] ESLint for the website; Playwright smoke tests for the set overlay and filters.
- [ ] Domain layer: `domain/rotation.py` imports `rules.py`, which imports the domain again.
- [ ] One name everywhere (Deckade vs. rotation-radar vs. RotationRadar.Search).

## Semantic search (branch `feat/semantic-search`)

- [ ] Database (PostgreSQL + pgvector), indexer, API endpoints, search page.
- [ ] Fallback when Ollama is down; shorter model timeout; use `MaxQueryLength`.
- [ ] Rate limit, CORS for the site's origin, health check.
- [ ] Evaluation set: 30–50 labelled requests, recall@k.
- [ ] Resolve the EF Core version conflict (MSB3277, 10.0.4 vs 10.0.13).
