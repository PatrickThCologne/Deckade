/**
 * The "All cards" tab: every card once, however many sets printed it. About 30,000 table rows
 * would make the page far too big, so the page loads the list as a compact JSON file
 * (pages/[lang]/cards.json.ts) and filters it in the browser (scripts/all-cards.ts).
 */
import type { Locale } from '../../config/site';
import type { Card } from '../data/schema';
import { cardKeywords, type Keyword, KEYWORDS } from '../search/keywords';
import { cardAnswers } from '../search/answers';
import { cardRoles, type Role, ROLES } from '../search/roles';
import { cardSynergies, type Synergy, SYNERGIES } from '../search/synergies';
import { cardTribes, creatureTypes } from '../search/tribes';
import { shownCard } from './local';
import {
  CARD_TYPES,
  type CardType,
  cardTypes,
  isCardType,
  mainType,
  type SortableCard,
} from './sort';

/** A card as printed in one set. */
export interface Printing {
  readonly setCode: string;
  readonly releasedAt: string;
  readonly card: Card;
}

export interface CatalogCard extends SortableCard {
  /** The English name on German pages, so the search finds both; empty if they are the same. */
  readonly altName: string;
  readonly manaCost: string;
  readonly types: readonly CardType[];
  /** Keyword abilities, for the search tab (lib/search). */
  readonly keywords: readonly Keyword[];
  /** What the rules text works with ("Synergie mit Artefakten"), for the search tab. */
  readonly synergies: readonly Synergy[];
  /** What the rules text fights ("Konter gegen Flieger"), over the same themes. */
  readonly answers: readonly Synergy[];
  /** Creature types the rules text works with, lower case ("elemental"). */
  readonly tribes: readonly string[];
  /** What the card does for its deck ("ramp", "removal"), read from the rules text. */
  readonly roles: readonly Role[];
  readonly banned: boolean;
  /** The set of the printing shown: the newest one, on German pages the newest German one. */
  readonly setCode: string;
  /** Every set that printed the card, for the set filter: the shown one first, then newest first. */
  readonly printedIn: readonly string[];
  readonly imageNormal: string | null;
  readonly scryfallUrl: string;
}

/**
 * One entry per card (oracle id). The price is that of the cheapest printing, as in the
 * set tables; the play share is the highest one, since only Standard sets have one.
 */
export function buildCatalog(printings: readonly Printing[], locale: Locale): CatalogCard[] {
  const byCard = new Map<string, Printing[]>();
  for (const printing of printings) {
    const list = byCard.get(printing.card.oracleId);
    if (list) list.push(printing);
    else byCard.set(printing.card.oracleId, [printing]);
  }
  // Every creature type of any card, so the rules text is read against real types only
  const known = new Set(
    printings.flatMap((p) => creatureTypes(p.card.typeLine).map((type) => type.toLowerCase())),
  );
  return [...byCard.values()].map((list) => catalogCard(list, locale, known));
}

function catalogCard(
  printings: readonly Printing[],
  locale: Locale,
  known: ReadonlySet<string>,
): CatalogCard {
  const newestFirst = printings.toSorted((a, b) => b.releasedAt.localeCompare(a.releasedAt));
  // Older sets often exist in English only; German pages still prefer a German printing.
  const printing =
    (locale === 'de' ? newestFirst.find((p) => p.card.de) : undefined) ?? newestFirst[0]!;
  const { card } = printing;
  const shown = shownCard(card, locale);
  const prices = printings.flatMap((p) => (p.card.price == null ? [] : [p.card.price]));
  const shares = printings.flatMap((p) => (p.card.playShare == null ? [] : [p.card.playShare]));
  return {
    name: shown.name,
    altName: shown.name === card.name ? '' : card.name,
    colors: card.colors,
    manaCost: card.manaCost,
    cmc: card.cmc,
    type: mainType(card.typeLine),
    types: cardTypes(card.typeLine),
    keywords: cardKeywords(card.text),
    synergies: cardSynergies(card.text, card.name),
    answers: cardAnswers(card.text, card.name),
    tribes: cardTribes(card.text, card.name, known),
    roles: cardRoles(card.text, card.name, card.isLand, card.typeLine),
    price: prices.length > 0 ? Math.min(...prices) : null,
    playShare: shares.length > 0 ? Math.max(...shares) : null,
    isLand: card.isLand,
    banned: printings.some((p) => p.card.banned),
    setCode: printing.setCode,
    printedIn: [...new Set([printing, ...newestFirst].map((p) => p.setCode))],
    imageNormal: shown.imageNormal,
    scryfallUrl: shown.scryfallUrl,
  };
}

// The JSON file: one array per card instead of objects, and the URLs shortened to what
// cannot be derived. That roughly halves the file.

const IMAGE_BASE = 'https://cards.scryfall.io/normal/';
const SCRYFALL_BASE = 'https://scryfall.com/card/';

