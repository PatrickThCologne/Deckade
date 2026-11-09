import { describe, expect, it } from 'vitest';

import {
  cardTypes,
  compareCards,
  mainType,
  matchesColors,
  matchesManaValue,
  matchesQuery,
  matchesType,
  type SortableCard,
  type SortKey,
} from '../src/lib/cards/sort';
import { colorPips, manaSymbols, symbolUrl } from '../src/lib/mana';

const card = (name: string, overrides: Partial<SortableCard> = {}): SortableCard => ({
  name,
  colors: 'U',
  cmc: 2,
  price: 1,
  playShare: null,
  isLand: false,
  type: 'instant',
  ...overrides,
});

const cards = [
  card('Opt', { cmc: 1, price: 0.2, playShare: 30 }),
  card('Watery Grave', {
    cmc: 0,
    price: 9,
    isLand: true,
    type: 'land',
    colors: 'UB',
    playShare: 22,
  }),
  card('Sphinx', { cmc: 6, price: null, type: 'creature' }),
  card('Counterspell', { cmc: 2, price: 1.5, playShare: 30 }),
];

const order = (key: SortKey) =>
  cards.toSorted((a, b) => compareCards(a, b, key)).map((c) => c.name);

describe('compareCards', () => {
  it('sorts by play share, then by price', () => {
    expect(order('played')).toEqual(['Counterspell', 'Opt', 'Watery Grave', 'Sphinx']);
  });

  it('keeps unknown prices last in both directions', () => {
    expect(order('value-desc')).toEqual(['Watery Grave', 'Counterspell', 'Opt', 'Sphinx']);
    expect(order('value-asc')).toEqual(['Opt', 'Counterspell', 'Watery Grave', 'Sphinx']);
  });

  it('sorts by mana value with lands at the end', () => {
    expect(order('mana-asc')).toEqual(['Opt', 'Counterspell', 'Sphinx', 'Watery Grave']);
    expect(order('mana-desc')).toEqual(['Sphinx', 'Counterspell', 'Opt', 'Watery Grave']);
  });

  it('groups by card type in decklist order, then by name', () => {
    expect(order('type')).toEqual(['Sphinx', 'Counterspell', 'Opt', 'Watery Grave']);
  });

  it('sorts by name', () => {
    expect(order('name')).toEqual(['Counterspell', 'Opt', 'Sphinx', 'Watery Grave']);
  });
});

describe('mainType', () => {
  it('reads the main type of the front face', () => {
    expect(mainType('Legendary Artifact Creature — Golem')).toBe('creature');
    expect(mainType('Kindred Instant — Elf')).toBe('instant');
    expect(mainType('Battle — Siege // Legendary Creature — Phyrexian')).toBe('battle');
    expect(mainType('Legendary Enchantment Artifact')).toBe('artifact');
  });

  it('counts everything with Land as a land', () => {
    expect(mainType('Land Creature — Forest Dryad')).toBe('land');
    expect(mainType('Artifact Land')).toBe('land');
  });

  it('puts unknown types last', () => {
    expect(mainType('Conspiracy')).toBe('other');
    expect(mainType('')).toBe('other');
  });
});

describe('filters', () => {
  it('shows cards that fit into a deck of the selected colours', () => {
    expect(matchesColors('UB', 'UB')).toBe(true);
    expect(matchesColors('U', 'UB')).toBe(true);
    expect(matchesColors('UR', 'UB')).toBe(false);
    expect(matchesColors('', 'UB')).toBe(false);
    expect(matchesColors('', '')).toBe(true);
  });

  it('filters by every type on any face', () => {
    expect(cardTypes('Legendary Artifact Creature — Golem')).toEqual(['creature', 'artifact']);
    expect(cardTypes('Instant // Land')).toEqual(['instant', 'land']);
    expect(matchesType(['creature', 'artifact'], new Set(['artifact'] as const))).toBe(true);
    expect(matchesType(['instant'], new Set(['sorcery', 'land'] as const))).toBe(false);
    expect(matchesType(['instant'], new Set(['sorcery', 'instant'] as const))).toBe(true);
    expect(matchesType(['instant'], new Set())).toBe(true);
  });

  it('filters by several mana values without lands, 7 and up together', () => {
    const spell = (cmc: number) => ({ cmc, isLand: false });
    expect(matchesManaValue(spell(2), new Set(['2', '3'] as const))).toBe(true);
    expect(matchesManaValue(spell(4), new Set(['2', '3'] as const))).toBe(false);
    expect(matchesManaValue(spell(12), new Set(['7+'] as const))).toBe(true);
    expect(matchesManaValue(spell(0), new Set(['0'] as const))).toBe(true);
    expect(matchesManaValue({ cmc: 0, isLand: true }, new Set(['0'] as const))).toBe(false);
    expect(matchesManaValue({ cmc: 0, isLand: true }, new Set())).toBe(true);
  });

  it('searches names ignoring case and accents', () => {
    expect(matchesQuery('Lim-Dûl the Necromancer', 'lim-dul')).toBe(true);
    expect(matchesQuery('Opt', 'spell')).toBe(false);
  });
});

describe('mana', () => {
  it('reads the symbols of the front face', () => {
    expect(manaSymbols('{2}{W/U}{W/U} // {B}')).toEqual(['2', 'W/U', 'W/U']);
    expect(manaSymbols('')).toEqual([]);
  });

  it('shows the colourless symbol for colourless cards', () => {
    expect(colorPips('')).toEqual(['C']);
    expect(colorPips('UB')).toEqual(['U', 'B']);
  });

  it('drops every slash from the symbol file name', () => {
    expect(symbolUrl('W/U')).toBe('/images/symbols/WU.svg');
    expect(symbolUrl('G/U/P')).toBe('/images/symbols/GUP.svg');
  });
});
