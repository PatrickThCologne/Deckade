/**
 * The search tab reads a request in plain German or English ("günstige rote Kreaturen mit
 * Eile") as filters over the card list: colours, card types, keyword abilities, mana value,
 * a price limit and a sort order. It runs in the browser without a model, so it needs no
 * server and the request never leaves the page (docs/adr/0002-natural-language-search.md).
 * The rules follow the C# parser in api/ (RuleBasedQueryParser), which has the same tests.
 */
import { type CardType, matchesWords, normalizeForSearch, type SortKey } from '../cards/sort';
import { KEYWORDS, type Keyword } from './keywords';

export interface SearchQuery {
  /** Colours in WUBRG order the cards must have. */
  readonly colors: string;
  /** The cards have exactly `colors` and no other ("mono-grün", "Selesnya", "farblos"). */
  readonly exactColors: boolean;
  /** Any of these types. */
  readonly types: readonly CardType[];
  /** All of these keywords. */
  readonly keywords: readonly Keyword[];
  readonly minMana: number | null;
  readonly maxMana: number | null;
  /** Euro, the price of the cheapest printing. */
  readonly maxPrice: number | null;
  readonly sort: SortKey | null;
  /** Words that are none of the above and no filler word. */
  readonly unknown: readonly string[];
}

/** What the search looks at; the cards of the "All cards" list have all of it. */
export interface SearchableCard {
  readonly colors: string;
  readonly types: readonly CardType[];
  readonly keywords: readonly Keyword[];
  readonly cmc: number;
  readonly isLand: boolean;
  readonly price: number | null;
  /** Names, normalized (lib/cards/sort.ts), for requests that name no filter at all. */
  readonly search: string;
}

// All patterns run on the normalized request: lower case and without accents, so "grün" is
// "grun" and "höchstens" is "hochstens". A word must not be part of a longer word, so "rot"
// does not match "Rotation".
const word = (words: string) => new RegExp(`(?<![\\p{L}\\d])(?:${words})(?![\\p{L}])`, 'gu');
const ending = '(?:e|en|er|es|em)?';

const COLOR_WORDS: readonly (readonly [string, RegExp])[] = [
  ['W', word(`wei(?:ß|ss)${ending}|white`)],
  ['U', word(`blau${ending}|blue`)],
  ['B', word(`schwarz${ending}|black`)],
  ['R', word(`rot${ending}|red`)],
  ['G', word(`grun${ending}|green`)],
];

/** Two-colour groups have fixed names in Magic; they mean exactly these two colours. */
const GUILDS: Readonly<Record<string, string>> = {
  azorius: 'WU',
  dimir: 'UB',
  rakdos: 'BR',
  gruul: 'RG',
  selesnya: 'WG',
  orzhov: 'WB',
  izzet: 'UR',
  golgari: 'BG',
  boros: 'WR',
  simic: 'UG',
};
const GUILD = word(Object.keys(GUILDS).join('|'));
const COLORLESS = word('farblos\\p{L}*|colou?rless');
const MONO = word('mono|nur|only|rein');

const TYPE_WORDS: readonly (readonly [CardType, RegExp])[] = [
  ['creature', word('kreatur(?:en)?|creatures?')],
  ['instant', word('spontanzauber|instants?')],
  ['sorcery', word('hexerei(?:en)?|sorcery|sorceries')],
  ['enchantment', word('verzauberung(?:en)?|enchantments?')],
  ['artifact', word('artefakt(?:e|en)?|artifacts?')],
  ['planeswalker', word('planeswalkers?')],
  ['land', word('lander|lands?')],
  ['battle', word('schlacht(?:en)?|battles?')],
];

const KEYWORD_WORDS: Readonly<Record<Keyword, RegExp>> = {
  flying: word('fliegend\\p{L}*|flieger\\p{L}*|flugfahig\\p{L}*|flying|flyers?'),
  haste: word('eile|haste'),
  trample: word('trampel\\p{L}*|trample'),
  vigilance: word('wachsam\\p{L}*|vigilance'),
  deathtouch: word('todesberuhrung|deathtouch'),
  lifelink: word('lebensverknupfung|lifelink'),
  'first-strike': word('erstschlag|first[\\s-]strike'),
  'double-strike': word('doppelschlag|double[\\s-]strike'),
  menace: word('bedrohlich\\p{L}*|menace'),
  reach: word('reichweite|reach'),
  hexproof: word('fluchsicher\\p{L}*|hexproof'),
  indestructible: word('unzerstorbar\\p{L}*|indestructible'),
  flash: word('aufblitzen|flash'),
  defender: word('verteidiger|defenders?'),
  ward: word('abwehr|ward'),
  prowess: word('bravour|prowess'),
};

// "unter 2 €", "bis 1,50 Euro", "under 3 eur". Dollar prices stay unread: prices are in euro.
const MAX_PRICE =
  /(?:unter|bis|max\.?|maximal|hochstens|under|below|up\s+to|<|≤)\s*(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur(?:o|os)?(?![\p{L}]))/gu;
// "Low-Mana", "wenig Mana", "günstig zu spielen", "cheap to cast"
const LOW_MANA = word(
  'low?[\\s-]?mana|wenig\\p{L}*\\s+mana|gunstig\\p{L}*\\s+(?:zu\\s+)?(?:spielen|casten)|cheap\\s+to\\s+cast',
);
// "bis 3 Mana", "höchstens 3 Mana", "unter 3 Mana", "3 mana or less"
const AT_MOST_MANA =
  /(?:(?:bis|max\.?|maximal|hochstens|at\s+most|up\s+to|≤|<=)\s*(?<n>\d{1,2})\s*mana)|(?:(?<below>unter|weniger\s+als|below|under|less\s+than|<)\s*(?<n2>\d{1,2})\s*mana)|(?:(?<n3>\d{1,2})\s*mana\s+(?:oder\s+weniger|or\s+less))/gu;
