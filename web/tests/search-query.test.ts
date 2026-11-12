import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeForSearch } from '../src/lib/cards/sort';
import { SnapshotSchema } from '../src/lib/data/schema';
import { cardKeywords } from '../src/lib/search/keywords';
import { cardSynergies } from '../src/lib/search/synergies';
import {
  exactNameMatch,
  nameRank,
  parseQuery,
  queryMatcher,
  type SearchableCard,
  understood,
} from '../src/lib/search/query';

// The first cases come from the earlier C# parser (tag archive/api-phase2), so this one still
// reads those requests the same way.

describe('parseQuery: colours', () => {
  it.each([
    ['grüne Kreaturen mit Trample', 'G'],
    ['green creatures with trample', 'G'],
    ['weiße und blaue Flieger', 'WU'],
    ['rote Hexerei', 'R'],
  ])('reads the colours of "%s" in both languages', (request, colors) => {
    expect(parseQuery(request).colors).toBe(colors);
  });

  it.each(['Karten vor der Rotation', 'a hundred tokens', 'Weißwurst'])(
    'finds no colour inside other words: "%s"',
    (request) => {
      expect(parseQuery(request).colors).toBe('');
    },
  );

  it.each([
    ['mono grüne Kreaturen', 'G'],
    ['Selesnya Lebensgewinn', 'WG'],
    ['izzet spells', 'UR'],
  ])('reads mono and guild names in "%s" as exactly these colours', (request, colors) => {
    const query = parseQuery(request);
    expect(query.colors).toBe(colors);
    expect(query.exactColors).toBe(true);
  });

  it('reads colourless as exactly no colour', () => {
    const query = parseQuery('farblose Artefakte');
    expect(query).toMatchObject({ colors: '', exactColors: true, types: ['artifact'] });
  });
});

describe('parseQuery: types', () => {
  it('finds no type inside other words', () => {
    expect(parseQuery('Kreaturenlos landen').types).toEqual([]);
  });

  it('reads several types', () => {
    expect(parseQuery('Spontanzauber und Hexereien').types).toEqual(['instant', 'sorcery']);
  });
});

describe('parseQuery: mana value', () => {
  it.each([
    ['Kreaturen bis 3 Mana', null, 3],
    ['creatures under 3 mana', null, 2],
    ['3 mana or less', null, 3],
    ['Low-Mana Removal', null, 2],
    ['2-drops', 2, 2],
    ['4 Mana Kreatur', 4, 4],
  ])('reads "%s" as %s to %s', (request, min, max) => {
    const query = parseQuery(request);
    expect([query.minMana, query.maxMana]).toEqual([min, max]);
  });
});

describe('parseQuery: price', () => {
  it.each([
    ['Removal unter 2 €', 2],
    ['Karten bis 1,50 Euro', 1.5],
    ['cards under 3 eur', 3],
  ])('reads the euro limit of "%s"', (request, price) => {
    expect(parseQuery(request).maxPrice).toBe(price);
  });

  it('does not read dollar prices as euro', () => {
    expect(parseQuery('cards under $3').maxPrice).toBeNull();
  });
});

describe('parseQuery: keywords and order', () => {
  it('reads the example on the search page', () => {
    expect(parseQuery('günstige rote Kreaturen mit Eile')).toMatchObject({
      colors: 'R',
      exactColors: false,
      types: ['creature'],
      keywords: ['haste'],
      sort: 'value-asc',
      unknown: [],
    });
  });

  it('reads German and English keyword names', () => {
    expect(parseQuery('Flieger mit Lebensverknüpfung und Erstschlag').keywords).toEqual([
      'flying',
      'lifelink',
      'first-strike',
    ]);
    expect(parseQuery('double strike, trample').keywords).toEqual(['trample', 'double-strike']);
  });

  it('reads "günstig zu spielen" as low mana, not as a low price', () => {
    expect(parseQuery('günstig zu spielen')).toMatchObject({ maxMana: 2, sort: null });
  });

  it('sorts by play rate or by price', () => {
    expect(parseQuery('beliebte Länder').sort).toBe('played');
    expect(parseQuery('teure Planeswalker').sort).toBe('value-desc');
  });

  it('keeps the words it did not understand, without filler words', () => {
    const query = parseQuery('zeig mir blaue Karten mit Glitzer');
    expect(query.unknown).toEqual(['glitzer']);
    expect(understood(query)).toBe(true);
  });

  it('understands nothing in a card name', () => {
    const query = parseQuery('Lightning Bolt');
    expect(understood(query)).toBe(false);
    expect(query.unknown).toEqual(['lightning', 'bolt']);
  });
});

