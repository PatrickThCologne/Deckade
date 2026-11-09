/** Sorting and filtering of the card table. Shared by the page script and the tests. */

export const SORT_KEYS = [
  'played',
  'value-desc',
  'value-asc',
  'mana-asc',
  'mana-desc',
  'type',
  'name',
] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** Main card types in the order of a decklist; lands last, as in the mana value sort. */
export const CARD_TYPES = [
  'creature',
  'planeswalker',
  'battle',
  'instant',
  'sorcery',
  'artifact',
  'enchantment',
  'land',
  'other',
] as const;
export type CardType = (typeof CARD_TYPES)[number];

export interface SortableCard {
  readonly name: string;
  readonly colors: string;
  readonly cmc: number;
  readonly price: number | null;
  readonly playShare: number | null;
  readonly isLand: boolean;
  readonly type: CardType;
}

export function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}

export function isCardType(value: string | undefined): value is CardType {
  return (CARD_TYPES as readonly (string | undefined)[]).includes(value);
}

/**
 * The main type of the front face, e.g. 'Legendary Artifact Creature — Golem' is a creature.
 * Anything with "Land" counts as a land (Dryad Arbor, artifact lands), like isLand does.
 */
export function mainType(typeLine: string): CardType {
  const front = typeLine.split(' // ')[0] ?? '';
  const words = (front.split('—')[0] ?? '').toLowerCase().split(/\s+/);
  if (words.includes('land')) return 'land';
  return CARD_TYPES.find((type) => words.includes(type)) ?? 'other';
}

/** Unknown prices always go to the end, whichever direction is chosen. */
function byPrice(a: SortableCard, b: SortableCard, direction: 1 | -1): number {
  if (a.price == null || b.price == null) return a.price == null ? (b.price == null ? 0 : 1) : -1;
  return (a.price - b.price) * direction;
}

/** Lands have mana value 0 but are not "cheap spells": they go last. */
function byManaValue(a: SortableCard, b: SortableCard, direction: 1 | -1): number {
  return Number(a.isLand) - Number(b.isLand) || (a.cmc - b.cmc) * direction;
}

/** One collator for all comparisons; localeCompare would set one up each time. */
const collator = new Intl.Collator();

export function compareCards(a: SortableCard, b: SortableCard, key: SortKey): number {
  const byName = collator.compare(a.name, b.name);
  switch (key) {
    case 'played':
      return (b.playShare ?? 0) - (a.playShare ?? 0) || byPrice(a, b, -1) || byName;
    case 'value-desc':
      return byPrice(a, b, -1) || byName;
    case 'value-asc':
      return byPrice(a, b, 1) || byName;
    case 'mana-asc':
      return byManaValue(a, b, 1) || byName;
    case 'mana-desc':
      return byManaValue(a, b, -1) || byName;
    case 'type':
      return CARD_TYPES.indexOf(a.type) - CARD_TYPES.indexOf(b.type) || byName;
    case 'name':
      return byName;
  }
}

/**
 * A card matches the selected colours when it has colours and all of them are selected,
 * i.e. it fits into a deck of exactly these colours. No selection shows everything.
 */
export function matchesColors(cardColors: string, selected: string): boolean {
  if (!selected) return true;
  return cardColors.length > 0 && [...cardColors].every((color) => selected.includes(color));
}

/** Every main type on any face: an artifact creature is both, an instant // land MDFC too. */
export function cardTypes(typeLine: string): CardType[] {
  const words = typeLine
    .split(' // ')
    .flatMap((face) => (face.split('—')[0] ?? '').toLowerCase().split(/\s+/));
  return CARD_TYPES.filter((type) => words.includes(type));
}

/** A card matches when it has any of the selected types; no selection shows everything. */
export function matchesType(types: readonly CardType[], selected: ReadonlySet<CardType>): boolean {
  return selected.size === 0 || types.some((type) => selected.has(type));
}

/** Set filter of the "All cards" tab: any set that printed the card counts. */
export function matchesSets(
  printedIn: readonly string[] | undefined,
  selected: ReadonlySet<string>,
): boolean {
  return selected.size === 0 || (printedIn ?? []).some((code) => selected.has(code));
}

/** Mana value choices of the filter; the last one collects everything from 7 up. */
export const MANA_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7+'] as const;
export type ManaValue = (typeof MANA_VALUES)[number];

export function isManaValue(value: string | undefined): value is ManaValue {
  return (MANA_VALUES as readonly (string | undefined)[]).includes(value);
}

/**
 * A card matches when its mana value is any of the selected ones. Lands have mana value 0
 * but are not spells you cast, so an active mana value filter hides them.
 */
export function matchesManaValue(
  card: Pick<SortableCard, 'cmc' | 'isLand'>,
  selected: ReadonlySet<ManaValue>,
): boolean {
  if (selected.size === 0) return true;
  if (card.isLand) return false;
  return [...selected].some((value) =>
    value === '7+' ? card.cmc >= 7 : card.cmc === Number(value),
  );
}

export function normalizeForSearch(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** The words of a search query, normalized like the texts they are looked up in. */
export function searchWords(query: string): string[] {
  return normalizeForSearch(query).split(/\s+/).filter(Boolean);
}

/**
 * Every word has to appear somewhere in the (normalized) text, in any order:
 * 'flying lifelink' finds cards with both, 'fly' also finds 'Flying'.
 */
export function matchesWords(normalizedText: string, words: readonly string[]): boolean {
  return words.every((word) => normalizedText.includes(word));
}

export function matchesQuery(text: string, query: string): boolean {
  return matchesWords(normalizeForSearch(text), searchWords(query));
}
