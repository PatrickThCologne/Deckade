import { describe, expect, it } from 'vitest';

import {
  buildCatalog,
  decodeCatalog,
  encodeCatalog,
  type Printing,
} from '../src/lib/cards/catalog';
import type { Card } from '../src/lib/data/schema';

const card = (overrides: Partial<Card> = {}): Card => ({
  oracleId: 'serra-angel',
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
  imageNormal:
    'https://cards.scryfall.io/normal/front/0/a/0a1b2c3d-1111-2222-3333-444455556666.jpg?1700000000',
  scryfallUrl: 'https://scryfall.com/card/m20/39/serra-angel?utm_source=api',
  price: 0.2,
  playShare: null,
  averageCopies: null,
  de: null,
  ...overrides,
});

const printing = (
  setCode: string,
  releasedAt: string,
  overrides: Partial<Card> = {},
): Printing => ({
  setCode,
  releasedAt,
  card: card(overrides),
});

const german = {
  name: 'Serra-Engel',
  text: 'Fliegend, Wachsamkeit',
  imageSmall: null,
  imageNormal:
    'https://cards.scryfall.io/normal/front/f/e/fedcba98-1111-2222-3333-444455556666.jpg?1700000001',
  scryfallUrl: 'https://scryfall.com/card/m20/39/de/serra-engel?utm_source=api',
};

describe('buildCatalog', () => {
  const printings = [
    printing('lea', '1993-08-05', { price: 40, scryfallUrl: 'https://scryfall.com/card/lea/1' }),
    printing('m20', '2019-07-12', { price: 0.2, de: german }),
    printing('fdn', '2024-11-15', { price: 0.15, playShare: 3.5 }),
    printing('ktk', '2014-09-26', { oracleId: 'other', name: 'Other', price: null }),
  ];

  it('lists every card once, with the cheapest price and the highest play share', () => {
    const catalog = buildCatalog(printings, 'en');
    expect(catalog).toHaveLength(2);
    expect(catalog[0]).toMatchObject({ name: 'Serra Angel', price: 0.15, playShare: 3.5 });
    expect(catalog[1]).toMatchObject({ name: 'Other', price: null, playShare: null });
  });

  it('shows the newest printing, on German pages the newest German one', () => {
    expect(buildCatalog(printings, 'en')[0]).toMatchObject({ setCode: 'fdn', altName: '' });
    expect(buildCatalog(printings, 'de')[0]).toMatchObject({
      setCode: 'm20',
      name: 'Serra-Engel',
      altName: 'Serra Angel',
      imageNormal: german.imageNormal,
    });
  });

  it('knows every set that printed the card, the shown one first', () => {
    expect(buildCatalog(printings, 'en')[0]?.printedIn).toEqual(['fdn', 'm20', 'lea']);
    expect(buildCatalog(printings, 'de')[0]?.printedIn).toEqual(['m20', 'fdn', 'lea']);
  });

  it('knows every type of the card and its main type', () => {
    const [artifactCreature] = buildCatalog(
      [printing('bro', '2022-11-18', { typeLine: 'Artifact Creature — Golem' })],
      'en',
    );
    expect(artifactCreature).toMatchObject({ type: 'creature', types: ['creature', 'artifact'] });
  });
});

describe('catalog file', () => {
  it('gives back the same cards, with short Scryfall links', () => {
    const catalog = buildCatalog(
      [
        printing('m20', '2019-07-12', { de: german, banned: true }),
        printing('dmu', '2022-09-09', {
          oracleId: 'land',
          name: 'Plains',
          typeLine: 'Basic Land — Plains',
          isLand: true,
          imageNormal: null,
        }),
      ],
      'de',
    );
    const file = JSON.parse(JSON.stringify(encodeCatalog(catalog, { m20: 'Core Set 2020' })));
    const decoded = decodeCatalog(file);

    expect(file.sets).toEqual({ m20: 'Core Set 2020' });
    expect(decoded).toEqual(
      catalog.map((entry) => ({
        ...entry,
        scryfallUrl: entry.scryfallUrl.replace(
          /^(https:\/\/scryfall\.com\/card\/m20\/39(\/de)?).*$/,
          '$1',
        ),
      })),
    );
    expect(decoded[0]?.scryfallUrl).toBe('https://scryfall.com/card/m20/39/de');
    expect(decoded[0]).toMatchObject({ banned: true, isLand: false });
    expect(decoded[0]?.keywords).toEqual(['flying', 'vigilance']);
    expect(decoded[1]).toMatchObject({ isLand: true, imageNormal: null, type: 'land' });
  });

  it('keeps every set that printed a card', () => {
    const catalog = buildCatalog(
      [printing('lea', '1993-08-05'), printing('m20', '2019-07-12', { de: german })],
      'de',
    );
    const file = JSON.parse(JSON.stringify(encodeCatalog(catalog, {})));

    expect(decodeCatalog(file)[0]?.printedIn).toEqual(['m20', 'lea']);
  });
});
