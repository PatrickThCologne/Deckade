import { describe, expect, it } from 'vitest';
import { normalizeForSearch } from '../src/lib/cards/sort';
import { parseQuery, queryMatcher, type SearchableCard } from '../src/lib/search/query';
import { tribeCandidates } from '../src/lib/search/tribes';
import CREATURE_TYPES from './fixtures/creature-types.json';

/**
 * Rules from a review of the search against the real catalog: negation over a whole list,
 * German creature type compounds, negated card and creature types, and "nur"/"only" after the
 * colour. The creature types are those the site takes from the catalog
 * (fixtures/creature-types.json), as in the benchmark.
 *
 * New fields this file expects on SearchQuery: `notTypes` (card types the cards must not have,
 * "non-artifact creatures") and `notCreatureTypes` (creature types the cards must not be,
 * "non-human creatures"). Where a rule does not need a field name, the tests check what
 * queryMatcher finds instead.
 */
const parse = (request: string) => parseQuery(request, [], CREATURE_TYPES);

const card = (overrides: Partial<SearchableCard>): SearchableCard => ({
  colors: 'G',
  types: ['creature'],
  creatureTypes: [],
  keywords: [],
  synergies: [],
  answers: [],
  tribes: [],
  roles: [],
  printedIn: [],
  cmc: 2,
  isLand: false,
  price: 0.5,
  search: normalizeForSearch('Card'),
  ...overrides,
});
const matches = (request: string, overrides: Partial<SearchableCard> = {}) =>
  queryMatcher(parse(request))(card(overrides));

describe('negation covers a whole list', () => {
  it.each([
    'Kreaturen ohne Fliegen oder Reichweite',
    'creatures without flying or reach',
    'creatures without flying and reach',
  ])('rules out every keyword of the list: "%s"', (request) => {
    expect(parse(request)).toMatchObject({
      types: ['creature'],
      keywords: [],
      notKeywords: ['flying', 'reach'],
      unknown: [],
    });
  });

  it('rules out every keyword of an "und" list: "Kreaturen ohne Fliegen und Trampelschaden"', () => {
    expect(parse('Kreaturen ohne Fliegen und Trampelschaden')).toMatchObject({
      keywords: [],
      notKeywords: ['flying', 'trample'],
    });
  });

  it('takes no card with any keyword of the negated list', () => {
    const request = 'creatures without flying or reach';
    expect(matches(request, { keywords: ['haste'] })).toBe(true);
    expect(matches(request, { keywords: ['flying'] })).toBe(false);
    expect(matches(request, { keywords: ['reach'] })).toBe(false);
  });

  it.each(['keine blauen oder roten Karten', 'no blue or red cards'])(
    'rules out every colour of the list: "%s"',
    (request) => {
      expect(parse(request)).toMatchObject({ colors: '', notColors: 'UR', unknown: [] });
    },
  );

  it.each(['weder blau noch rot', 'neither blue nor red'])(
    'reads "%s" as neither colour',
    (request) => {
      expect(parse(request)).toMatchObject({ colors: '', notColors: 'UR', unknown: [] });
    },
  );

  it('takes no card of a colour of the negated list', () => {
    expect(matches('weder blau noch rot', { colors: 'G' })).toBe(true);
    expect(matches('weder blau noch rot', { colors: 'U' })).toBe(false);
    expect(matches('weder blau noch rot', { colors: 'R' })).toBe(false);
  });

  it('ends the negation where the list ends: "Kreaturen ohne Fliegen mit Reichweite"', () => {
    expect(parse('Kreaturen ohne Fliegen mit Reichweite')).toMatchObject({
      keywords: ['reach'],
      notKeywords: ['flying'],
    });
  });
});

