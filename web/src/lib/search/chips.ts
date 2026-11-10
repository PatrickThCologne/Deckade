/**
 * Shows how the search read a request (lib/search/query.ts): one short label per filter, so a
 * visitor sees at once what was understood and what was left out.
 */
import type { CardType, SortKey } from '../cards/sort';
import type { Keyword } from './keywords';
import { type SearchQuery, understood } from './query';

export interface ChipLabels {
  readonly colors: Readonly<Record<string, string>>;
  readonly types: Readonly<Record<CardType, string>>;
  readonly keywords: Readonly<Record<Keyword, string>>;
  readonly sorts: Readonly<Record<SortKey, string>>;
  readonly colorless: string;
  /** '{colors}' is replaced */
  readonly exactly: string;
  /** '{n}' is replaced */
  readonly manaMax: string;
  readonly manaExact: string;
  /** '{price}' is replaced */
  readonly priceMax: string;
  /** '{words}' is replaced */
  readonly name: string;
  readonly ignored: string;
}

export interface Chip {
  readonly text: string;
  /** Words the search did not use */
  readonly ignored?: true;
}

export function queryChips(
  query: SearchQuery,
  labels: ChipLabels,
  price: (euro: number) => string,
): Chip[] {
  if (!understood(query)) {
    const words = query.unknown.join(' ');
    return words ? [{ text: labels.name.replace('{words}', words) }] : [];
  }
  const chips: Chip[] = [];
  if (query.exactColors && query.colors === '') {
    chips.push({ text: labels.colorless });
  } else if (query.colors) {
    const names = [...query.colors].map((color) => labels.colors[color] ?? color).join(' + ');
    chips.push({ text: query.exactColors ? labels.exactly.replace('{colors}', names) : names });
  }
  for (const type of query.types) chips.push({ text: labels.types[type] });
  for (const keyword of query.keywords) chips.push({ text: labels.keywords[keyword] });
  if (query.maxMana !== null) {
    const label = query.minMana === query.maxMana ? labels.manaExact : labels.manaMax;
    chips.push({ text: label.replace('{n}', String(query.maxMana)) });
  }
  if (query.maxPrice !== null) {
    chips.push({ text: labels.priceMax.replace('{price}', price(query.maxPrice)) });
  }
  if (query.sort) chips.push({ text: labels.sorts[query.sort] });
  if (query.unknown.length > 0) {
    chips.push({
      text: labels.ignored.replace('{words}', query.unknown.join(', ')),
      ignored: true,
    });
  }
  return chips;
}
