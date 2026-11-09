import { describe, expect, it } from 'vitest';

import { createFormatters } from '../src/lib/format';
import { useTranslations } from '../src/lib/i18n';
import { localePath, setPath, switchLocale, withBase } from '../src/lib/links';
import { contentsLabel, shortProductName, sortProducts } from '../src/lib/products';
import { product } from './fixtures';

describe('products', () => {
  it('drops the set name from product names', () => {
    const bundle = product('Avatar The Last Airbender Commanders Bundle', { category: 'bundle' });
    expect(shortProductName(bundle, 'Avatar: The Last Airbender')).toBe('Commanders Bundle');
    const box = product('Marvels Spider Man Collector Booster Box', { subtype: 'collector' });
    expect(shortProductName(box, "Marvel's Spider-Man")).toBe('Collector');
  });

  it('lists the regular product first', () => {
    const sorted = sortProducts([
      product('Collector', { subtype: 'collector', price: 400 }),
      product('Play', { subtype: 'play', price: 130 }),
    ]);
    expect(sorted.map((p) => p.name)).toEqual(['Play', 'Collector']);
  });

  it('describes the contents', () => {
    const finishLine = product('Finish Line Bundle', {
      contents: [
        { count: 6, kind: 'play' },
        { count: 2, kind: 'collector' },
        { count: 1, kind: 'topper' },
      ],
    });
    const { t } = useTranslations('en');
    expect(contentsLabel(finishLine, (kind) => t(`pack.${kind}`))).toBe(
      '6 Play Booster + 2 Collector Booster + 1 box topper',
    );
  });
});

describe('links', () => {
  it('builds paths below the deployment base', () => {
    expect(withBase('images/a.webp', '/rotation-radar/')).toBe('/rotation-radar/images/a.webp');
    expect(localePath('de')).toBe('/de/');
    expect(setPath('en', 'tla')).toBe('/en/sets/tla/');
  });

  it('switches the language of the current page', () => {
    expect(switchLocale('/de/sets/tla/', 'en', '/')).toBe('/en/sets/tla/');
    expect(switchLocale('/rotation-radar/en/about/', 'de', '/rotation-radar/')).toBe(
      '/rotation-radar/de/about/',
    );
  });

  it('leads from pages without a language to the home page of the language', () => {
    expect(switchLocale('/rotation-radar/404/', 'en', '/rotation-radar/')).toBe(
      '/rotation-radar/en/',
    );
    expect(switchLocale('/404', 'de', '/')).toBe('/de/');
  });
});

describe('formatters and plurals', () => {
  it('formats prices and shares per language', () => {
    const de = createFormatters('de');
    expect(de.price(12.5)).toBe('12,50 €');
    expect(de.price(136.41)).toBe('136 €');
    expect(de.percent(31.5)).toBe('31,5 %');
    expect(createFormatters('en').price(12.5)).toBe('€12.50');
    expect(de.price(null)).toBe('–');
  });

  it('picks singular and plural forms', () => {
    const { plural } = useTranslations('de');
    expect(plural('count.cards', 1)).toBe('1 Karte');
    expect(plural('count.cards', 1281)).toBe('1.281 Karten');
  });
});
