# Deckade

**Which Magic: The Gathering sets are in Standard right now – and when do they rotate out?**

Deckade is a bilingual (German / English) fan website that answers that question with nothing
but public data:

- every Magic set since 1993 on one timeline
- the Standard rotation in detail
- every card with its market price and how often it is played in tournaments
- bundle and booster box prices

## Features

- **All sets** – a timeline by year. Each set opens as an overlay with its own URL: release
  date, card count, product prices and the full card list.
- **All cards** – every card once (cheapest printing, newest image), with search in name and
  rules text, filters for colour, mana value and type, and a large card preview.
- **Standard rotation** – the Standard sets grouped by when they leave, the next rotation as
  the headline. Estimates are labelled as estimates.
- **German and English** – every page in both languages; German pages show German card names
  and images wherever a German printing exists.
- **Static and fast** – plain HTML without a client framework and self-hosted fonts; JavaScript
  only adds filtering, sorting and the set overlay.

## Technical implementation

The project consists of two parts with a clear contract between them:

| Part                    | Stack                                                    | Responsibility                                                   |
| ----------------------- | -------------------------------------------------------- | ---------------------------------------------------------------- |
| [`pipeline/`](pipeline) | Python 3.12, httpx, Pillow · pytest, mypy (strict), ruff | Fetch and process the data, write a JSON snapshot and the images |
| [`web/`](web)           | Astro 7, TypeScript (strict), Zod · Vitest, Prettier     | Validate the snapshot and render a static, SEO-friendly website  |

### Architecture

```mermaid
flowchart LR
  X[External sources<br/>REST APIs · bulk files · images] --> A
  subgraph pipeline [pipeline/ · Python]
    A[sources/*<br/>HTTP adapters with cache] --> B[domain/*<br/>pure logic, unit-tested] --> E[snapshot.py<br/>JSON contract]
    A --> I[images.py<br/>image processing]
  end
  subgraph web [web/ · Astro]
    V[lib/data/schema.ts<br/>Zod validation] --> P[pages + components<br/>static HTML]
  end
  E -->|snapshot.json, cards/*.json| V
  I -->|public/images| P
  P -->|daily deploy| G[GitHub Pages]
```

- **Everything happens at build time.** The pipeline collects and processes the data once per
  build; the deployed site is plain static files, without a server or a database.
- **Domain logic is pure.** `pipeline/src/rotation_radar/domain` has no network or file access;
  adapters in `sources/` translate raw responses into domain objects.
- **One data contract.** The pipeline writes camelCase JSON (`snapshot.py`, `SCHEMA_VERSION`);
  the website validates it with Zod at build time (`web/src/lib/data/schema.ts`) and fails the
  build instead of shipping a broken page.
- **Wording is logic, too.** `web/src/lib/rotation/describe.ts` turns rotation data into text
  for both languages and is tested with the real dictionaries.

### Project structure

```
pipeline/
  rules.toml                 rotation rule parameters, official date, special rules
  src/rotation_radar/
    domain/                  sets, rotation, cards, products, play rate (pure)
    sources/                 HTTP client and one adapter per external source
    images.py                image processing: pack cut-outs and mana symbols
    snapshot.py              data contract and JSON writer
    build.py, cli.py         orchestration: python -m rotation_radar build
  tests/
web/
  src/
    config/site.ts           site name, languages
    lib/                     data loading, i18n, formatting, rotation text, sorting
    components/ layouts/ pages/ scripts/ styles/
    data/generated/          snapshot written by the pipeline (not committed)
  public/images/             images written by the pipeline (not committed)
  tests/
.github/workflows/           CI on every push, daily refresh + deploy
```

## Getting started

Requirements: Python 3.12+, Node.js 22.23+ (Astro 7).

```bash
# Data pipeline (about 3 minutes; pack images are cached afterwards)
cd pipeline
python -m venv .venv
.venv/Scripts/activate          # Windows; on macOS/Linux: source .venv/bin/activate
pip install -e ".[dev]"
python -m rotation_radar build  # writes web/src/data/generated and web/public/images

# Website
cd ../web
npm ci
npm run dev                     # http://localhost:4321
```

The website needs a snapshot: run the pipeline once before `npm run dev` (about a minute;
the Scryfall bulk file and pack images are cached in `pipeline/.cache` and `web/public/images`).
Generated data is not committed – CI and the deployment build it fresh.
Set `GITHUB_TOKEN` to raise the GitHub API rate limit for the decklist download.

## Quality checks

| Pipeline                | Website          |
| ----------------------- | ---------------- |
| `pytest`                | `npm test`       |
| `mypy` (strict)         | `npm run check`  |
| `ruff check src tests`  | `npm run lint`   |
| `ruff format src tests` | `npm run format` |

All of them run in [CI](.github/workflows/ci.yml) on every push and pull request.

## Deployment

