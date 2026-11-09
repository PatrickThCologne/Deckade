# To-do

Open work, roughly in order. Done items move to the commit history.

## Images

- [ ] Find pack images for the sets without an official one (everything before War of the
      Spark, Modern Horizons, Core Set 2020, Double Masters, Time Spiral Remastered). They
      show their set symbol for now. Ideas: own photos, written permission from a shop,
      card art of the set's most iconic card. TCGplayer photos are not allowed (Terms of
      Service), see [ADR 0001](docs/adr/0001-pack-image-sources.md).
- [ ] Background art wall: sort the artwork by colour. Tried as a mock-up (a rainbow from top
      to bottom); needs a hue per artwork from the pipeline as a new contract field. Waiting
      for a decision.

## Site

- [ ] Feedback: the form opens the visitor's mail program. Sending without it needs a form
      service (e.g. Formspree) or GitHub Issues; decide, then update the privacy notice.
- [ ] Page size: a few set pages are large (The List: 6.9 MB, 0.8 MB with gzip). Split their
      card list into pages or load it as JSON.
- [ ] Screenshots for the README.
- [ ] Tab changes still wait about 0.3 s for the next page. Prerendering it on hover
      (Speculation Rules, Chromium only) would remove that; waiting for a decision.

## Data and legal

- [ ] Prices: get written permission from Cardmarket or switch to a source whose terms
      allow republishing; then name the source on the site again. Option for single cards:
      Scryfall's `prices.eur` (already in the bulk data). Scryfall has no sealed prices.
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

- [ ] Database (PostgreSQL + pgvector), indexer, API endpoints, search page (the "Suche"
      tab is a placeholder for now).
- [ ] Fallback when Ollama is down; shorter model timeout; use `MaxQueryLength`.
- [ ] Rate limit, CORS for the site's origin, health check.
- [ ] Evaluation set: 30–50 labelled requests, recall@k.
- [ ] Resolve the EF Core version conflict (MSB3277, 10.0.4 vs 10.0.13).