describe('parseQuery: synergies', () => {
  it('reads a synergy behind the other filters', () => {
    expect(parseQuery('günstige rote Kreatur mit Eile, Synergie mit Artefakten')).toMatchObject({
      colors: 'R',
      types: ['creature'],
      keywords: ['haste'],
      synergies: ['artifacts'],
      sort: 'value-asc',
      unknown: [],
    });
  });

  it.each([
    ['Synergie mit Countern', ['counters']],
    ['Synergie mit +1/+1-Marken', ['counters']],
    ['Synergie mit Fäulnis', ['blight']],
    ['Synergien mit Fliegern und Spielsteinen', ['flying', 'tokens']],
    ['Artefakt-Synergie', ['artifacts']],
    ['synergy with tokens and sacrifice', ['tokens', 'sacrifice']],
    ['cards that care about graveyards', ['graveyard']],
    ['Synergie mit Spontanzaubern und Hexereien', ['spells']],
  ])('reads "%s"', (request, synergies) => {
    expect(parseQuery(request).synergies).toEqual(synergies);
  });

  it('takes the theme as a synergy, not as a type or keyword the card must have', () => {
    expect(parseQuery('Synergie mit Artefakten').types).toEqual([]);
    expect(parseQuery('Synergie mit Fliegern').keywords).toEqual([]);
  });

  it('reads theme words without the phrase as before', () => {
    expect(parseQuery('Artefakte')).toMatchObject({ types: ['artifact'], synergies: [] });
    expect(parseQuery('Synergie mit Artefakten und Kreaturen').types).toEqual(['creature']);
  });
});

// English set names as in the data; fra, isd and vow test the name rules, one, war and all are
// codes that are also English words.
const SETS = [
  { code: 'fra', name: 'Reality Fracture' },
  { code: 'isd', name: 'Innistrad' },
  { code: 'vow', name: 'Innistrad: Crimson Vow' },
  { code: 'one', name: 'Phyrexia: All Will Be One' },
  { code: 'war', name: 'War of the Spark' },
  { code: 'all', name: 'Alliances' },
  { code: 'dsk', name: 'Duskmourn: House of Horror' },
  { code: 'bfz', name: 'Battle for Zendikar' },
  { code: 'usg', name: "Urza's Saga" },
  // Real sets whose names are also the start of common words ("Aether", "cold", "strong"),
  // or have one word only, or a number, or a short name before the colon
  { code: 'drk', name: 'The Dark' },
  { code: 'dft', name: 'Aetherdrift' },
  { code: 'csp', name: 'Coldsnap' },
  { code: 'gpt', name: 'Guildpact' },
  { code: 'scg', name: 'Scourge' },
  { code: 'plst', name: 'The List' },
  { code: 'bbd', name: 'Battlebond' },
  { code: 'sth', name: 'Stronghold' },
  { code: 'mh1', name: 'Modern Horizons' },
  { code: 'mh2', name: 'Modern Horizons 2' },
  { code: 'mh3', name: 'Modern Horizons 3' },
  { code: 'tdm', name: 'Tarkir: Dragonstorm' },
  { code: 'dtk', name: 'Dragons of Tarkir' },
  { code: 'stx', name: 'Strixhaven: School of Mages' },
  { code: 'neo', name: 'Kamigawa: Neon Dynasty' },
  { code: 'ltr', name: 'The Lord of the Rings: Tales of Middle-earth' },
  { code: 'blb', name: 'Bloomburrow' },
  { code: 'zen', name: 'Zendikar' },
  { code: 'leg', name: 'Legends' },
];