const DROP = word('(?<n>\\d{1,2})[\\s-]?drops?');
const EXACT_MANA = word('(?<n>\\d{1,2})\\s*mana');

const SORT_WORDS: readonly (readonly [SortKey, RegExp])[] = [
  ['value-asc', word('gunstig\\p{L}*|billig\\p{L}*|preiswert\\p{L}*|cheap\\p{L}*|budget')],
  ['value-desc', word('teuer\\p{L}*|teur\\p{L}*|wertvoll\\p{L}*|expensive|valuable')],
  ['played', word('beliebt\\p{L}*|meistgespielt\\p{L}*|popular|most\\s+played')],
];

/** Words that carry no filter: "zeig mir alle Karten mit …" */
const FILLER = new Set(
  (
    'a alle all an and are auf aus bitte cards card das dem den der des die ein eine einem einen ' +
    'einer find for fur gib haben has have i ich im in is karte karten me mich mir mit nach ' +
    'oder of or show some suche such the to welche which with zeig zeige und von zu'
  ).split(' '),
);

/** Reads `request` and blanks out what it understood, so the rest can be checked. */
export function parseQuery(request: string): SearchQuery {
  let rest = normalizeForSearch(request);
  const take = (pattern: RegExp): RegExpExecArray[] => {
    const matches = [...rest.matchAll(pattern)];
    for (const match of matches) {
      rest =
        rest.slice(0, match.index) +
        ' '.repeat(match[0].length) +
        rest.slice(match.index + match[0].length);
    }
    return matches;
  };

  const priceMatch = take(MAX_PRICE)[0];
  const maxPrice = priceMatch ? Number(priceMatch[1]!.replace(',', '.')) : null;

  let minMana: number | null = null;
  let maxMana: number | null = null;
  const atMost = take(AT_MOST_MANA)[0];
  if (take(LOW_MANA).length > 0) maxMana = 2;
  if (atMost) {
    const groups = atMost.groups ?? {};
    const value = Number(groups.n ?? groups.n2 ?? groups.n3);
    maxMana = groups.below ? value - 1 : value;
  } else if (maxMana === null) {
    const exact = take(DROP)[0] ?? take(EXACT_MANA)[0];
    if (exact) minMana = maxMana = Number(exact.groups?.n);
  }

  let colors = '';
  let exactColors = false;
  const guild = take(GUILD)[0];
  if (take(COLORLESS).length > 0) {
    exactColors = true;
  } else if (guild) {
    colors = GUILDS[guild[0]]!;
    exactColors = true;
  } else {
    colors = COLOR_WORDS.filter(([, pattern]) => take(pattern).length > 0)
      .map(([color]) => color)
      .join('');
    exactColors = take(MONO).length > 0 && colors.length > 0;
  }

  const types = TYPE_WORDS.filter(([, pattern]) => take(pattern).length > 0).map(([type]) => type);
  const keywords = KEYWORDS.filter((keyword) => take(KEYWORD_WORDS[keyword]).length > 0);
  const sort = SORT_WORDS.find(([, pattern]) => take(pattern).length > 0)?.[0] ?? null;
  const unknown = rest
    .split(/[^\p{L}\d]+/u)
    .filter((token) => token.length > 1 && !FILLER.has(token));

  return { colors, exactColors, types, keywords, minMana, maxMana, maxPrice, sort, unknown };
}

/** Whether the request named any filter or order at all. */
export function understood(query: SearchQuery): boolean {
  return (
    query.colors !== '' ||
    query.exactColors ||
    query.types.length > 0 ||
    query.keywords.length > 0 ||
    query.minMana !== null ||
    query.maxMana !== null ||
    query.maxPrice !== null ||
    query.sort !== null
  );
}

/**
 * The test for a parsed request. A request without any filter ("Opt") is a name search;
 * otherwise words the parser did not understand are left out rather than finding nothing.
 */
export function queryMatcher(query: SearchQuery): (card: SearchableCard) => boolean {
  if (!understood(query)) {
    const words = query.unknown;
    return (card) => words.length > 0 && matchesWords(card.search, words);
  }
  const colors = [...query.colors];
  const manaLimit = query.minMana !== null || query.maxMana !== null;
  return (card) =>
    (query.exactColors
      ? card.colors === query.colors
      : colors.every((color) => card.colors.includes(color))) &&
    (query.types.length === 0 || card.types.some((type) => query.types.includes(type))) &&
    query.keywords.every((keyword) => card.keywords.includes(keyword)) &&
    (!manaLimit ||
      (!card.isLand &&
        card.cmc >= (query.minMana ?? 0) &&
        card.cmc <= (query.maxMana ?? Infinity))) &&
    (query.maxPrice === null || (card.price !== null && card.price <= query.maxPrice));
}

/**
 * For a name search: 0 if a name of the card is the request, 1 if one starts with it, 2 if
 * the words only appear somewhere. `search` holds the names, one per line, normalized.
 */
export function nameRank(search: string, words: readonly string[]): number {
  const request = words.join(' ');
  const names = search.split('\n');
  if (names.includes(request)) return 0;
  return names.some((name) => name.startsWith(request)) ? 1 : 2;
}
