import { describe, expect, it } from 'vitest';

import { createRotationText } from '../src/lib/rotation/describe';
import { groupIntoWaves } from '../src/lib/rotation/waves';
import { ESTIMATED, OFFICIAL, rotation, standardSet } from './fixtures';

describe('rotation wording', () => {
  const en = createRotationText('en', ESTIMATED);
  const de = createRotationText('de', ESTIMATED);

  it('names only the year while the date is an estimate', () => {
    expect(en.forSet(rotation())).toBe('rotates out early 2027');
    expect(de.forSet(rotation())).toBe('rotiert Anfang 2027 raus');
    expect(en.headline()).toBe('Early 2027');
  });

  it('names the exact day once it is official', () => {
    const official = createRotationText('de', OFFICIAL);
    expect(official.forSet(rotation())).toBe('rotiert am 29.01.2027 raus');
    expect(official.headline()).toBe('29.01.2027');
  });

  it('only gives the earliest possible date for later waves', () => {
    const later = rotation({ wave: 1, earliest: '2028-01-29', certain: false });
    expect(en.forSet(later)).toBe('stays until at least early 2028');
    expect(de.forSet(later)).toBe('bleibt mind. bis Anfang 2028');
  });

  it('marks a set that may or may not rotate next', () => {
    expect(en.forSet(rotation({ certain: false }))).toBe('may rotate out early 2027');
  });

  it('describes special rules', () => {
    const special = rotation({
      wave: null,
      earliest: null,
      certain: false,
      legalUntilAtLeast: 2029,
    });
    expect(en.forSet(special)).toBe('stays until at least 2029');
  });

  it('counts down roughly in months while estimated and in days once official', () => {
    expect(en.countdown('2026-11-05')).toBe('in about 3 months');
    expect(de.countdown('2026-11-05')).toBe('in ca. 3 Monaten');
    expect(createRotationText('en', OFFICIAL).countdown('2027-01-28')).toBe('in 1 day');
  });
});

describe('groupIntoWaves', () => {
  it('orders waves by index, puts special rules last and sorts sets by release', () => {
    const sets = [
      standardSet(
        'fdn',
        '2024-11-15',
        rotation({ wave: null, earliest: null, certain: false, legalUntilAtLeast: 2029 }),
      ),
      standardSet(
        'tla',
        '2025-11-21',
        rotation({ wave: 1, earliest: '2028-01-29', certain: false }),
      ),
      standardSet('dsk', '2024-09-27', rotation()),
      standardSet('woe', '2023-09-08', rotation()),
    ];

    const waves = groupIntoWaves(sets);

    expect(waves.map((w) => w.kind)).toEqual(['next', 'later', 'special']);
    expect(waves[0]?.sets.map((s) => s.code)).toEqual(['woe', 'dsk']);
    expect(waves[2]?.legalUntilAtLeast).toBe(2029);
  });

  it('builds wave titles from the rotation text', () => {
    const [next] = groupIntoWaves([standardSet('woe', '2023-09-08', rotation())]);
    expect(createRotationText('en', ESTIMATED).waveTitle(next!)).toBe('Rotates out early 2027');
  });
});
