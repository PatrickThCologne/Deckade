import { describe, expect, it } from 'vitest';
import { focusIndex, focusOffset, swell } from '../src/lib/year-rail';

describe('year rail', () => {
  const tops = [100, 400, 600, 1000];

  it('places the reading point between two year rows', () => {
    expect(focusIndex(tops, 50)).toBe(0);
    expect(focusIndex(tops, 400)).toBe(1);
    expect(focusIndex(tops, 500)).toBe(1.5);
    expect(focusIndex(tops, 5000)).toBe(3);
  });

  it('swells the focused year most and fades out over three places', () => {
    expect(swell(0)).toBe(1);
    expect(swell(1)).toBeGreaterThan(swell(2));
    expect(swell(-1)).toBe(swell(1));
    expect(swell(3)).toBe(0);
    expect(swell(7)).toBe(0);
  });

  it('follows the focus smoothly from one entry to the next', () => {
    const middles = [10, 30, 60];
    expect(focusOffset(middles, 0)).toBe(10);
    expect(focusOffset(middles, 1.5)).toBe(45);
    expect(focusOffset(middles, 2)).toBe(60);
  });
});
