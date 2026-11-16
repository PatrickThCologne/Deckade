import { describe, expect, it } from 'vitest';
import type { CatalogCard } from '../src/lib/cards/catalog';
import { normalizeForSearch } from '../src/lib/cards/sort';
import { searchResults } from '../src/lib/search/results';

/**
 * A card of the search tab's list as scripts/card-search.ts makes it: the catalog card, its
 * names normalized for the request words, and every name once (the shown one, the other
 * language's, and each face of "A // B").
 */
function entry(name: string, overrides: Partial<CatalogCard> = {}) {
  const card: CatalogCard = {
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
    price: 0.5,
    playShare: null,
    isLand: false,
    banned: false,
    setCode: 'fdn',
    printedIn: ['fdn'],
    imageNormal: null,
    scryfallUrl: 'https://scryfall.com/card/fdn/1',
    ...overrides,
  };
  const names = [card.name, card.altName]
    .filter(Boolean)
    .flatMap((full) => [full, ...(full.includes(' // ') ? full.split(' // ') : [])])
    .map((each) => normalizeForSearch(each));
  return {
    ...card,
    search: normalizeForSearch(`${card.name}\n${card.altName}`),
    names: [...new Set(names)],
  };
}

const burn = { roles: ['removal', 'burn'] } as const;
const wipe = { colors: 'W', type: 'sorcery', types: ['sorcery'], roles: ['wipe'] } as const;
const flash = { colors: 'U', type: 'creature', types: ['creature'] } as const;

const CARDS = [
  entry('Lightning Bolt', { ...burn, playShare: 5, price: 1 }),
  entry('Shock', { ...burn, playShare: 2, price: 0.1 }),
  // Burn is a face of a split card, not a card of its own
  entry('Turn // Burn', { ...burn, colors: 'UR', cmc: 4, playShare: 0.1, price: 0.3 }),
  entry('Fire // Ice', { colors: 'UR', cmc: 4, roles: ['burn'], playShare: 1, price: 0.4 }),
  // The card Flash has no flash itself
  entry('Flash', { colors: 'U', cmc: 2, playShare: 0, price: 2 }),
  entry('Brazen Borrower // Petty Theft', {
    ...flash,
    keywords: ['flash', 'flying'],
    playShare: 4,
    price: 10,
  }),
  entry('Spell Queller', { ...flash, colors: 'WU', keywords: ['flash', 'flying'], playShare: 3 }),
  entry('Wrath of God', { ...wipe, cmc: 4, playShare: 1, price: 8 }),
  entry('Day of Judgment', { ...wipe, cmc: 4, playShare: 2, price: 0.5 }),
  entry('Opt', { colors: 'U', playShare: 1, price: 0.1 }),
  entry('Optimistic Scavenger', { colors: 'W', playShare: 0.5, price: 0.2 }),
  // Played the most of the three, but its name only contains the request
  entry('Panoptic Mirror', { colors: '', playShare: 6, price: 3 }),
];

const catalogOf = (cards: readonly ReturnType<typeof entry>[], creatureTypes: string[] = []) => ({
  cards,
  names: new Set(cards.flatMap((card) => card.names)),
  sets: [],
  creatureTypes,
});
const CATALOG = catalogOf(CARDS, ['god', 'knight']);

const names = (results: readonly { name: string }[]) => results.map((card) => card.name);

describe('searchResults: name searches', () => {
  it('puts the card of exactly that name first, then names that start with it', () => {
    expect(names(searchResults('Opt', CATALOG))).toEqual([
      'Opt',
      'Optimistic Scavenger',
      'Panoptic Mirror',
    ]);
  });

  it('finds a card by its full name: "Lightning Bolt"', () => {
    expect(names(searchResults('Lightning Bolt', CATALOG))).toEqual(['Lightning Bolt']);
  });

  it('searches names for a request that names no filter and is no full name: "bolt"', () => {
    expect(names(searchResults('bolt', CATALOG))).toEqual(['Lightning Bolt']);
  });

  it('lets a chosen order replace the name ranking', () => {
    expect(names(searchResults('Opt', CATALOG, 'value-desc'))).toEqual([
      'Panoptic Mirror',
      'Optimistic Scavenger',
      'Opt',
    ]);
  });

  it.each(['', '   '])('finds nothing for an empty request: "%s"', (request) => {
    expect(searchResults(request, CATALOG)).toEqual([]);
  });

  it('finds nothing for a word that is no filter and in no name', () => {
    expect(searchResults('Glitzer', CATALOG)).toEqual([]);
  });
});

describe('searchResults: a card name that reads as filters', () => {
  it('puts the card of that name on top of the filter results: "Flash"', () => {
    expect(names(searchResults('Flash', CATALOG))).toEqual([
      'Flash',
      'Brazen Borrower // Petty Theft',
      'Spell Queller',
    ]);
  });

  it('pins a card by its English name on German pages too', () => {
    const german = catalogOf([
      ...CARDS.filter((card) => card.name !== 'Flash'),
      entry('Aufblitzen', { altName: 'Flash', colors: 'U', cmc: 2, playShare: 0 }),
    ]);
    expect(names(searchResults('Flash', german))[0]).toBe('Aufblitzen');
  });

  it('pins no card for one face of a split card: "Burn" is burn, not Turn // Burn', () => {
    const results = names(searchResults('Burn', CATALOG));
    expect(results[0]).not.toBe('Turn // Burn');
    // Every card with burn, by play rate
    expect(results).toEqual(['Lightning Bolt', 'Shock', 'Fire // Ice', 'Turn // Burn']);
  });

  it('puts "Wrath of God" first where "God" reads as a creature type', () => {
    expect(names(searchResults('Wrath of God', CATALOG))[0]).toBe('Wrath of God');
  });

  it('puts "Wrath of God" first where no creature type is known', () => {
    expect(names(searchResults('Wrath of God', catalogOf(CARDS)))[0]).toBe('Wrath of God');
  });
});

describe('searchResults: filters and order', () => {
  it('orders filter results by play rate when nothing else is named', () => {
    expect(names(searchResults('Removal', CATALOG))).toEqual([
      'Lightning Bolt',
      'Shock',
      'Turn // Burn',
    ]);
  });

  it('orders them as the request says: "günstiges Removal" is cheapest first', () => {
    expect(names(searchResults('günstiges Removal', CATALOG))).toEqual([
      'Shock',
      'Turn // Burn',
      'Lightning Bolt',
    ]);
  });

  it('lets the chosen order win over the one the request names', () => {
    expect(names(searchResults('günstiges Removal', CATALOG, 'value-desc'))).toEqual([
      'Lightning Bolt',
      'Turn // Burn',
      'Shock',
    ]);
  });
});