describe('parseQuery: sets', () => {
  it('reads the key example with a set behind the other filters', () => {
    const query = parseQuery('Kreatur, die wenig Mana kostet, aus Fractured Reality', SETS);
    expect(query).toMatchObject({ types: ['creature'], maxMana: 2, sets: ['fra'] });
    expect(query.unknown).not.toContain('fractured');
    expect(query.unknown).not.toContain('reality');
  });

  it.each(['Karten aus Reality Fracture', 'Fractured Reality', 'reality fracture'])(
    'reads a set name in any word order and with other word endings: "%s"',
    (request) => {
      expect(parseQuery(request, SETS)).toMatchObject({ sets: ['fra'], unknown: [] });
    },
  );

  it.each([
    ['Innistrad', ['isd']],
    ['Innistrad Crimson Vow', ['vow']],
    ['crimson vow innistrad', ['vow']],
  ])('keeps only the sets with the most name words in "%s"', (request, sets) => {
    expect(parseQuery(request, SETS).sets).toEqual(sets);
  });

  it('needs every word of the set name', () => {
    expect(parseQuery('Spark', SETS).sets).toEqual([]);
    // "Phyrexia" stands before the colon of "Phyrexia: All Will Be One" (see below)
    expect(parseQuery('Phyrexia', SETS).sets).toEqual(['one']);
  });

  it('counts a word with another ending only if the shorter one has at least 4 letters', () => {
    expect(parseQuery('Innistrad Crimson Vows', SETS).sets).toEqual(['isd']);
  });

  it.each([
    ['War of the Spark', ['war']],
    ['Phyrexia: All Will Be One', ['one']],
    ['Duskmourn House of Horrors', ['dsk']],
    ["Urza's Saga", ['usg']],
    ['Urzas Saga', ['usg']],
  ])('ignores "the", "of", "and", short words and punctuation in "%s"', (request, sets) => {
    expect(parseQuery(request, SETS).sets).toEqual(sets);
  });

  it.each([
    ['Kreaturen aus FRA', ['fra']],
    ['DSK-Karten', ['dsk']],
    ['Karten aus ONE', ['one']],
  ])('reads a set code written in capitals: "%s"', (request, sets) => {
    expect(parseQuery(request, SETS)).toMatchObject({ sets, unknown: [] });
  });

  it.each(['one card', 'cards from war', 'all creatures', 'Kreaturen aus fra'])(
    'reads no set code written in lower case: "%s"',
    (request) => {
      expect(parseQuery(request, SETS).sets).toEqual([]);
    },
  );

  it('keeps a word in capitals that is no set code as unknown', () => {
    expect(parseQuery('ABC', SETS)).toMatchObject({ sets: [], unknown: ['abc'] });
  });

  it('reads the sets first, so their words are no type or colour', () => {
    expect(parseQuery('Battle for Zendikar', SETS)).toMatchObject({
      sets: ['bfz'],
      types: [],
      unknown: [],
    });
    expect(parseQuery('rote Kreaturen aus Innistrad', SETS)).toMatchObject({
      colors: 'R',
      types: ['creature'],
      sets: ['isd'],
      unknown: [],
    });
  });

  it('reads no set without the list of sets', () => {
    const query = parseQuery('Reality Fracture');
    expect(query).toMatchObject({ sets: [], unknown: ['reality', 'fracture'] });
    expect(understood(query)).toBe(false);
  });

  it('understands a request that only names a set', () => {
    expect(understood(parseQuery('Fractured Reality', SETS))).toBe(true);
  });
});

