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
- Answers are the opposite of synergies, over the same themes (`lib/search/answers.ts`): what
  a card fights, such as „destroy target creature with flying“, „remove all -1/-1 counters“
  (blight puts -1/-1 counters on your own creatures) or „counter target spell“. They count
  behind „Konter gegen …“, „gegen …“, „entfernt …“, „answer to …“ or „removes …“. A match
  stays inside one sentence.
- Creature types (`lib/search/tribes.ts`): what the rules text works with („Elementals you
  control“, „another Elf“, „Goblin spells“), checked against the creature types in the type
  lines of all cards. They count behind „synergiert mit …“ or „synergy with …“; German
  requests know about 35 common types by their German card words, English ones any type.
  „Zauber“ and „spell“ mean an instant or a sorcery. The C# parser knows neither.
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
- Answers and creature types add about 4 % to the card list: 4.8 MB, 1.9 MB with gzip
  (German list, measured 2026-11-10). 1,621 cards have an answer, 3,533 a creature type. They
  are as rough as the synergies: unusual wordings are missed.
- Synergies are a rough reading of the rules text: 12,999 of the 29,451 cards have at least
  one. Some cards are found that only fight a theme, and some that use it in their own words
  are missed.
- Only what the rules know is understood; anything else ("like Lightning Bolt") is left out
  without notice. Rules text is not in the card list, so it is not searched. Card draw and
  removal were not understood at first; they are roles now (update below).
- Later phases, if wanted: more rules from the rules text at build time, like the synergies
  (roles and creature types came that way, update below); similar cards from embeddings
  computed in the pipeline with a local model and shipped as a short list of neighbours per
  card; a server with a model only if that is not enough.

## Update 2026-11-12

The C# code was moved out of `main` into the git tag `archive/api-phase2`: it was never
deployed, and its server and indexer were only stubs. `web/src/lib/search/query.ts` is now the only parser; the
references above to `api/` and `RuleBasedQueryParser.cs` describe the state of 2026-11-10.

The search now also reads sets (`web/src/lib/search/sets.ts`), by their English names only.
Set names are also words of card names, so the rules are narrow:

- A code counts only in capitals ("FRA", "DSK-Karten"), so "one", "war" and "all" stay words.
  A code that is also a filler word or "one" ("ALL", "MIR", "ONE") counts only right after a
  cue word ("aus", "von", "from", "in", "set", "edition"): "ALL CARDS WITH FLYING", "ZEIG MIR …"
  and "ONE drop creatures" name no set, "cards from ALL" does.
- A name counts in any word order; another ending counts only as an ending (from 4 letters, at
  most 2 letters more, so "Aether" is not "Aetherdrift"). A number counts only right after the
  name word before it: "Modern Horizons 3", but "Modern Horizons Kreaturen bis 3 Mana" is
  Modern Horizons and 3 mana.
- Short names count as well: the part after the colon ("Crimson Vow"), a part of several words
  before it ("Lord of the Rings") and the name without a possessive at its start
  ("Spider-Man"), each of two words at least.
- A name of one word counts on its own, after a cue word, or, from 5 letters and if it is no
  creature type, next to a word a filter reads ("Bloomburrow creatures"); "Dark Ritual" and
  "Uneasy Alliance" name no set.
- Where several names fit, the one with the most words wins, then the one whose words stand
  together ("Tarkir Dragonstorm dragons" is not Dragons of Tarkir), then the one written
  exactly so, then a full name over a short one ("Commander Legends" is that set, not
  "Commander Legends: Battle for Baldur's Gate").
- Without such a name, a word after a cue that several set names share names all of them
  ("aus Eldraine"), except format names ("in Modern"); otherwise an exact word of 5 letters or
  more before the colon names the set ("Duskmourn"), a creature type only after a cue word.

A request that is exactly a card name, or the face of one, is searched as that name where it
names no filter ("Dark Ritual") or words are left that no filter reads ("Control Magic"). Where
every word reads as a filter ("Flash", "Counterspell", "Wrath of God" with the creature type
God), the filters win and the card of that full name is put on top of their results; one face
of a split card is no full name ("Burn" is burn, not Turn // Burn). This decision, the name
ranking and the order are `web/src/lib/search/results.ts` (`searchResults`), a pure function
with its own tests; `web/src/scripts/card-search.ts` only loads, shows and pages the results.

Creature types come from the type lines into the card list (one more field per card and the
list of all types in the file). A request word that is one ("Elfen", "dragons") asks for cards
of that type; "Synergie mit Elfen" and "elf synergy" stay a synergy with the type. A guild name
means the cards a deck of its colours can play: one or both colours and no other ("Izzet"
finds mono-red spells too, but no colourless card), and so do the shard and wedge names for
three colours ("Esper", "Jund"). "mono" and "farblos" mean exactly these colours, "nur" and
"only" too, but only right before a colour word ("rote Karten nur bis 3 Mana" is not mono);
plain colour words mean all of them and maybe more. Colours and keywords can be ruled out
("nicht blau", "non-blue", "ohne Fliegen", "without flying"). One word for two types
("Artefaktkreaturen", "artifact creatures") needs both, while "Artefakte und Kreaturen" is
either. German creature words count with at most a short ending ("Hunde", not "hundert").

Seven card roles are read from the English rules text at build time, like the synergies, and
can be searched: ramp, removal, counterspell, wipe, draw, burn and tutor ("Removal", "Edikte",
"Konter", "Boardwipe", "Tutor"). Removal deals with a creature, a planeswalker or any
permanent, not only with artifacts or enchantments, and exile that brings the card back is
none; a wipe hits all creatures or all opposing ones, not those in a fight or your own;
discarding and drawing as many is no draw; a tutor finds a card that is no land. The
archetypes (aggro, control, midrange) are fixed rules over roles and mana value. Both are
heuristics over the rules text, not deck data.
