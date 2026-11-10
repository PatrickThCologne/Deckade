import { describe, expect, it } from 'vitest';
import { cardAnswers } from '../src/lib/search/answers';
import { parseQuery, queryMatcher, type SearchableCard } from '../src/lib/search/query';
import { cardTribes, creatureTypes, tribeCandidates } from '../src/lib/search/tribes';
import { normalizeForSearch } from '../src/lib/cards/sort';

describe('cardAnswers', () => {
  it.each([
    ['Destroy target creature with flying.', ['flying']],
    ['Plummet deals 4 damage to target creature with flying.', ['flying']],
    ['Destroy target artifact or enchantment.', ['artifacts', 'enchantments']],
    ['Exile target player’s graveyard.'.replace('’', "'"), ['graveyard']],
    ['Remove all -1/-1 counters from target creature.', ['blight']],
    ['Remove all counters from target permanent.', ['counters', 'blight']],
    ['Counter target noncreature spell.', ['spells']],
    ['Destroy target nonbasic land.', ['lands']],
    ['Players can’t gain life.'.replace('’', "'"), ['lifegain']],
  ])('reads "%s"', (text, answers) => {
    expect(cardAnswers(text, 'Card')).toEqual(answers);
  });

  it('takes no synergy for an answer', () => {
    expect(cardAnswers('Creatures you control with flying get +1/+1.', 'Card')).toEqual([]);
    expect(cardAnswers('Create a 1/1 white Spirit creature token with flying.', 'Card')).toEqual(
      [],
    );
    expect(cardAnswers('Put a +1/+1 counter on target creature.', 'Card')).toEqual([]);
  });

  it('stays inside a sentence', () => {
    expect(
      cardAnswers(
        'Destroy target creature. Draw a card for each creature with flying you control.',
        'Card',
      ),
    ).toEqual([]);
  });
});

describe('creature types', () => {
  it('reads them from creature type lines only', () => {
    expect(creatureTypes('Creature — Elf Warrior')).toEqual(['Elf', 'Warrior']);
    expect(creatureTypes('Kindred Instant — Elemental')).toEqual(['Elemental']);
    expect(creatureTypes('Artifact — Equipment')).toEqual([]);
    expect(creatureTypes('Artifact Creature — Equipment Golem')).toEqual(['Golem']);
  });

  const known = new Set(['elemental', 'elf', 'goblin', 'soldier']);

  it.each([
    ['Other Elementals you control get +1/+1.', ['elemental']],
    ['Whenever another Elf enters, draw a card.', ['elf']],
    ['Goblin spells you cast cost {1} less.', ['goblin']],
    ['Create two 1/1 white Soldier creature tokens.', ['soldier']],
    ['Draw a card for each Elf and each Goblin you control.', ['elf', 'goblin']],
  ])('reads "%s"', (text, tribes) => {
    expect(cardTribes(text, 'Card', known)).toEqual(tribes);
  });

  it('leaves out words that are no creature type and the card itself', () => {
    expect(cardTribes('Each opponent loses 1 life.', 'Card', known)).toEqual([]);
    expect(cardTribes('Other creatures you control get +1/+1.', 'Elf Lord', known)).toEqual([]);
  });

  it('knows German and English names', () => {
    expect(tribeCandidates('elementarwesen')).toEqual(['elemental']);
    expect(tribeCandidates('elementarkreaturen')).toEqual(['elemental']);
    expect(tribeCandidates('elfen')).toEqual(['elf']);
    expect(tribeCandidates('elves')).toEqual(['elf']);
    expect(tribeCandidates('elementals')).toContain('elemental');
  });
});

describe('search for answers and creature types', () => {
  it.each([
    ['blauer Konter gegen Flieger', { colors: 'U', answers: ['flying'] }],
    ['schwarze Karte, die Fäulnis entfernt', { colors: 'B', answers: ['blight'] }],
    ['black card that removes blight', { colors: 'B', answers: ['blight'] }],
    ['blue answer to flyers', { colors: 'U', answers: ['flying'] }],
    ['gegen Artefakte', { answers: ['artifacts'], types: [] }],
  ])('reads "%s"', (request, expected) => {
    expect(parseQuery(request)).toMatchObject(expected);
  });

  it('reads creature types after a synergy phrase', () => {
    const query = parseQuery('blauer Zauber, der mit Elementarwesen synergiert');
    expect(query).toMatchObject({ colors: 'U', types: ['instant', 'sorcery'] });
    expect(query.tribes).toEqual([['elemental']]);
    expect(parseQuery('synergy with Elves').tribes).toEqual([['elf']]);
    expect(parseQuery('Synergie mit Artefakten').tribes).toEqual([]);
  });

  const card = (overrides: Partial<SearchableCard>): SearchableCard => ({
    colors: 'U',
    types: ['instant'],
    keywords: [],
    synergies: [],
    answers: [],
    tribes: [],
    cmc: 2,
    isLand: false,
    price: 1,
    search: normalizeForSearch('Card'),
    ...overrides,
  });

  it('finds the cards that fight or work with it', () => {
    const answer = queryMatcher(parseQuery('blauer Konter gegen Flieger'));
    expect(answer(card({ answers: ['flying'] }))).toBe(true);
    expect(answer(card({ keywords: ['flying'] }))).toBe(false);
    const tribe = queryMatcher(parseQuery('blue spell that synergizes with Elementals'));
    expect(tribe(card({ tribes: ['elemental'] }))).toBe(true);
    expect(tribe(card({ tribes: ['elf'] }))).toBe(false);
  });
});
