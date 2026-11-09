import type {
  FormatId,
  MtgSet,
  Product,
  RotationEstimate,
  SetRotation,
  StandardSet,
} from '../src/lib/data/schema';

export const ESTIMATED: RotationEstimate = {
  day: '2027-01-29',
  certainty: 'estimated',
  triggerSet: 'nau',
};

export const OFFICIAL: RotationEstimate = { ...ESTIMATED, certainty: 'official' };

export function rotation(overrides: Partial<SetRotation> = {}): SetRotation {
  return { wave: 0, earliest: '2027-01-29', certain: true, legalUntilAtLeast: null, ...overrides };
}

export function mtgSet(
  code: string,
  releasedAt: string,
  formats: FormatId[],
  overrides: Partial<MtgSet> = {},
): MtgSet {
  return {
    code,
    name: code.toUpperCase(),
    releasedAt,
    setType: 'expansion',
    parentCode: null,
    cardCount: 0,
    iconUrl: null,
    packImage: null,
    formats,
    standard: null,
    products: [],
    ...overrides,
  };
}

export function standardSet(
  code: string,
  releasedAt: string,
  setRotation: SetRotation,
  status: 'legal' | 'upcoming' = 'legal',
): StandardSet {
  return {
    ...mtgSet(
      code,
      releasedAt,
      status === 'legal' ? ['standard', 'pioneer', 'modern', 'commander'] : [],
    ),
    standard: { status, rotation: setRotation },
  };
}

export function product(name: string, overrides: Partial<Product> = {}): Product {
  return {
    name,
    category: 'booster_box',
    subtype: 'play',
    contents: [{ count: 30, kind: 'play' }],
    price: 120,
    averageSale: null,
    pricePerPack: 4,
    ...overrides,
  };
}