describe('parseQuery: set names against real words', () => {
  it.each(['Karten aus Aether', 'cards from cold', 'Karten aus Guild', 'cards from strong'])(
    'counts another ending only if the words differ by at most 2 letters: "%s"',
    (request) => {
      expect(parseQuery(request, SETS).sets).toEqual([]);
    },
  );

  it('takes a German word that starts with a set name for no set: "listige Kreaturen"', () => {
    expect(parseQuery('listige Kreaturen', SETS)).toMatchObject({
      sets: [],
      types: ['creature'],
    });
  });

  it('still counts a word ending that differs by one letter', () => {
    expect(parseQuery('Karten aus Modern Horizon', SETS).sets).toEqual(['mh1']);
    expect(parseQuery('Karten aus Alliance', SETS).sets).toEqual(['all']);
  });

  it.each([
    ['Zendikar', ['zen']],
    ['the dark', ['drk']],
    ['Bloomburrow', ['blb']],
    ['Legends', ['leg']],
    ['The List', ['plst']],
  ])('names a one-word set when the request is just its name: "%s"', (request, sets) => {
    expect(parseQuery(request, SETS)).toMatchObject({ sets, unknown: [] });
  });

  it.each([
    ['Karten aus Bloomburrow', ['blb']],
    ['Kreaturen aus Zendikar', ['zen']],
    ['cards from The Dark', ['drk']],
    ['Karten von Coldsnap', ['csp']],
    ['creatures in Scourge', ['scg']],
    ['Karten aus dem Set Alliances', ['all']],
    ['Edition Legends', ['leg']],
  ])(
    'names a one-word set right after "aus", "von", "from", "in", "set", "edition": "%s"',
    (request, sets) => {
      expect(parseQuery(request, SETS).sets).toEqual(sets);
    },
  );

  it.each([
    'Dark Ritual',
    'Dark Confidant',
    'Uneasy Alliance',
    'Scourge of Valkas',
    'Aether Vial',
    'Cold Storage',
    'Guild Summit',
    'Fugitive Listener',
  ])('names no set in the card name "%s"', (request) => {
    expect(parseQuery(request, SETS).sets).toEqual([]);
  });

  it('leaves filter words to the filters: "battle" is the card type', () => {
    expect(parseQuery('battle', SETS)).toMatchObject({ types: ['battle'], sets: [] });
  });

  it('leaves filter words to the filters: "strong" is the order by play rate', () => {
    expect(parseQuery('strong creatures', SETS)).toMatchObject({
      sort: 'played',
      types: ['creature'],
      sets: [],
    });
  });

  it.each([
    [
      'Modern Horizons 3 Kreaturen bis 3 Mana',
      { sets: ['mh3'], types: ['creature'], minMana: null, maxMana: 3 },
    ],
    [
      'Kreaturen aus Modern Horizons 3 ab 3 Mana',
      { sets: ['mh3'], types: ['creature'], minMana: 3, maxMana: null },
    ],
    ['Modern Horizons 2 Kreaturen unter 2 €', { sets: ['mh2'], types: ['creature'], maxPrice: 2 }],
  ])('blanks only the request words that named the set: "%s"', (request, expected) => {
    expect(parseQuery(request, SETS)).toMatchObject({ ...expected, unknown: [] });
  });

  it.each([
    ['Kreaturen aus Duskmourn', ['dsk']],
    ['Tarkir Karten', ['tdm']],
    ['Strixhaven', ['stx']],
    ['Kamigawa', ['neo']],
    ['Phyrexia', ['one']],
  ])('names a set by the word before its colon: "%s"', (request, sets) => {
    expect(parseQuery(request, SETS)).toMatchObject({ sets, unknown: [] });
  });

  it('lets a set named in full win over the word before a colon', () => {
    expect(parseQuery('Innistrad', SETS).sets).toEqual(['isd']);
  });

  it.each(['Phyrexian creatures', 'Strix', 'Lord', 'Crimson'])(
    'needs the exact word of 5 letters or more before the colon: "%s"',
    (request) => {
      expect(parseQuery(request, SETS).sets).toEqual([]);
    },
  );

  it('takes a creature type before a colon for no set', () => {
    // Made up: no real set has a creature type before its colon that the parser knows
    const sets = [...SETS, { code: 'gob', name: 'Goblin: A Test Set' }];
    expect(parseQuery('Goblin Kreaturen', sets).sets).toEqual([]);
  });

  // Real sets whose word before the colon is part of many card names
  const COLON_SETS = [
    ...SETS,
    { code: 'tla', name: 'Avatar: The Last Airbender' },
    { code: 'cmr', name: 'Commander Legends' },
    { code: 'clb', name: "Commander Legends: Battle for Baldur's Gate" },
    { code: 'mat', name: 'March of the Machine: The Aftermath' },
  ];

  it.each(['Avatar of Woe', 'Serra Avatar', "Commander's Sphere", 'Funeral March', 'Forced March'])(
    'takes a card name with such a word for no set: "%s"',
    (request) => {
      expect(parseQuery(request, COLON_SETS).sets).toEqual([]);
    },
  );

  it('only counts a single word before the colon', () => {
    expect(parseQuery('Siege-Gang Commander', COLON_SETS).sets).toEqual([]);
    expect(parseQuery('Machine Kreaturen', COLON_SETS).sets).toEqual([]);
  });

  it('reads a creature type before a colon as the set right after a cue word', () => {
    expect(parseQuery('Karten aus Avatar', COLON_SETS)).toMatchObject({ sets: ['tla'] });
    expect(parseQuery('Avatar Kreaturen', COLON_SETS).sets).toEqual([]);
  });
});

