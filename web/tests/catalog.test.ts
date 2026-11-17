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

  // Token cards come from The List and token sets; they are no cards of a deck
  it('leaves token cards out, by the word "Token" in the type line', () => {
    const catalog = buildCatalog(
      [
        printing('plst', '2024-01-01', {
          oracleId: 'angel-token',
          name: 'Angel',
          typeLine: 'Token Creature — Angel',
          text: 'Flying',
          price: 1.36,
        }),
        printing('plst', '2024-01-01', {
          oracleId: 'ashaya',
          name: 'Ashaya, the Awoken World',
          typeLine: 'Token Legendary Creature — Elemental',
          text: '',
        }),
        printing('plst', '2024-01-01', {
          oracleId: 'tentacle',
          name: 'Tentacle',
          typeLine: 'Token Creature — Tentacle',
          text: '',
        }),
        printing('plst', '2024-01-01', {
          oracleId: 'treasure',
          name: 'Treasure',
          typeLine: 'Token Artifact — Treasure',
          text: '{T}, Sacrifice this token: Add one mana of any color.',
        }),
        printing('m19', '2018-07-13', {
          oracleId: 'sprout',
          name: 'Sprout',
          typeLine: 'Instant',
          text: 'Create a 1/1 green Saproling creature token.',
        }),
        printing('m20', '2019-07-12'),
      ],
      'en',
    );
    expect(catalog.map((entry) => entry.name)).toEqual(['Sprout', 'Serra Angel']);
    expect(encodeCatalog(catalog, {}).creatureTypes).toEqual(['angel']);
  });

  it('knows every type of the card and its main type', () => {
    const [artifactCreature] = buildCatalog(
      [printing('bro', '2022-11-18', { typeLine: 'Artifact Creature — Golem' })],
      'en',
    );
    expect(artifactCreature).toMatchObject({ type: 'creature', types: ['creature', 'artifact'] });
  });

  it('knows the creature types of the type line, lower case, of every face', () => {
    const catalog = buildCatalog(
      [
        printing('m19', '2018-07-13', {
          oracleId: 'elf',
          typeLine: 'Legendary Creature — Elf Druid',
        }),
        printing('m19', '2018-07-13', { oracleId: 'instant', typeLine: 'Instant' }),
        printing('ori', '2015-07-17', {
          oracleId: 'jace',
          typeLine: 'Legendary Creature — Human Wizard // Legendary Planeswalker — Jace',
        }),
        printing('mid', '2021-09-24', {
          oracleId: 'board',
          typeLine: 'Artifact // Creature — Spirit',
        }),
      ],
      'en',
    );
    expect(catalog.map((entry) => entry.creatureTypes)).toEqual([
      ['elf', 'druid'],
      [],
      ['human', 'wizard'],
      ['spirit'],
    ]);
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

  it('keeps the synergies read from the English rules text', () => {
    const catalog = buildCatalog(
      [printing('m20', '2019-07-12', { text: 'Sacrifice another creature: Create a Food token.' })],
      'en',
    );
    const file = JSON.parse(JSON.stringify(encodeCatalog(catalog, {})));

    expect(catalog[0]?.synergies).toEqual(['artifacts', 'tokens', 'sacrifice']);
    expect(decodeCatalog(file)[0]?.synergies).toEqual(['artifacts', 'tokens', 'sacrifice']);
  });

  it('reads the roles of a card from the English rules text', () => {
    const [elves] = buildCatalog(
      [
        printing('m19', '2018-07-13', {
          name: 'Llanowar Elves',
          typeLine: 'Creature — Elf Druid',
          text: '{T}: Add {G}.',
        }),
      ],
      'en',
    );
    expect(elves?.roles).toEqual(['ramp']);
  });

  it('keeps the roles after the tribes, one digit per role', () => {
    const catalog = buildCatalog(
      [
        printing('m19', '2018-07-13', { text: '{T}: Add {G}.\nWhen this enters, draw two cards.' }),
        printing('m20', '2019-07-12', { oracleId: 'other', name: 'Other', text: 'Vigilance' }),
      ],
      'en',
    );
    const file = JSON.parse(JSON.stringify(encodeCatalog(catalog, {})));

    expect(catalog.map((entry) => entry.roles)).toEqual([['ramp', 'draw'], []]);
    expect(file.cards.map((encoded: unknown[]) => encoded[17])).toEqual(['04', '']);
    expect(decodeCatalog(file).map((entry) => entry.roles)).toEqual([['ramp', 'draw'], []]);
  });

  it('reads files without roles as cards without roles', () => {
    const catalog = buildCatalog([printing('m19', '2018-07-13', { text: '{T}: Add {G}.' })], 'en');
    const file = JSON.parse(JSON.stringify(encodeCatalog(catalog, {})));
    const older = { ...file, cards: file.cards.map((encoded: unknown[]) => encoded.slice(0, 17)) };

    expect(decodeCatalog(older)[0]?.roles).toEqual([]);
  });

  it('keeps the creature types as the last field, separated by spaces', () => {
    const catalog = buildCatalog(
      [
        printing('m19', '2018-07-13', { name: 'Llanowar Elves', typeLine: 'Creature — Elf Druid' }),
        printing('m20', '2019-07-12', { oracleId: 'other', name: 'Shock', typeLine: 'Instant' }),
      ],
      'en',
    );
    const file = JSON.parse(JSON.stringify(encodeCatalog(catalog, {})));

    expect(file.cards.map((encoded: unknown[]) => encoded.at(-1))).toEqual(['elf druid', '']);
    expect(decodeCatalog(file).map((entry) => entry.creatureTypes)).toEqual([['elf', 'druid'], []]);
  });

  it('reads files without creature types as cards without creature types', () => {
    const catalog = buildCatalog(
      [printing('m19', '2018-07-13', { typeLine: 'Creature — Elf Druid', text: '{T}: Add {G}.' })],
      'en',
    );
    const file = JSON.parse(JSON.stringify(encodeCatalog(catalog, {})));
    const older = { ...file, cards: file.cards.map((encoded: unknown[]) => encoded.slice(0, 18)) };

    expect(decodeCatalog(older)[0]?.creatureTypes).toEqual([]);
    expect(decodeCatalog(older)[0]?.roles).toEqual(['ramp']);
  });

  it('lists every creature type of the cards once, sorted, for the search', () => {
    const catalog = buildCatalog(
      [
        printing('m19', '2018-07-13', { oracleId: 'llanowar', typeLine: 'Creature — Elf Druid' }),
        printing('m20', '2019-07-12', { oracleId: 'guide', typeLine: 'Creature — Goblin Scout' }),
        printing('m21', '2020-07-03', { oracleId: 'mystic', typeLine: 'Creature — Elf Druid' }),
        printing('m21', '2020-07-03', { oracleId: 'shock', typeLine: 'Instant' }),
      ],
      'en',
    );
    const file = encodeCatalog(catalog, {});

    expect(file.creatureTypes).toEqual(['druid', 'elf', 'goblin', 'scout']);
    expect(JSON.parse(JSON.stringify(file)).creatureTypes).toEqual(file.creatureTypes);
  });

  it('lists no creature types for cards without any', () => {
    const catalog = buildCatalog([printing('m21', '2020-07-03', { typeLine: 'Instant' })], 'en');

    expect(encodeCatalog(catalog, {}).creatureTypes).toEqual([]);
    expect(encodeCatalog([], {}).creatureTypes).toEqual([]);
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
