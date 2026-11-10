# 0002 – Search in plain language: rules in the browser first

Date: 2026-11-10 · Status: accepted

## Context

The search tab should understand requests like „günstige rote Kreaturen mit Eile“. The branch
started with a C# solution in `api/`: a rule-based parser, a language-model interpreter,
embeddings for a semantic index and a server API.

The site is static and runs on GitHub Pages. GitHub Pages cannot run a server. A server of
its own would need hosting and upkeep, would see every request (so the privacy notice would
have to change), and a hosted language model would cost money per request. A model running
in the browser would mean downloading tens of megabytes before the first search.

Most requests name things the card data already has: colours, card types, keyword abilities,
mana value, a price and an order ("cheap", "popular").

## Decision

- Phase 1 runs in the browser. `web/src/lib/search/query.ts` reads the request with regular
  expressions, in German and English, into filters over the card list of the "All cards" tab
  (`cards.json`, already built for that tab). The rules are those of
  `RuleBasedQueryParser.cs`; its test cases are repeated in `web/tests/search-query.test.ts`.
- Keyword abilities are read from the English rules text at build time
  (`lib/search/keywords.ts`): only lines made up entirely of keywords count, so "creatures
  with flying can't block" gives no keyword. The catalog carries them as one extra field. The
  German names were checked against the German card texts in the pipeline data on 2026-11-10.
- Synergies work the same way (`lib/search/synergies.ts`): eleven themes such as artifacts,
  counters, blight („Fäulnis“ on German cards), flying, tokens or the graveyard, read from
  the English rules text without reminder text and the card's own name. A theme counts only
  behind „Synergie mit …“, „…-Synergie“, „synergy with …“ or „that care about …“, so
  „Artefakte“ alone stays a card type. Removal such as „destroy target artifact“ is no
  synergy. The C# parser does not know synergies.
- Words the rules do not know are left out rather than finding nothing. A request without any
  filter is a name search, with the exact name first. A first version listed what was
  understood, one label per filter; it was taken out again to keep the page plain.
- The request stays in the address (`?q=`), so a search can be shared. Nothing is stored.
- The C# code in `api/` stays for a later phase and is not deployed.

## Consequences

- No server, no cost, no new dependency; the request never leaves the browser, so the privacy
  notice does not change.
- The card list loads with the first search, not with the page: 4.5 MB for 29,451 cards, about
  1.7 MB compressed (measured 2026-11-10). The keyword field adds about 0.1 MB (2 %), the
  synergy field as much again: 4.6 MB, 1.8 MB with gzip (measured 2026-11-10).
- Synergies are a rough reading of the rules text: 12,999 of the 29,451 cards have at least
  one. Some cards are found that only fight a theme, and some that use it in their own words
  are missed.
- Only what the rules know is understood. "Kartenziehen", "Removal" or "like Lightning Bolt"
  are left out without notice. Rules text is not in the card list, so it is not searched.
- Later phases, if wanted: more rules (card draw, removal, tribes) from the rules text at build
  time, like the synergies; similar cards from embeddings computed in the pipeline with a local model and shipped
  as a short list of neighbours per card; a server with a model only if that is not enough.