// The sets of the real data, if the pipeline has written it; in CI these are the few sets of
// tests/contract (npm run fixture), which these card names do not touch anyway
const SNAPSHOT = new URL('../src/data/generated/snapshot.json', import.meta.url);
const REAL_SETS = existsSync(SNAPSHOT)
  ? SnapshotSchema.parse(JSON.parse(readFileSync(SNAPSHOT, 'utf8'))).sets.map(({ code, name }) => ({
      code,
      name,
    }))
  : [];

describe('parseQuery: card names against the real set list', () => {
  it.each([
    'Dark Ritual',
    'Dark Confidant',
    'Aether Vial',
    'Cold Storage',
    'Guild Summit',
    'Uneasy Alliance',
    'Scourge of Valkas',
    'Fugitive Listener',
  ])('names no set in "%s"', (request) => {
    expect(parseQuery(request, REAL_SETS).sets).toEqual([]);
  });
});

describe('exactNameMatch', () => {
  const names = new Set(
    ['Dark Ritual', 'Control Magic', 'Stärke des Willens', 'Ratchet Bomb'].map((name) =>
      normalizeForSearch(name),
    ),
  );

  it.each(['Dark Ritual', 'control magic', 'Stärke des Willens', 'ratchet bomb', '  Dark Ritual '])(
    'finds the card name "%s" as typed, in any case and with spaces around',
    (request) => {
      expect(exactNameMatch(request, names)).toBe(true);
    },
  );

  it.each(['rote Kreaturen', 'Dark', 'Dark Ritual Kreaturen', ''])(
    'finds no card name in "%s"',
    (request) => {
      expect(exactNameMatch(request, names)).toBe(false);
    },
  );
});