describe('German creature types in compounds and the dative', () => {
  it('reads the dative "-ern": "geistern" is a spirit', () => {
    expect(tribeCandidates('geistern')).toContain('spirit');
  });

  it('reads "Synergie mit Geistern" as a synergy with spirits', () => {
    expect(parse('Synergie mit Geistern')).toMatchObject({
      tribes: [['spirit']],
      creatureTypes: [],
      unknown: [],
    });
  });

  it('reads "Geistern" alone as the creature type Spirit', () => {
    expect(parse('Geistern')).toMatchObject({ creatureTypes: ['spirit'], unknown: [] });
  });

  // One request word is one list of candidates in SearchQuery.tribes ("the cards must work with
  // one"), so the compound "Elfenkriegern" is elf or warrior, not both: a card that cares about
  // "Elf Warriors" may have read only one of the two from its rules text.
  it('reads the compound "Elfenkriegern" as one word naming elf and warrior', () => {
    const query = parse('synergiert mit Elfenkriegern');
    expect(query.tribes.map((candidates) => [...candidates].sort())).toEqual([['elf', 'warrior']]);
    expect(query.unknown).toEqual([]);
  });

  it.each([
    ['Zombiekarten', 'zombie'],
    ['Elfenkarten', 'elf'],
    ['Goblinkarten', 'goblin'],
    ['Vampirkarten', 'vampire'],
  ])('reads "%s" as the creature type %s', (request, type) => {
    expect(parse(request)).toMatchObject({ creatureTypes: [type], unknown: [] });
  });

  it.each([
    ['Drachenkreaturen', 'dragon'],
    ['Zombiekreaturen', 'zombie'],
  ])('reads "%s" as creatures of the type %s', (request, type) => {
    expect(parse(request)).toMatchObject({
      types: ['creature'],
      creatureTypes: [type],
      unknown: [],
    });
  });

  // A compound is a German type word and a known card or type word, not any longer word
  it.each([
    ['hundert Karten', 'dog'],
    ['Geistreich', 'spirit'],
    ['Elfmeter', 'elf'],
    ['Goblinkönig', 'goblin'],
  ])('reads no creature type in "%s"', (request, type) => {
    expect(parse(request).creatureTypes).not.toContain(type);
  });
});

describe('negated card and creature types', () => {
  it.each(['non-artifact creatures', 'Nicht-Artefakt-Kreaturen', 'nonartifact creatures'])(
    'reads "%s" as creatures that are no artifacts',
    (request) => {
      expect(parse(request)).toMatchObject({
        types: ['creature'],
        typeGroups: [['creature']],
        notTypes: ['artifact'],
        unknown: [],
      });
    },
  );

  it('takes no artifact creature for "non-artifact creatures"', () => {
    expect(matches('non-artifact creatures', { types: ['creature'] })).toBe(true);
    expect(matches('non-artifact creatures', { types: ['artifact', 'creature'] })).toBe(false);
    expect(matches('non-artifact creatures', { types: ['artifact'] })).toBe(false);
  });

  it.each(['non-human creatures', 'Kreaturen ohne Menschen'])(
    'reads "%s" as creatures that are no humans',
    (request) => {
      expect(parse(request)).toMatchObject({
        types: ['creature'],
        creatureTypes: [],
        notCreatureTypes: ['human'],
        unknown: [],
      });
    },
  );

  it('takes no human for "non-human creatures"', () => {
    expect(matches('non-human creatures', { creatureTypes: ['elf'] })).toBe(true);
    expect(matches('non-human creatures', { creatureTypes: [] })).toBe(true);
    expect(matches('non-human creatures', { creatureTypes: ['human', 'wizard'] })).toBe(false);
  });

  it('reads the one word "nonblack" as not black', () => {
    expect(parse('nonblack creatures')).toMatchObject({
      colors: '',
      notColors: 'B',
      types: ['creature'],
      unknown: [],
    });
  });

  it.each(['keine farblosen Karten', 'non-colorless cards'])(
    'reads "%s" as cards with a colour',
    (request) => {
      expect(parse(request)).toMatchObject({ exactColors: false, unknown: [] });
      expect(matches(request, { colors: 'R' })).toBe(true);
      expect(matches(request, { colors: 'WU' })).toBe(true);
      expect(matches(request, { colors: '' })).toBe(false);
    },
  );

  it('reads "nicht Izzet" as neither blue nor red', () => {
    expect(parse('nicht Izzet')).toMatchObject({ colors: '', notColors: 'UR', unknown: [] });
    expect(matches('nicht Izzet', { colors: 'G' })).toBe(true);
    expect(matches('nicht Izzet', { colors: 'R' })).toBe(false);
  });
});

describe('"nur" and "only" after the colour', () => {
  it.each([
    ['Kreaturen nur in Rot', 'R'],
    ['red cards only', 'R'],
    ['red creatures only', 'R'],
    ['monoblau', 'U'],
    ['monorot', 'R'],
  ])('reads "%s" as exactly %s', (request, colors) => {
    expect(parse(request)).toMatchObject({
      colors,
      colorMode: 'exact',
      exactColors: true,
      unknown: [],
    });
  });

  it('takes no multicoloured card for "red creatures only"', () => {
    expect(matches('red creatures only', { colors: 'R' })).toBe(true);
    expect(matches('red creatures only', { colors: 'BR' })).toBe(false);
  });

  it('keeps "rote Karten nur bis 3 Mana" red cards of any other colour too', () => {
    expect(parse('rote Karten nur bis 3 Mana')).toMatchObject({
      colors: 'R',
      colorMode: 'all',
      exactColors: false,
      maxMana: 3,
    });
  });
});
