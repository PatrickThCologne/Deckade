import type { Locale } from '../../config/site';
import { buildCatalog, type CatalogCard, type Printing } from '../cards/catalog';
import { inOverview } from '../timeline';
import {
  type Card,
  CardFileSchema,
  type FormatId,
  type GameFormat,
  type MtgSet,
  type Snapshot,
  SnapshotSchema,
  type StandardSet,
} from './schema';
import rawSnapshot from '../../data/generated/snapshot.json';

const cardFiles = import.meta.glob<unknown>('../../data/generated/cards/*.json', {
  eager: true,
  import: 'default',
});

export const snapshot: Snapshot = SnapshotSchema.parse(rawSnapshot);

/** Main sets, newest first; bonus sheets such as "The Big Score" are shown with their parent. */
export function mainSets(data: Snapshot = snapshot): MtgSet[] {
  const codes = new Set(data.sets.map((s) => s.code));
  return data.sets.filter((s) => !s.parentCode || !codes.has(s.parentCode));
}

export function isStandardSet(set: MtgSet): set is StandardSet {
  return set.standard !== null;
}

/** Main sets that are in Standard or about to be. */
export function standardSets(data: Snapshot = snapshot): StandardSet[] {
  return mainSets(data).filter(isStandardSet);
}

export function childSets(parent: MtgSet, data: Snapshot = snapshot): MtgSet[] {
  return data.sets.filter((s) => s.parentCode === parent.code);
}

export function cardsOf(setCode: string): Card[] {
  const file = cardFiles[`../../data/generated/cards/${setCode}.json`];
  return file ? CardFileSchema.parse(file).cards : [];
}

/** The cards shown on a set's page: its own plus those of its bonus sheets, each card once. */
export function setCards(set: MtgSet, data: Snapshot = snapshot): Card[] {
  const seen = new Set<string>();
  return [set, ...childSets(set, data)]
    .flatMap((s) => cardsOf(s.code))
    .filter((card) => !seen.has(card.oracleId) && seen.add(card.oracleId));
}

export function formatById(id: FormatId, data: Snapshot = snapshot): GameFormat {
  const format = data.formats.find((f) => f.id === id);
  if (!format) throw new Error(`Format "${id}" is missing in the snapshot`);
  return format;
}

/** Main sets of the overview ("All sets"), newest first. */
export function overviewSets(data: Snapshot = snapshot): MtgSet[] {
  return mainSets(data).filter((set) => inOverview(set, data.generatedAt));
}

const catalogs = new Map<Locale, CatalogCard[]>();

/** Every card of the overview's sets once, for the "All cards" tab. */
export function cardCatalog(locale: Locale): CatalogCard[] {
  let catalog = catalogs.get(locale);
  if (!catalog) {
    const printings: Printing[] = overviewSets().flatMap((set) =>
      setCards(set).map((card) => ({ setCode: set.code, releasedAt: set.releasedAt, card })),
    );
    catalog = buildCatalog(printings, locale);
    catalogs.set(locale, catalog);
  }
  return catalog;
}
