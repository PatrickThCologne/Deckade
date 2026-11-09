import { describe, expect, it } from 'vitest';

import { approach, artRows, creditedArtists, driftOffset, sinkSpeed } from '../src/lib/backdrop';

describe('art rows', () => {
  it('fills every row and never repeats a sequence', () => {
    const rows = artRows(['a', 'b', 'c', 'd', 'e'], 4, 3);
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'a'],
      ['c', 'e', 'b'],
      ['d', 'a', 'd'],
    ]);
    expect(rows.every((row) => row.length === 3)).toBe(true);
  });

  it('has no rows without artworks', () => {
    expect(artRows([], 4, 3)).toEqual([]);
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

describe('artist credits', () => {
  it('names every artist once, in alphabetical order', () => {
    expect(
      creditedArtists(['Volkan Baga', 'Ekaterina Burmak', 'Volkan Baga', 'Ádám Ács'], 'de'),
    ).toEqual(['Ádám Ács', 'Ekaterina Burmak', 'Volkan Baga']);
  });
});
