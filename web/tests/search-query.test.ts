import { describe, expect, it } from 'vitest';
import { normalizeForSearch } from '../src/lib/cards/sort';
import { cardKeywords } from '../src/lib/search/keywords';
import { cardSynergies } from '../src/lib/search/synergies';
import {
  nameRank,
  parseQuery,
  queryMatcher,
  type SearchableCard,
  understood,
} from '../src/lib/search/query';

// The cases of api/tests/RotationRadar.Search.Tests/RuleBasedQueryParserTests.cs come first,
// so the two parsers read the same requests the same way.

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
    const query = parseQuery('zeig mir blaue Karten mit Kartenziehen');
    expect(query.unknown).toEqual(['kartenziehen']);
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

describe('queryMatcher', () => {
  const card = (overrides: Partial<SearchableCard>): SearchableCard => ({
    colors: 'R',
    types: ['creature'],
    keywords: ['haste'],
    synergies: [],
    answers: [],
    tribes: [],
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
    expect(matches('rote Kreaturen mit Kartenziehen')).toBe(true);
  });

  it('searches names when the request names no filter', () => {
    expect(matches('raging goblin')).toBe(true);
    expect(matches('lightning bolt')).toBe(false);
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
