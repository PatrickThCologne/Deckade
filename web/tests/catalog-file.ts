/**
 * The card list file (pages/[lang]/cards.json.ts) as the browser scripts load it, for the DOM
 * tests of scripts/card-search.ts and scripts/all-cards.ts: cards built from a few fields,
 * encoded like the real file, and a stand-in for `fetch` that serves it.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import { type CatalogCard, type CatalogFile, encodeCatalog } from '../src/lib/cards/catalog';

export function catalogCard(name: string, overrides: Partial<CatalogCard> = {}): CatalogCard {
  return {
    name,
    altName: '',
    colors: 'R',
    manaCost: '{R}',
    cmc: 1,
    type: 'instant',
    types: ['instant'],
    creatureTypes: [],
    keywords: [],
    synergies: [],
    answers: [],
    tribes: [],
    roles: [],
    price: 1,
    playShare: null,
    isLand: false,
    banned: false,
    setCode: 'fdn',
    printedIn: ['fdn'],
    imageNormal: null,
    scryfallUrl: `https://scryfall.com/card/fdn/${encodeURIComponent(name)}`,
    ...overrides,
  };
}

export function catalogFile(
  cards: readonly CatalogCard[],
  sets: Record<string, string> = { fdn: 'Foundations' },
): CatalogFile {
  return encodeCatalog(cards, sets);
}

/** What `fetch` resolves to: only the parts the scripts read. */
export function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** Replaces `fetch` with a mock that serves `file`; the mock is returned for the assertions. */
export function serveCatalog(file: CatalogFile) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => jsonResponse(file));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

/** Lets pending promise callbacks (the loaded list) run; works with real timers only. */
export const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * The markup of an Astro file under src/, without its frontmatter, styles and scripts, as a
 * fragment. Expressions ({…}) stay as text, so only static attributes can be checked.
 */
export function astroMarkup(path: string): DocumentFragment {
  // A path, not a URL: under jsdom `URL` is jsdom's, which node:fs does not take
  const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', path);
  const source = readFileSync(file, 'utf8')
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .replace(/<(style|script)\b[\s\S]*?<\/\1>/g, '');
  const template = document.createElement('template');
  template.innerHTML = source;
  return template.content;
}