describe('parseQuery: roles and archetypes', () => {
  it.each([
    'Karten zum Rampen',
    'Ramp',
    'Rampe',
    'mana dorks',
    'Manabeschleunigung',
    'ramp spells',
  ])('reads "%s" as ramp', (request) => {
    const query = parseQuery(request);
    expect(query.roles).toEqual(['ramp']);
    expect(understood(query)).toBe(true);
  });

  it('reads the ramp example with a colour', () => {
    expect(parseQuery('grüne Karten zum Rampen')).toMatchObject({ colors: 'G', roles: ['ramp'] });
  });

  it('names no role or archetype in a request without them', () => {
    expect(parseQuery('rote Kreaturen')).toMatchObject({ roles: [], archetype: null });
  });

  it.each([
    ['Aggro', 'aggro'],
    ['Aggro-Deck', 'aggro'],
    ['Karten für Aggro-Decks', 'aggro'],
    ['aggressive creatures', 'aggro'],
    ['aggressiv', 'aggro'],
    ['Control', 'control'],
    ['control cards', 'control'],
    ['Kontroll-Deck', 'control'],
    ['Kontrolle', 'control'],
    ['Midrange', 'midrange'],
    ['Mid-Range', 'midrange'],
    ['mid range', 'midrange'],
  ])('reads "%s" as the archetype %s, with "Deck" as a filler word', (request, archetype) => {
    const query = parseQuery(request);
    expect(query).toMatchObject({ archetype, unknown: [] });
    expect(understood(query)).toBe(true);
  });

  it('reads an archetype next to colours and types', () => {
    expect(parseQuery('rote Midrange-Kreaturen')).toMatchObject({
      colors: 'R',
      types: ['creature'],
      archetype: 'midrange',
    });
  });

  it.each([
    ['Removal', 'removal'],
    ['Entfernung', 'removal'],
    ['Kreaturen-Removal', 'removal'],
    ['Counterspell', 'counterspell'],
    ['Counterspells', 'counterspell'],
    ['Konterzauber', 'counterspell'],
    ['Gegenzauber', 'counterspell'],
    ['Boardwipe', 'wipe'],
    ['board wipe', 'wipe'],
    ['Brettfeger', 'wipe'],
    ['Massenvernichtung', 'wipe'],
    ['wrath', 'wipe'],
    ['Kartenziehen', 'draw'],
    ['card draw', 'draw'],
    ['Kartenvorteil', 'draw'],
    ['draw spells', 'draw'],
    ['Burn', 'burn'],
    ['Direktschaden', 'burn'],
    ['direct damage', 'burn'],
  ])('reads "%s" as the role %s', (request, role) => {
    const query = parseQuery(request);
    expect(query).toMatchObject({ roles: [role], unknown: [] });
    expect(understood(query)).toBe(true);
  });

  it('reads a role next to a colour and a mana limit', () => {
    expect(parseQuery('Removal rot')).toMatchObject({ colors: 'R', roles: ['removal'] });
    expect(parseQuery('Low-Mana Removal')).toMatchObject({ maxMana: 2, roles: ['removal'] });
  });

  it('reads "removal gegen Flieger" as an answer, not as a role', () => {
    expect(parseQuery('removal gegen Flieger')).toMatchObject({
      answers: ['flying'],
      roles: [],
    });
  });

  it.each(['Kreaturen die Kontrolle übernehmen', 'gain control'])(
    'reads no archetype in "%s"',
    (request) => {
      expect(parseQuery(request).archetype).toBeNull();
    },
  );

  it('takes the first of several archetypes and understands the others', () => {
    expect(parseQuery('aggro control')).toMatchObject({ archetype: 'aggro', unknown: [] });
  });
});

describe('parseQuery: game phase and strength', () => {
  it.each([
    'Late-Game',
    'late game',
    'Lategame',
    'Spätspiel',
    'Finisher',
    'Bomben',
    'hohe Manakosten',
    'hohen Mana-Kosten',
    'high mana value',
    'viel Mana',
  ])('reads "%s" as mana value 5 or more', (request) => {
    expect(parseQuery(request)).toMatchObject({ minMana: 5, maxMana: null, unknown: [] });
  });

  it.each(['Early Game', 'Early-Game', 'Frühspiel'])(
    'reads "%s" as mana value 2 or less',
    (request) => {
      expect(parseQuery(request)).toMatchObject({ minMana: null, maxMana: 2, unknown: [] });
    },
  );

  it.each([
    ['ab 4 Mana', 4],
    ['mindestens 4 Mana', 4],
    ['4+ Mana', 4],
    ['4 mana or more', 4],
    ['at least 4 mana', 4],
    ['mehr als 4 Mana', 5],
    ['more than 4 mana', 5],
    ['über 4 Mana', 5],
  ])('reads "%s" as mana value %s or more', (request, min) => {
    const query = parseQuery(request);
    expect([query.minMana, query.maxMana]).toEqual([min, null]);
  });

  it.each(['stark', 'starke', 'stärksten', 'strong', 'powerful', 'mächtige', 'die reinknallen'])(
    'reads "%s" as sorted by play rate',
    (request) => {
      expect(parseQuery(request)).toMatchObject({ sort: 'played', unknown: [] });
    },
  );

  it('reads "Stärke" as power, not as strong', () => {
    expect(parseQuery('Kreaturen mit hoher Stärke').sort).toBeNull();
  });

  it('reads no mana value from inside a longer number', () => {
    expect(parseQuery('x100+ mana').minMana).toBeNull();
    expect(parseQuery('uber 4 mana').minMana).toBe(5);
  });

  it('reads strong late-game cards', () => {
    expect(parseQuery('starke Late-Game blaue Karten')).toMatchObject({
      colors: 'U',
      minMana: 5,
      maxMana: null,
      sort: 'played',
      unknown: [],
    });
  });

  it('reads high mana costs that hit hard', () => {
    expect(parseQuery('blaue Karten mit hohen Mana-Kosten, die reinknallen')).toMatchObject({
      colors: 'U',
      minMana: 5,
      sort: 'played',
    });
  });
});

