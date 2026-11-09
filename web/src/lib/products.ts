import type { PackKind, Product } from './data/schema';

/** Regular products first: the play box before the collector box, the plain bundle first. */
const SUBTYPE_ORDER = ['play', 'default', 'set', 'draft', 'collector', 'gift_bundle', 'premium'];

export function sortProducts(products: readonly Product[]): Product[] {
  const rank = (p: Product) => {
    const index = SUBTYPE_ORDER.indexOf(p.subtype ?? '');
    return index === -1 ? SUBTYPE_ORDER.length : index;
  };
  return products.toSorted((a, b) => rank(a) - rank(b) || (a.price ?? 0) - (b.price ?? 0));
}

const normalizeWord = (word: string) => word.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Product name without the set name, as shown next to a set:
 * "Avatar The Last Airbender Commanders Bundle" -> "Commanders Bundle",
 * "Final Fantasy Collector Booster Box" -> "Collector" (inside the "Booster box" row).
 */
export function shortProductName(product: Product, setName: string): string {
  // Apostrophes are dropped, not split on: "Marvel's" and "Marvels" are the same word.
  const setWords = new Set(setName.split(/[\s:-]+/).map(normalizeWord));
  let rest = product.name
    .split(/\s+/)
    .filter((word) => !setWords.has(normalizeWord(word)))
    .join(' ');
  if (product.category === 'booster_box') {
    rest = rest.replace(/\s*(Booster\s+)?(Box|Display)$/i, '').trim();
  }
  return rest || (product.category === 'booster_box' ? 'Play' : 'Bundle');
}

/** How booster boxes are called on the site, independent of the set. */
const BOX_LABELS: Record<string, string> = {
  play: 'Booster Box',
  set: 'Set Booster Box',
  draft: 'Draft Booster Box',
  collector: 'Collector Box',
  jumpstart: 'Jumpstart Box',
};

/** One line per product: "Booster Box", "Collector Box", "Bundle", "Commanders Bundle". */
export function productLabel(product: Product, setName: string): string {
  if (product.category === 'booster_box') {
    return BOX_LABELS[product.subtype ?? ''] ?? `${shortProductName(product, setName)} Box`;
  }
  return shortProductName(product, setName);
}

export type PackLabel = (kind: PackKind) => string;

/** "6 Play Booster + 2 Collector Booster + 1 box topper". */
export function contentsLabel(product: Product, label: PackLabel): string {
  return product.contents.map((item) => `${item.count} ${label(item.kind)}`).join(' + ');
}