[`deploy.yml`](.github/workflows/deploy.yml) runs daily at 04:30 UTC and can be started by hand
under _Actions → Refresh data and deploy → Run workflow_. It rebuilds the snapshot with fresh
prices, builds the site and publishes it to GitHub Pages (enable _Settings → Pages → Source:
GitHub Actions_). A push to `main` does not deploy; code changes go live with the next run.
`SITE_URL` and `BASE_PATH`
configure the public address. The imprint and the privacy notice name the operator from the
repository variables `OPERATOR_NAME`, `OPERATOR_ADDRESS` and `OPERATOR_EMAIL` (_Settings →
Secrets and variables → Actions → Variables_), so personal data stays out of the code.

## Before going public

Checked on 2026-11-05, 2026-11-06 and 2026-11-09 against the sources below. Not legal advice.

| Topic                                                                               | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Status                                                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| [Wizards Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy) | Footer notice matches the required wording; content must stay free (ads, sponsors and donations are allowed if access is not restricted); no Wizards logos or trademarks in the site's own branding.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | ✅ met                                                                      |
| [Scryfall API](https://scryfall.com/docs/api)                                       | Free for community content, no paywall; images must not be cropped (artist and copyright line), distorted, recoloured or watermarked; use the image URLs from the API; send User-Agent and Accept headers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | ✅ met as far as checked                                                    |
| [Scryfall image guidelines](https://scryfall.com/docs/api/images)                   | No blurring, sharpening, desaturating or colour shifting; art crops need the artist named in the same interface. The background shows the art crops unchanged (dark layers on top only) and the footer names every artist. The live page blocks automated access; the rules were read from copies of the docs.                                                                                                                                                                                                                                                                                                                                                                 | ✅ met; re-read the live page once by hand                                  |
| Site name "Deckade"                                                                 | No Wizards trademark in the name (the earlier "Magic-O" contained "Magic"). A web search on 2026-11-09 found no Magic product or trademark called "Deckade", only an itch.io comment naming a game of that name and a card game prototype "Deckayde". The trademark registers (DPMA, EUIPO, USPTO) were not searched.                                                                                                                                                                                                                                                                                                                                                          | ✅ most likely fine; registers not searched                                 |
| Cardmarket price guide                                                              | The files were [opened to all users](https://news.cardmarket.com/en/Magic/were-making-the-price-guide-and-product-catalogue-available-for-download), but no explicit terms for republishing them were found.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | ⚠️ ask Cardmarket in writing                                                |
| Pack images                                                                         | Sets since War of the Spark (2019) use the official booster images from the [Wizards Play Network product pages](https://wpn.wizards.com/en/products), named on the About page. They are cropped and scaled; renders that show the pack at an angle (since 2024) are turned to face the viewer. The Fan Content Policy FAQ allows Wizards material with logos in it "as long as they aren't changed in any way"; whether turning the image counts as a change is open. Sets without an official single-pack image show their set symbol ([ADR 0001](docs/adr/0001-pack-image-sources.md)); TCGplayer photos are no longer used.                                                | ✅ official images; ⚠️ turning the renders is a small change                |
| Impressum (§ 5 DDG, § 18 MStV)                                                      | § 5 DDG covers services offered "geschäftsmäßig"; a non-commercial fan site without ads is most likely exempt. § 18 (1) MStV, however, asks every site that does not serve purely personal or family purposes for name and address, and that exemption is read narrowly ([NLM guide](https://www.nlm.de/fileadmin/dateien/pdf/leitfaden_impressumspflicht_2024.pdf), [Medienanstalt NRW](https://www.medienanstalt-nrw.de/fileadmin/user_upload/lfm-nrw/Regulierung/Beschwerde/Infos_kompakt/Infos_kompakt-Impressumspflicht.pdf)). A public fan site most likely needs name and a postal address where legal documents can be served (no P.O. box). Page: `/[lang]/imprint/`. | ⚠️ set `OPERATOR_ADDRESS`; get advice if unsure                             |
| Privacy notice (DSGVO)                                                              | Hosting logs (GitHub logs every visitor IP; GitHub is certified under the EU-U.S. Data Privacy Framework) and images loaded from Scryfall process IP addresses. No cookies, no tracking, no browser storage, fonts self-hosted. Page: `/[lang]/privacy/`. Whether Scryfall is covered by the DPF is unknown.                                                                                                                                                                                                                                                                                                                                                                   | ✅ page added; set `OPERATOR_NAME`, `OPERATOR_ADDRESS` and `OPERATOR_EMAIL` |
| Licences                                                                            | MTGJSON, MTGODecklistCache and this repository.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | ⚠️ open                                                                     |

## Roadmap

- User accounts with a personal collection and decks (server rendering in Astro + an API
  built on the existing Python domain layer).
- Card scanning in the browser (camera via `getUserMedia`, recognition by name or image).
- Price history and play-rate trends around a rotation.
- More expressive visuals.

## Legal

Deckade is unofficial Fan Content permitted under the Fan Content Policy. Not
approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the
Coast. ©Wizards of the Coast LLC.