describe('queryMatcher', () => {
  const card = (overrides: Partial<SearchableCard>): SearchableCard => ({
    colors: 'R',
    types: ['creature'],
    keywords: ['haste'],
    synergies: [],
    answers: [],
    tribes: [],
    roles: [],
    printedIn: [],
    cmc: 2,
    isLand: false,
    price: 0.2,
    search: normalizeForSearch('Raging Goblin'),
    ...overrides,
  });
  const matches = (request: string, overrides: Partial<SearchableCard> = {}) =>
    queryMatcher(parseQuery(request))(card(overrides));

  it('needs every named colour, or exactly them for mono and guild names', () => {
    expect(matches('rote Kreaturen', { colors: 'BR' })).toBe(true);
    expect(matches('mono rote Kreaturen', { colors: 'BR' })).toBe(false);
    expect(matches('Rakdos', { colors: 'BR' })).toBe(true);
  });

  it('needs every named keyword', () => {
    expect(matches('Eile')).toBe(true);
    expect(matches('Eile und Trampelschaden')).toBe(false);
  });

  it('needs every named synergy', () => {
    expect(matches('Synergie mit Artefakten')).toBe(false);
    expect(matches('Synergie mit Artefakten', { synergies: ['artifacts', 'tokens'] })).toBe(true);
  });

  it('leaves lands out of a mana value limit', () => {
    expect(matches('bis 3 Mana')).toBe(true);
    expect(matches('bis 3 Mana', { isLand: true, cmc: 0, types: ['land'] })).toBe(false);
  });

  it('leaves cards without a price out of a price limit', () => {
    expect(matches('unter 1 €')).toBe(true);
    expect(matches('unter 1 €', { price: null })).toBe(false);
  });

  it('ignores words it did not understand once a filter is named', () => {
    expect(matches('rote Kreaturen mit Glitzer')).toBe(true);
  });

  it('searches names when the request names no filter', () => {
    expect(matches('raging goblin')).toBe(true);
    expect(matches('lightning bolt')).toBe(false);
  });

  it('needs a printing in one of the named sets', () => {
    const fromSets = (request: string, printedIn: readonly string[]) =>
      queryMatcher(parseQuery(request, SETS))(card({ printedIn }));
    expect(fromSets('Kreaturen aus FRA', ['fra', 'isd'])).toBe(true);
    expect(fromSets('Kreaturen aus FRA', ['dsk'])).toBe(false);
    expect(fromSets('Kreaturen aus FRA oder DSK', ['dsk'])).toBe(true);
    expect(fromSets('rote Kreaturen', [])).toBe(true);
  });

  // Where a card must not match, the request names a colour as well: it is understood today,
  // so the card is not left out only because the request reads as a name search.

  it('needs every named role', () => {
    expect(matches('rote Karten zum Rampen', { roles: ['ramp', 'draw'] })).toBe(true);
    expect(matches('rote Karten zum Rampen', { roles: ['draw'] })).toBe(false);
  });

  it('takes cheap creatures and burn for aggro', () => {
    const aggro = 'rote Karten für Aggro';
    expect(matches(aggro, { cmc: 3 })).toBe(true);
    expect(matches(aggro, { cmc: 4 })).toBe(false);
    expect(matches(aggro, { types: ['instant'], cmc: 1, roles: ['burn'] })).toBe(true);
    expect(matches(aggro, { types: ['instant'], cmc: 1 })).toBe(false);
  });

  it.each([['removal'], ['counterspell'], ['wipe'], ['draw']] as const)(
    'takes cards with %s for control',
    (role) => {
      expect(matches('control cards', { types: ['instant'], roles: [role] })).toBe(true);
    },
  );

  it('takes no card without such a role for control', () => {
    const control = 'rote Karten für Control';
    expect(matches(control, { types: ['instant'], roles: ['ramp', 'burn'] })).toBe(false);
    expect(matches(control, { types: ['instant'], roles: [] })).toBe(false);
  });

  it.each([
    [2, false],
    [3, true],
    [5, true],
    [6, false],
  ])(
    'takes only creatures of mana value 3 to 5 for midrange (mana value %s: %s)',
    (cmc, expected) => {
      const midrange = 'rote Karten für Midrange';
      expect(matches(midrange, { cmc })).toBe(expected);
      expect(matches(midrange, { cmc, types: ['sorcery'] })).toBe(false);
    },
  );

  it('leaves lands out of every archetype', () => {
    const land = { isLand: true, types: ['land', 'creature'], cmc: 0 } as const;
    expect(matches('rote Karten für Aggro', land)).toBe(false);
    expect(matches('rote Karten für Aggro', { ...land, roles: ['burn'] })).toBe(false);
    expect(matches('rote Karten für Control', { ...land, roles: ['draw'] })).toBe(false);
  });

  it('needs at least mana value 5 for late game', () => {
    expect(matches('rote Late-Game Karten', { cmc: 6 })).toBe(true);
    expect(matches('rote Late-Game Karten', { cmc: 4 })).toBe(false);
  });
});

