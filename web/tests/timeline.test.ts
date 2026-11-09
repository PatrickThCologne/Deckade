import { describe, expect, it } from 'vitest';

import { productLabel } from '../src/lib/products';
import { createRotationText } from '../src/lib/rotation/describe';
import { groupIntoWaves } from '../src/lib/rotation/waves';
import { setTile } from '../src/lib/tiles';
import { groupByYear, inOverview, isShown } from '../src/lib/timeline';
import { ESTIMATED, mtgSet, OFFICIAL, product, rotation, standardSet } from './fixtures';

describe('overview', () => {
  it('groups sets by year, newest first', () => {
    const groups = groupByYear([
      mtgSet('ecl', '2026-01-23', ['standard']),
      mtgSet('tla', '2025-11-21', ['standard']),
      mtgSet('fra', '2026-10-02', ['standard']),
    ]);
    expect(groups.map((g) => [g.year, g.sets.map((s) => s.code)])).toEqual([
      [2026, ['fra', 'ecl']],
      [2025, ['tla']],
    ]);
  });

  it('leaves out announced sets until they have a pack image', () => {
    const announced = standardSet('nau', '2027-02-05', rotation({ wave: 3 }), 'upcoming');
    expect(isShown(announced)).toBe(false);
    expect(isShown({ ...announced, packImage: 'images/packs/nau.webp' })).toBe(true);
    expect(isShown(mtgSet('lea', '1993-08-05', ['commander']))).toBe(true);
  });

  it('lists years up to the year of the data', () => {
    const next = { ...mtgSet('msh2', '2027-04-09', ['commander']), packImage: 'x.webp' };
    expect(inOverview(next, '2026-11-07T10:00:00+00:00')).toBe(false);
    expect(inOverview(next, '2027-01-01T08:00:00+00:00')).toBe(true);
    expect(inOverview(mtgSet('ecl', '2026-01-23', ['standard']), '2026-11-07')).toBe(true);
  });
});

describe('tiles and waves', () => {
  it('links every set to its own page', () => {
    expect(setTile(mtgSet('lea', '1993-08-05', ['commander']), 'de').href).toBe('/de/sets/lea/');
  });

  it('notes a set that only possibly rotates next', () => {
    const tile = setTile(standardSet('s06', '2025-11-21', rotation({ certain: false })), 'en');
    expect(tile.note).toBe('possibly');
  });

  it('shows no "estimated" badge for the next rotation, but "official" once it is', () => {
    const [next] = groupIntoWaves([standardSet('woe', '2023-09-08', rotation())]);
    expect(createRotationText('de', ESTIMATED).waveBadge(next!)).toBeNull();
    expect(createRotationText('de', OFFICIAL).waveBadge(next!)).toBe('offiziell');
  });
});

describe('product labels', () => {
  it('names boxes by type and bundles by their own name', () => {
    expect(productLabel(product('TLA Play Booster Box'), 'TLA')).toBe('Booster Box');
    expect(
      productLabel(product('TLA Collector Booster Box', { subtype: 'collector' }), 'TLA'),
    ).toBe('Collector Box');
    const gift = product('Avatar The Last Airbender Commanders Bundle', {
      category: 'bundle',
      subtype: 'gift_bundle',
    });
    expect(productLabel(gift, 'Avatar: The Last Airbender')).toBe('Commanders Bundle');
  });
});
