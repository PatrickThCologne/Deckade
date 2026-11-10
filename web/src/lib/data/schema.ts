/**
 * Data contract with the pipeline (pipeline/src/rotation_radar/snapshot.py).
 * Both JSON files are validated at build time: a broken snapshot fails the build
 * instead of shipping a half-empty page.
 */
import { z } from 'astro/zod';

const isoDate = z.iso.date();

export const packKinds = [
  'play',
  'set',
  'draft',
  'jumpstart',
  'collector',
  'booster',
  'bonus',
  'topper',
] as const;

const PackCountSchema = z.object({
  count: z.number().int().positive(),
  kind: z.enum(packKinds),
});

const ProductSchema = z.object({
  name: z.string(),
  category: z.enum(['bundle', 'booster_box']),
  subtype: z.string().nullable(),
  contents: z.array(PackCountSchema),
  price: z.number().nullable(),
  averageSale: z.number().nullable(),
  pricePerPack: z.number().nullable(),
});

const SetRotationSchema = z.object({
  wave: z.number().int().nonnegative().nullable(),
  earliest: isoDate.nullable(),
  certain: z.boolean(),
  legalUntilAtLeast: z.number().int().nullable(),
});

export const formatIds = ['standard', 'pioneer', 'modern', 'commander'] as const;

const StandardInfoSchema = z.object({
  status: z.enum(['upcoming', 'legal']),
  rotation: SetRotationSchema,
});

const MtgSetSchema = z.object({
  code: z.string().min(2),
  name: z.string(),
  releasedAt: isoDate,
  setType: z.string(),
  parentCode: z.string().nullable(),
  cardCount: z.number().int().nonnegative(),
  iconUrl: z.string().nullable(),
  packImage: z.string().nullable(),
  /** Formats the set is legal in; Standard only while it is in Standard. */
  formats: z.array(z.enum(formatIds)),
  /** Present while the set is in Standard or about to enter it. */
  standard: StandardInfoSchema.nullable(),
  products: z.array(ProductSchema),
});

const RotationEstimateSchema = z.object({
  day: isoDate.nullable(),
  certainty: z.enum(['official', 'estimated']),
  triggerSet: z.string().nullable(),
});

const BannedCardSchema = z.object({
  name: z.string(),
  colors: z.string().regex(/^W?U?B?R?G?$/),
  manaCost: z.string(),
  imageNormal: z.url().nullable(),
  scryfallUrl: z.url(),
});

const FormatSchema = z.object({
  id: z.enum(formatIds),
  name: z.string(),
  rotates: z.boolean(),
  infoUrl: z.url(),
  banlistUrl: z.url(),
  banned: z.array(BannedCardSchema),
});

const FeaturedArtSchema = z.object({
  cardName: z.string(),
  setCode: z.string(),
  setName: z.string(),
  artist: z.string(),
  imageUrl: z.url(),
  /** Main colour in degrees (0 red, 120 green, 240 blue); null for grey artwork */
  hue: z.number().int().min(0).max(359).nullable(),
});

export const SnapshotSchema = z.object({
  schemaVersion: z.literal(6),
  generatedAt: z.string(),
  rotation: RotationEstimateSchema,
  rules: z.object({
    rotatingSetCount: z.number().int().positive(),
    sourceUrl: z.url(),
    specialRuleSources: z.record(z.string(), z.string()),
  }),
  sources: z.object({
    playRateFrom: isoDate.nullable(),
    playRateTo: isoDate.nullable(),
    playRateDecks: z.number().int().nonnegative(),
    playRateTournaments: z.number().int().nonnegative(),
  }),
  sets: z.array(MtgSetSchema),
  formats: z.array(FormatSchema),
  featuredArt: z.array(FeaturedArtSchema),
});

/** How a card is printed in another language (pipeline: Translation). */
const TranslationSchema = z.object({
  name: z.string(),
  text: z.string(),
  imageSmall: z.url().nullable(),
  imageNormal: z.url().nullable(),
  scryfallUrl: z.url(),
});

const CardSchema = z.object({
  oracleId: z.string(),
  name: z.string(),
  colors: z.string().regex(/^W?U?B?R?G?$/),
  manaCost: z.string(),
  cmc: z.number().nonnegative(),
  typeLine: z.string(),
  text: z.string(),
  rarity: z.string(),
  isLand: z.boolean(),
  banned: z.boolean(),
  imageSmall: z.url().nullable(),
  imageNormal: z.url().nullable(),
  scryfallUrl: z.url(),
  price: z.number().nullable(),
  playShare: z.number().nullable(),
  averageCopies: z.number().nullable(),
  /** German printing of the same set; null if the set was not printed in German. */
  de: TranslationSchema.nullable(),
});

export const CardFileSchema = z.object({
  setCode: z.string(),
  cards: z.array(CardSchema),
});

export type Snapshot = z.infer<typeof SnapshotSchema>;
export type RotationEstimate = Snapshot['rotation'];
export type MtgSet = z.infer<typeof MtgSetSchema>;
export type StandardInfo = z.infer<typeof StandardInfoSchema>;
export type SetRotation = StandardInfo['rotation'];
/** A set that is in Standard or about to be. */
export type StandardSet = MtgSet & { standard: StandardInfo };
export type Product = z.infer<typeof ProductSchema>;
export type PackKind = (typeof packKinds)[number];
export type Card = z.infer<typeof CardSchema>;
export type GameFormat = z.infer<typeof FormatSchema>;
export type FormatId = (typeof formatIds)[number];
export type BannedCard = z.infer<typeof BannedCardSchema>;
export type FeaturedArt = z.infer<typeof FeaturedArtSchema>;