describe('cardKeywords', () => {
  it('reads keyword lines, with reminder text and costs', () => {
    expect(
      cardKeywords('Flying, vigilance\nWard {2} (Whenever this becomes the target…)\nDraw a card.'),
    ).toEqual(['flying', 'vigilance', 'ward']);
  });

  it('does not take keywords from rules text', () => {
    expect(cardKeywords("Creatures with flying can't block.\nHaste")).toEqual(['haste']);
  });

  it('reads the two-word keywords', () => {
    expect(cardKeywords('First strike\nDouble strike')).toEqual(['first-strike', 'double-strike']);
  });
});

describe('cardSynergies', () => {
  it('reads what the rules text works with', () => {
    expect(
      cardSynergies('Whenever an artifact you control enters, create a Treasure token.', 'X'),
    ).toEqual(['artifacts', 'tokens']);
    expect(cardSynergies('Creatures you control with flying get +1/+1.', 'X')).toEqual(['flying']);
    expect(cardSynergies('Proliferate. Draw a card.', 'X')).toEqual(['counters']);
  });

  it('takes removal and counterspells for no synergy', () => {
    expect(cardSynergies('Destroy target artifact.', 'X')).toEqual([]);
    expect(cardSynergies('Counter target spell.', 'X')).toEqual([]);
    expect(cardSynergies('This deals 4 damage to target creature with flying.', 'X')).toEqual([]);
  });

  it('does not count a bare keyword line as a flying synergy', () => {
    expect(cardSynergies('Flying\nVigilance', 'Serra Angel')).toEqual([]);
  });

  it('leaves out reminder text and the card name', () => {
    const blight =
      'As an additional cost to cast this spell, you may blight 1. (You may put a -1/-1 ' +
      'counter on a creature you control.)\nDestroy target creature.';
    expect(cardSynergies(blight, 'X')).toEqual(['blight']);
    const name = 'Skithiryx, the Blight Dragon';
    expect(cardSynergies(`{B}: ${name} gains haste until end of turn.`, name)).toEqual([]);
  });
});

describe('nameRank', () => {
  const search = normalizeForSearch('Opt') + String.fromCharCode(10) + normalizeForSearch('Opt');
  it('puts the exact name first, then names that start with the request', () => {
    expect(nameRank(search, ['opt'])).toBe(0);
    expect(nameRank(normalizeForSearch('Optionen'), ['opt'])).toBe(1);
    expect(nameRank(normalizeForSearch('Panoptischer Spiegel'), ['opt'])).toBe(2);
  });

  it('finds the English name on German pages too', () => {
    const german = normalizeForSearch('Blitzschlag') + String.fromCharCode(10) + 'lightning bolt';
    expect(nameRank(german, ['lightning', 'bolt'])).toBe(0);
  });
});
