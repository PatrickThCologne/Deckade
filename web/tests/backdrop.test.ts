import { describe, expect, it } from 'vitest';

import {
  approach,
  colourRows,
  creditedArtists,
  driftOffset,
  sinkSpeed,
  tabTurn,
} from '../src/lib/backdrop';

describe('art rows', () => {
  const art = (name: string, hue: number | null) => ({ name, hue });
  const names = (rows: { name: string }[][]) => rows.map((row) => row.map((a) => a.name));

  it('runs from red at the top through green and blue to violet, grey last', () => {
    const items = [
      art('grey', null),
      art('blue', 230),
      art('green', 120),
      art('pink-red', 350),
      art('violet', 285),
      art('yellow', 55),
    ];
    expect(names(colourRows(items, 6, 1))).toEqual([
      ['pink-red'],
      ['yellow'],
      ['green'],
      ['blue'],
      ['violet'],
      ['grey'],
    ]);
  });

  it('fills every row, each a little further along, and never repeats a sequence', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((name, index) => art(name, index * 60));
    const rows = names(colourRows(items, 4, 3));

    // Starts spread evenly over the five: 0, 1.25, 2.5, 3.75, rounded
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['b', 'c', 'd'],
      ['d', 'e', 'a'],
      ['e', 'a', 'b'],
    ]);
    expect(new Set(rows.map((row) => row.join())).size).toBe(rows.length);
  });

  it('repeats the artworks when a row is longer than all of them', () => {
    expect(names(colourRows([art('a', 0), art('b', 90)], 1, 5))).toEqual([
      ['a', 'b', 'a', 'b', 'a'],
    ]);
  });

  it('has no rows without artworks', () => {
    expect(colourRows([], 4, 3)).toEqual([]);
  });
});

describe('scroll movement', () => {
  it('drifts rows in both directions without leaving one loop length', () => {
    expect(driftOffset(0, 0.3, 0, 1000)).toBe(0);
    expect(driftOffset(1000, 0.3, 0, 1000)).toBeCloseTo(-300);
    expect(driftOffset(1000, -0.3, 0, 1000)).toBeCloseTo(-700);
    expect(driftOffset(5000, 0.3, 137, 1000)).toBeCloseTo(-637);
    expect(driftOffset(500, 0.3, 0, 0)).toBe(0);
  });

  it('slows the wall down when it is too short for the page', () => {
    expect(sinkSpeed(0.16, 800, 2000)).toBe(0.16);
    expect(sinkSpeed(0.16, 800, 10000)).toBeCloseTo(0.08);
    expect(sinkSpeed(0.16, -50, 2000)).toBe(0);
  });

  it('glides towards the scroll position independent of the frame rate', () => {
    const oneFrame = approach(0, 100, 32, 90);
    const twoFrames = approach(approach(0, 100, 16, 90), 100, 16, 90);
    expect(oneFrame).toBeCloseTo(twoFrames);
    expect(oneFrame).toBeGreaterThan(0);
    expect(oneFrame).toBeLessThan(100);
    expect(approach(99.8, 100, 16, 90)).toBe(100);
  });
});

describe('tab change', () => {
  const tabs = ['/de/', '/de/cards/', '/de/rotation/'];

  it('turns the rows from the last tab to this one, in the direction of the move', () => {
    expect(tabTurn(tabs, '/de/rotation/', '/de/', 700)).toEqual({ from: 0, to: 1400 });
    expect(tabTurn(tabs, '/de/', '/de/cards/', 700)).toEqual({ from: 700, to: 0 });
  });

  it('rests in place without a tab to come from', () => {
    expect(tabTurn(tabs, '/de/cards/', undefined, 700)).toEqual({ from: 700, to: 700 });
    expect(tabTurn(tabs, '/de/cards/', '/de/about/', 700)).toEqual({ from: 700, to: 700 });
    expect(tabTurn(tabs, '/de/about/', '/de/cards/', 700)).toEqual({ from: 0, to: 0 });
  });
});

describe('artist credits', () => {
  it('names every artist once, in alphabetical order', () => {
    expect(
      creditedArtists(['Volkan Baga', 'Ekaterina Burmak', 'Volkan Baga', 'Ádám Ács'], 'de'),
    ).toEqual(['Ádám Ács', 'Ekaterina Burmak', 'Volkan Baga']);
  });
});
