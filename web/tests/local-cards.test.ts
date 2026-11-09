import { describe, expect, it } from 'vitest';

import { searchText, shownCard } from '../src/lib/cards/local';
import { matchesQuery, normalizeForSearch } from '../src/lib/cards/sort';
import type { Card } from '../src/lib/data/schema';

const card = (overrides: Partial<Card> = {}): Card => ({
  oracleId: 'o',
  name: 'Serra Angel',
  colors: 'W',
  manaCost: '{3}{W}{W}',
  cmc: 5,
  typeLine: 'Creature — Angel',
  text: 'Flying, vigilance',
  rarity: 'uncommon',
  isLand: false,
  banned: false,
  imageSmall: null,
  imageNormal: 'https://cards.scryfall.io/normal/en.jpg',
  scryfallUrl: 'https://scryfall.com/card/en',
  price: 0.2,
  playShare: null,
  averageCopies: null,
  de: {
    name: 'Serra-Engel',
    text: 'Fliegend, Wachsamkeit',
    imageSmall: null,
    imageNormal: 'https://cards.scryfall.io/normal/de.jpg',
    scryfallUrl: 'https://scryfall.com/card/de',
  },
  ...overrides,
});

describe('shownCard', () => {
  it('shows the German printing on German pages', () => {
    expect(shownCard(card(), 'de')).toEqual({
      name: 'Serra-Engel',
      imageNormal: 'https://cards.scryfall.io/normal/de.jpg',
      scryfallUrl: 'https://scryfall.com/card/de',
    });
    expect(shownCard(card(), 'en').name).toBe('Serra Angel');
  });

  it('falls back to English where the set has no German printing', () => {
    expect(shownCard(card({ de: null }), 'de').name).toBe('Serra Angel');
  });
});

describe('search', () => {
  const found = (query: string, locale: 'de' | 'en' = 'de') =>
    matchesQuery(normalizeForSearch(searchText(card(), locale)), query);

  it('looks through names and rules text in both languages on German pages', () => {
    expect(found('fly')).toBe(true);
    expect(found('fliegend')).toBe(true);
    expect(found('Serra-Engel')).toBe(true);
    expect(found('fliegend', 'en')).toBe(false);
  });

  it('needs every word, in any order', () => {
    expect(found('vigilance flying')).toBe(true);
    expect(found('flying lifelink')).toBe(false);
    expect(found('')).toBe(true);
  });
});
