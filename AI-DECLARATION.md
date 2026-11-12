---
version: '0.1.2'
level: copilot
processes:
  design: pair
  implementation: copilot
  testing: copilot
  documentation: copilot
  review: copilot
  deployment: assist
---

How AI was used to build Deckade, following [AI-DECLARATION.md](https://ai-declaration.md/en/0.1.2/).

## Notes

- Built with an AI coding assistant (Claude in Claude Code). It wrote most of the code, the
  tests and the documentation; reviews were also done by AI agents with separate roles
  (`.claude/agents`).
- The maintainer decided what to build and how it should look, chose the data sources, and
  checked the results on the site and in the data.
- The site itself runs no AI model: the card search is a fixed rule set that runs in the
  browser (docs/adr/0002-natural-language-search.md). Card images and texts come unchanged from
  Scryfall; nothing on the site is AI-generated art or card text.