type EncodedCard = [
  name: string,
  altName: string,
  colors: string,
  manaCost: string,
  cmc: number,
  /** Indexes into CARD_TYPES: the main type first, then every type of the card. */
  types: string,
  price: number | null,
  playShare: number | null,
  /** 1 = land, 2 = banned */
  flags: number,
  setCode: string,
  image: string,
  scryfall: string,
  /** The other sets that printed the card, separated by spaces; usually empty. */
  otherSets: string,
  /** Indexes into KEYWORDS, one base-36 digit each; usually empty. */
  keywords: string,
  /** Indexes into SYNERGIES, the same way. */
  synergies: string,
  /** What the card fights: indexes into SYNERGIES as well. */
  answers: string,
  /** Creature types the card works with, separated by spaces; usually empty. */
  tribes: string,
  /** Indexes into ROLES, one base-36 digit each; last, so older files still read. */
  roles: string,
];

export interface CatalogFile {
  /** Set names by code, for the set column. */
  readonly sets: Readonly<Record<string, string>>;
  readonly cards: readonly EncodedCard[];
}

const strip = (url: string, base: string) => (url.startsWith(base) ? url.slice(base.length) : url);
const expand = (path: string, base: string) => (/^https?:\/\//.test(path) ? path : base + path);

/** 'front/f/2/f21b…jpg?178…' -> 'f21b…?178…': the folders repeat the id's first characters. */
function shortImage(url: string): string {
  const path = strip(url, IMAGE_BASE);
  const match = /^front\/(\w)\/(\w)\/(\1\2[\w-]*)\.jpg(\?\d+)?$/.exec(path);
  return match ? match[3]! + (match[4] ?? '') : path;
}

function fullImage(short: string): string {
  if (short.includes('/')) return expand(short, IMAGE_BASE);
  return `${IMAGE_BASE}front/${short[0]}/${short[1]}/${short.replace(/(\?|$)/, '.jpg$1')}`;
}

/**
 * 'https://scryfall.com/card/ecl/116/de/vergeltende-…?utm_source=api' -> 'ecl/116/de'.
 * Scryfall forwards the short form to the full card page.
 */
function shortScryfall(url: string): string {
  if (!url.startsWith(SCRYFALL_BASE)) return url;
  const parts = strip(url, SCRYFALL_BASE).split('?')[0]!.split('/');
  return parts.slice(0, parts.length >= 4 ? 3 : 2).join('/');
}

export function encodeCatalog(
  cards: readonly CatalogCard[],
  sets: Readonly<Record<string, string>>,
): CatalogFile {
  return {
    sets,
    cards: cards.map((card) => [
      card.name,
      card.altName,
      card.colors,
      card.manaCost,
      card.cmc,
      [card.type, ...card.types].map((type) => CARD_TYPES.indexOf(type)).join(''),
      card.price,
      card.playShare,
      (card.isLand ? 1 : 0) | (card.banned ? 2 : 0),
      card.setCode,
      card.imageNormal ? shortImage(card.imageNormal) : '',
      shortScryfall(card.scryfallUrl),
      card.printedIn.filter((code) => code !== card.setCode).join(' '),
      card.keywords.map((keyword) => KEYWORDS.indexOf(keyword).toString(36)).join(''),
      card.synergies.map((synergy) => SYNERGIES.indexOf(synergy).toString(36)).join(''),
      card.answers.map((theme) => SYNERGIES.indexOf(theme).toString(36)).join(''),
      card.tribes.join(' '),
      card.roles.map((role) => ROLES.indexOf(role).toString(36)).join(''),
    ]),
  };
}

export function decodeCatalog(file: CatalogFile): CatalogCard[] {
  return file.cards.map(
    ([
      name,
      altName,
      colors,
      manaCost,
      cmc,
      types,
      price,
      playShare,
      flags,
      setCode,
      image,
      url,
      otherSets,
      keywords = '',
      synergies = '',
      answers = '',
      tribes = '',
      roles = '',
    ]) => {
      const [main, ...all] = [...types].map((index) => CARD_TYPES[Number(index)]);
      return {
        name,
        altName,
        colors,
        manaCost,
        cmc,
        type: isCardType(main) ? main : 'other',
        types: all.filter(isCardType),
        keywords: [...keywords].flatMap((digit) => KEYWORDS[parseInt(digit, 36)] ?? []),
        synergies: [...synergies].flatMap((digit) => SYNERGIES[parseInt(digit, 36)] ?? []),
        answers: [...answers].flatMap((digit) => SYNERGIES[parseInt(digit, 36)] ?? []),
        tribes: tribes ? tribes.split(' ') : [],
        roles: [...roles].flatMap((digit) => ROLES[parseInt(digit, 36)] ?? []),
        price,
        playShare,
        isLand: (flags & 1) !== 0,
        banned: (flags & 2) !== 0,
        setCode,
        printedIn: [setCode, ...(otherSets ? otherSets.split(' ') : [])],
        imageNormal: image ? fullImage(image) : null,
        scryfallUrl: expand(url, SCRYFALL_BASE),
      };
    },
  );
}
