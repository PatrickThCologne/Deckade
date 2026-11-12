/**
 * The search tab reads a request in plain German or English ("günstige rote Kreaturen mit
 * Eile") as filters over the card list: sets ("aus Reality Fracture", "FRA"), colours, card
 * types, keyword abilities, synergies ("Synergie mit Artefakten", "synergiert mit
 * Elementarwesen"), answers ("Konter gegen Flieger", "entfernt Fäulnis"), roles ("zum
 * Rampen"), archetypes ("Aggro", "Control", "Midrange"), mana value, a price limit and a sort
 * order. It runs in the browser without a model, so it needs no server and the request never
 * leaves the page (docs/adr/0002-natural-language-search.md). This is the only parser; an
 * earlier C# version with the basic rules is kept in the git tag archive/api-phase2. Sets,
 * synergies, answers, creature types, roles and archetypes were only ever added here.
 */
import { type CardType, matchesWords, normalizeForSearch, type SortKey } from '../cards/sort';
import { KEYWORDS, type Keyword } from './keywords';
import type { Role } from './roles';
import { SYNERGIES, type Synergy } from './synergies';
import { GERMAN_TRIBES, singular, tribeCandidates } from './tribes';

/** Deck styles as fixed rules over roles and mana value (ARCHETYPE_RULES below). */
export type Archetype = 'aggro' | 'control' | 'midrange';

/** A set the request may name; on the site, the sets of the card list file. */
export interface SearchSet {
  readonly code: string;
  readonly name: string;
}

export interface SearchQuery {
  /** Set codes; the cards must be printed in one of them. */
  readonly sets: readonly string[];
  /** Colours in WUBRG order the cards must have. */
  readonly colors: string;
  /** The cards have exactly `colors` and no other ("mono-grün", "Selesnya", "farblos"). */
  readonly exactColors: boolean;
  /** Any of these types. */
  readonly types: readonly CardType[];
  /** All of these keywords. */
  readonly keywords: readonly Keyword[];
  /** All of these synergies. */
  readonly synergies: readonly Synergy[];
  /** All of these answers: what the cards fight. */
  readonly answers: readonly Synergy[];
  /** Per request word, the creature types it may name; the cards must work with one. */
  readonly tribes: readonly (readonly string[])[];
  /** All of these roles. */
  readonly roles: readonly Role[];
  readonly archetype: Archetype | null;
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
  readonly synergies: readonly Synergy[];
  readonly answers: readonly Synergy[];
  readonly tribes: readonly string[];
  readonly roles: readonly Role[];
  /** Codes of every set that printed the card. */
  readonly printedIn: readonly string[];
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

/** What a synergy is called after "Synergie mit": German card words and English ones. */
const SYNERGY_NAMES: Readonly<Record<Synergy, string>> = {
  artifacts: 'artefakt\\p{L}*|artifacts?',
  enchantments: 'verzauberung\\p{L}*|enchantments?|aura\\p{L}*',
  counters: '\\+1/\\+1(?:[\\s-]?(?:marke\\p{L}*|counters?))?|marke\\p{L}*|counter\\p{L}*',
  blight: '-1/-1(?:[\\s-]?(?:marke\\p{L}*|counters?))?|faulnis|blight\\p{L}*',
  flying: 'flieg\\p{L}*|flug\\p{L}*|flying|flyers?|fliers?',
  tokens: 'spielstein\\p{L}*|token\\p{L}*',
  graveyard: 'friedhof\\p{L}*|graveyards?|mill\\p{L}*|mahl\\p{L}*',
  lifegain:
    'lebens?gewinn\\p{L}*|lebenspunkt\\p{L}*|leben|life\\s?gain\\p{L}*|gaining\\s+life|life',
  sacrifice: 'opfer\\p{L}*|sacrific\\p{L}*|sac',
  spells: 'spontanzauber\\p{L}*|hexerei\\p{L}*|zauberspruch\\p{L}*|spells?|instants?|sorcer\\p{L}*',
  lands: 'land\\p{L}*',
};
const SYNERGY_WORDS = Object.fromEntries(
  SYNERGIES.map((synergy) => [synergy, word(SYNERGY_NAMES[synergy])]),
) as Readonly<Record<Synergy, RegExp>>;
const SYNERGY_NAME = `(?:(?:den|dem|der|die|the)\\s+)?(?:${Object.values(SYNERGY_NAMES).join('|')})`;
const SYNERGY_LIST = `${SYNERGY_NAME}(?:(?:\\s*[,&/]\\s*|\\s+(?:und|and|oder|or|sowie)\\s+)${SYNERGY_NAME})*`;
// "Synergie mit Countern und Fliegern", "synergy with tokens", "cards that care about artifacts".
// The theme words only count behind such a phrase, so "Artefakte" alone stays a card type.
const SYNERGY_AFTER = word(
  `(?:synerg\\p{L}*\\s+(?:mit|with|for|fur|zu|von)|(?:that\\s+)?cares?\\s+about)\\s+${SYNERGY_LIST}`,
);
// "Artefakt-Synergie", "Fliegersynergien", "token synergy"
const SYNERGY_BEFORE = word(`${SYNERGY_LIST}[\\s-]*synerg\\p{L}*`);
// "Konter gegen Flieger", "gegen Artefakte", "entfernt Fäulnis", "answer to flyers", "removes blight"
const ANSWER_VERB = 'entfern\\p{L}*|zerstor\\p{L}*|vernicht\\p{L}*|beseitig\\p{L}*';
const ANSWER_AFTER = word(
  `(?:(?:konter\\p{L}*|antwort\\p{L}*|counters?|answers?|hate|removal)\\s+)?(?:gegen|against|to|for)\\s+${SYNERGY_LIST}|(?:${ANSWER_VERB}|removes?|destroys?|kills?|exiles?)\\s+${SYNERGY_LIST}`,
);
// German word order: "die Fäulnis entfernt", "der Flieger zerstört"
const ANSWER_BEFORE = word(`${SYNERGY_LIST}\\s+(?:${ANSWER_VERB}|kontert?)`);
// "synergiert mit Elementarwesen", "Synergie mit Elfen", "synergizes with Goblins" and "der mit
// Elementarkreaturen synergiert". After the themes, so "Synergie mit Artefakten" stays a theme.
const TRIBE_AFTER = word(
  `(?:synerg\\p{L}*\\s+(?:mit|with|for|fur|zu|von)|(?:that\\s+)?cares?\\s+about)\\s+(?:(?:den|dem|der|die|the)\\s+)?(?<tribe>\\p{L}+)`,
);
const TRIBE_BEFORE = word(`(?:mit|with)\\s+(?<tribe>\\p{L}+)\\s+synerg\\p{L}*`);
// "Zauber", "spell": an instant or a sorcery
const SPELL = word('zauber(?:spruch|spruche)?|spells?');

// A set code counts only in capitals ("Kreaturen aus FRA", "DSK-Karten"): codes such as "one",
// "war" and "all" are also words. It is read in the request as typed, before lower case.
const SET_CODE = /(?<![\p{L}\d])[A-Z\d]*[A-Z][A-Z\d]*(?![\p{L}\d])/gu;
// Words a set name needs not repeat: "War of the Spark" is named by "War Spark" as well
const SET_NAME_FILLER = new Set(['the', 'of', 'and']);
const nameWords = (text: string) => normalizeForSearch(text).match(/[\p{L}\d]+/gu) ?? [];
// "Fractured Reality" names "Reality Fracture": one word may start with the other, but only
// as another ending, from 4 letters on and at most 2 letters longer. So "all" does not name
// "Alliances", "vows" not "Crimson Vow", and "Aether", "cold" and "listige" not "Aetherdrift",
// "Coldsnap" and "The List".
const sameWord = (a: string, b: string) =>
  a === b ||
  (Math.min(a.length, b.length) >= 4 &&
    Math.abs(a.length - b.length) <= 2 &&
    (a.startsWith(b) || b.startsWith(a)));
// A set name of one word is often a word of card names too ("Dark Ritual", "Uneasy Alliance"),
// so it names the set only on its own or right after one of these words ("aus Zendikar")
const SET_CUES = new Set(['aus', 'von', 'from', 'in', 'set', 'edition']);
// A single word before the colon names a set on its own ("Duskmourn", "Kamigawa") from 5 letters
// on. Longer ones ("March of the Machine", "Commander Legends") are words of too many card names.
// A creature type the parser knows ("Avatar of Woe") only counts right after a cue word.
const BEFORE_COLON_MIN = 5;
const KNOWN_TRIBES = new Set(GERMAN_TRIBES.map(([, english]) => english));

interface SetNames {
  readonly code: string;
  /** Every word of the name, normalized. */
  readonly words: readonly string[];
  /** The words a request must have: numbers, and words of 3 letters or more but no filler. */
  readonly needed: readonly string[];
  /** The word before the colon, if the name has one and it is one word ("Duskmourn: …"). */
  readonly beforeColon: readonly string[];
}

const oneWord = (words: readonly string[]) => (words.length === 1 ? words : []);

// The site parses every request against the same list of sets, so its words are read once
const setNamesCache = new WeakMap<readonly SearchSet[], readonly SetNames[]>();
function setNames(sets: readonly SearchSet[]): readonly SetNames[] {
  let names = setNamesCache.get(sets);
  if (!names) {
    names = sets.map((set) => {
      const words = nameWords(set.name);
      const colon = set.name.indexOf(':');
      return {
        code: set.code,
        words,
        needed: words.filter(
          (name) => (name.length >= 3 || /^\d+$/.test(name)) && !SET_NAME_FILLER.has(name),
        ),
        beforeColon: colon < 0 ? [] : oneWord(nameWords(set.name.slice(0, colon))),
      };
    });
    setNamesCache.set(sets, names);
  }
  return names;
}

/**
 * Which request word stands for each needed word of a set name, or null if one is missing.
 * Each request word stands for one name word only, so "3" in "Modern Horizons 3 … bis 3 Mana"
 * is left for the mana value. A name word prefers the request word written exactly so over
 * another ending, and a request word after the previous name word's over an earlier one.
 */
function nameTokens(needed: readonly string[], tokens: readonly string[]): number[] | null {
  const used: number[] = [];
  for (const name of needed) {
    const last = used.at(-1) ?? -1;
    const free = (index: number) => !used.includes(index);
    const find = (fits: (token: string) => boolean) => {
      const after = tokens.findIndex((token, index) => index > last && free(index) && fits(token));
      return after >= 0 ? after : tokens.findIndex((token, index) => free(index) && fits(token));
    };
    let index = find((token) => token === name);
    if (index < 0) index = find((token) => sameWord(token, name));
    if (index < 0) return null;
    used.push(index);
  }
  return used;
}

// "Karten zum Rampen", "Ramp", "mana dorks", "Manabeschleunigung", "Removal", "Konterzauber",
// "Boardwipe", "Kartenziehen", "Direktschaden". Read after the answers, so "removal gegen
// Flieger" stays an answer; "Kreaturen-Removal" is removal aimed at creatures, not creatures.
const ROLE_WORDS: readonly (readonly [Role, RegExp])[] = [
  [
    'ramp',
    word('(?:zum\\s+)?rampen|ramp(?:e|s|ing)?|mana[\\s-]?dorks?|mana[\\s-]?beschleunig\\p{L}*'),
  ],
  ['removal', word('(?:kreatur(?:en)?[\\s-]?|creature[\\s-]?)?removal|entfernung')],
  ['counterspell', word('counterspells?|konterzauber\\p{L}*|gegenzauber\\p{L}*')],
  ['wipe', word('board[\\s-]?wipes?|brettfeger\\p{L}*|massenvernichtung\\p{L}*|wraths?')],
  ['draw', word('karten[\\s-]?ziehen|card[\\s-]?draw|kartenvorteil\\p{L}*|draw')],
  ['burn', word('burn|direktschaden\\p{L}*|direct[\\s-]damage')],
];
// Not inside a phrase about taking a creature: "die Kontrolle übernehmen", "gain control of"
const ARCHETYPE_WORDS: readonly (readonly [Archetype, RegExp])[] = [
  ['aggro', word(`aggro|aggressiv${ending}`)],
  [
    'control',
    word(
      '(?<!(?:gain|tak|steal)\\p{L}*\\s+)control(?!\\s+(?:of|over)(?![\\p{L}]))|(?<!(?:ubern|erhalt|erlang|gewinn)\\p{L}*\\s+(?:die\\s+)?)kontroll(?:e)?(?!\\s+uber)',
    ),
  ],
  ['midrange', word('mid[\\s-]?range')],
];

// "unter 2 €", "bis 1,50 Euro", "under 3 eur". Dollar prices stay unread: prices are in euro.
const MAX_PRICE =
  /(?:unter|bis|max\.?|maximal|hochstens|under|below|up\s+to|<|≤)\s*(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur(?:o|os)?(?![\p{L}]))/gu;
// "Low-Mana", "wenig Mana", "günstig zu spielen", "cheap to cast", "Early Game", "Frühspiel"
const LOW_MANA = word(
  'low?[\\s-]?mana|wenig\\p{L}*\\s+mana|gunstig\\p{L}*\\s+(?:zu\\s+)?(?:spielen|casten)|cheap\\s+to\\s+cast|early[\\s-]?game|fruhspiel\\p{L}*',
);
// "Late Game", "Spätspiel", "Finisher", "Bomben", "hohe Manakosten", "high mana value", "viel
// Mana": cards of mana value 5 or more
const LATE_GAME = word(
  'late[\\s-]?game|spatspiel\\p{L}*|finisher(?:s)?|bomb(?:e|en|s)?|hoh\\p{L}*\\s+mana[\\s-]?(?:kost|wert)\\p{L}*|high\\s+mana(?:[\\s-]?(?:value|costs?))?|viel\\p{L}*\\s+mana',
);
// "ab 4 Mana", "mindestens 4 Mana", "4+ Mana", "4 mana or more"; "mehr als 4 Mana" and "über 4
// Mana" mean 5 or more. Not inside a longer word or number: "x100+ mana" says nothing.
const AT_LEAST_MANA =
  /(?<![\p{L}\d])(?:(?:(?:ab|mindestens|min\.?|at\s+least|≥|>=)\s*(?<n>\d{1,2})\s*mana)|(?:(?<above>mehr\s+als|uber|more\s+than|over|above|>)\s*(?<n2>\d{1,2})\s*mana)|(?:(?<n3>\d{1,2})(?:\+\s*mana|\s*mana\s+(?:oder\s+mehr|or\s+more))))/gu;
// "bis 3 Mana", "höchstens 3 Mana", "unter 3 Mana", "3 mana or less"
const AT_MOST_MANA =
  /(?:(?:bis|max\.?|maximal|hochstens|at\s+most|up\s+to|≤|<=)\s*(?<n>\d{1,2})\s*mana)|(?:(?<below>unter|weniger\s+als|below|under|less\s+than|<)\s*(?<n2>\d{1,2})\s*mana)|(?:(?<n3>\d{1,2})\s*mana\s+(?:oder\s+weniger|or\s+less))/gu;
const DROP = word('(?<n>\\d{1,2})[\\s-]?drops?');
const EXACT_MANA = word('(?<n>\\d{1,2})\\s*mana');

const SORT_WORDS: readonly (readonly [SortKey, RegExp])[] = [
  ['value-asc', word('gunstig\\p{L}*|billig\\p{L}*|preiswert\\p{L}*|cheap\\p{L}*|budget')],
  ['value-desc', word('teuer\\p{L}*|teur\\p{L}*|wertvoll\\p{L}*|expensive|valuable')],
  // "stark", "mächtig" and "die reinknallen" have no field of their own: the most played first.
  // Only these forms, so "Stärke" (power, see STRENGTH_NOUN) and "Starkstrom" are no order.
  [
    'played',
    word(
      'beliebt\\p{L}*|meistgespielt\\p{L}*|popular|most\\s+played|stark(?:e|en)?|starksten?|strong|powerful|machtige?|reinknallen',
    ),
  ],
];
// "Stärke" is a creature's power, "starke" means strong, and without accents both read
// "starke". So the noun is spelled "staerke" in the request as typed, which no filter reads, and
// is a name word "starke" again among the unknown words ("Stärke des Willens").
const STRENGTH_NOUN = /(?<![\p{L}\d])(st)ä(rke|rken)(?![\p{L}\d])/giu;

/** Words that carry no filter: "zeig mir alle Karten mit …" */
const FILLER = new Set(
  (
    'a alle all an and are auf aus bitte cards card das dem den der des die ein eine einem einen ' +
    'einer find for fur gib haben has have i ich im in is karte karten me mich mir mit nach ' +
    'oder of or show some suche such the to welche which with zeig zeige und von zu deck decks'
  ).split(' '),
);

/**
 * Reads `request` and blanks out what it understood, so the rest can be checked. `sets` are
 * the sets the request may name; without them no set is read.
 */
export function parseQuery(request: string, sets: readonly SearchSet[] = []): SearchQuery {
  const byCode = new Map(sets.map((set) => [set.code.toLowerCase(), set.code]));
  const setCodes: string[] = [];
  let rest = normalizeForSearch(
    request
      .normalize('NFC')
      .replace(STRENGTH_NOUN, '$1ae$2')
      .replace(SET_CODE, (code) => {
        const known = byCode.get(code.toLowerCase());
        if (known === undefined) return code;
        setCodes.push(known);
        return ' '.repeat(code.length);
      }),
  );
  const blank = (index: number, length: number) => {
    rest = rest.slice(0, index) + ' '.repeat(length) + rest.slice(index + length);
  };
  const take = (pattern: RegExp): RegExpExecArray[] => {
    const matches = [...rest.matchAll(pattern)];
    for (const match of matches) blank(match.index, match[0].length);
    return matches;
  };

  // Sets first, so "Battle for Zendikar" asks for no battles. A set is named when every word of
  // its name is in the request, in any order, a name of one word only on its own or after one of
  // SET_CUES. Of those, the ones with the most words count, so "Innistrad: Crimson Vow" is not
  // Innistrad as well. Numbers count as name words however short, so "Modern Horizons 3" is not
  // Modern Horizons. Among sets with as many words, those written exactly so win: "Tarkir
  // Dragonstorm" is not "Dragons of Tarkir".
  const requestWords = [...rest.matchAll(/[\p{L}\d]+/gu)];
  const tokens = requestWords.map(([token]) => token);
  const names = setNames(sets);
  const fullyNamed = names.flatMap((set) => {
    const used = set.needed.length > 0 ? nameTokens(set.needed, tokens) : null;
    if (used === null) return [];
    if (used.length === 1) {
      const index = used[0]!;
      // "cards from The Dark": the other words of the name may stand in between
      let before = index - 1;
      while (before >= 0 && set.words.includes(tokens[before]!)) before--;
      const alone = tokens.every(
        (token, other) => other === index || token.length < 2 || FILLER.has(token),
      );
      if (!alone && !SET_CUES.has(tokens[before] ?? '')) return [];
    }
    const exact = used.filter((index, i) => tokens[index] === set.needed[i]).length;
    return [{ set, used, exact }];
  });
  const most = Math.max(0, ...fullyNamed.map(({ used }) => used.length));
  const longest = fullyNamed.filter(({ used }) => used.length === most);
  const mostExact = Math.max(0, ...longest.map(({ exact }) => exact));
  const namedSets = longest.filter(({ exact }) => exact === mostExact);
  // Only the request words that named the set are blanked, and the short words of its name
  // ("be" in "All Will Be One"): the second "3" of "Modern Horizons 3 bis 3 Mana" is the mana
  const setTokens = new Set(namedSets.flatMap(({ used }) => used));
  tokens.forEach((token, index) => {
    if (namedSets.some(({ set }) => set.words.includes(token) && !set.needed.includes(token))) {
      setTokens.add(index);
    }
  });
  // Without a set named in full, an exact word of 5 letters or more before a colon names that
  // set ("Duskmourn", "Phyrexia"); a set called just that word wins ("Innistrad Crimson Vows" is
  // Innistrad)
  const colonCodes: string[] = [];
  if (namedSets.length === 0) {
    tokens.forEach((token, index) => {
      if (token.length < BEFORE_COLON_MIN) return;
      const cued = SET_CUES.has(tokens[index - 1] ?? '');
      if (!cued && singular(token).some((type) => KNOWN_TRIBES.has(type))) return;
      const before = names.filter((set) => set.beforeColon.includes(token));
      if (before.length === 0) return;
      const called = names.filter((set) => set.needed.length === 1 && set.needed[0] === token);
      colonCodes.push(...(called.length > 0 ? called : before).map((set) => set.code));
      setTokens.add(index);
    });
  }
  for (const index of setTokens) {
    const token = requestWords[index]!;
    blank(token.index, token[0].length);
  }

  // Then synergies, so "Synergie mit Artefakten" asks for no artifacts and "mit Fliegern" for
  // no flyers
  const synergyText = [...take(SYNERGY_AFTER), ...take(SYNERGY_BEFORE)]
    .map((match) => match[0])
    .join(' ');
  const synergies = SYNERGIES.filter((synergy) => synergyText.search(SYNERGY_WORDS[synergy]) >= 0);
  const answerText = [...take(ANSWER_AFTER), ...take(ANSWER_BEFORE)]
    .map((match) => match[0])
    .join(' ');
  const answers = SYNERGIES.filter((theme) => answerText.search(SYNERGY_WORDS[theme]) >= 0);
  const tribes = [...take(TRIBE_AFTER), ...take(TRIBE_BEFORE)]
    .map((match) => tribeCandidates(match.groups?.tribe ?? ''))
    .filter((candidates) => candidates.length > 0);
  const roles = ROLE_WORDS.filter(([, pattern]) => take(pattern).length > 0).map(([role]) => role);
  // Every archetype word is understood; the one named first counts ("aggro control" is aggro)
  const archetype =
    ARCHETYPE_WORDS.flatMap(([name, pattern]) =>
      take(pattern).map((match) => [match.index, name] as const),
    ).sort(([a], [b]) => a - b)[0]?.[1] ?? null;

  const priceMatch = take(MAX_PRICE)[0];
  const maxPrice = priceMatch ? Number(priceMatch[1]!.replace(',', '.')) : null;

  let minMana: number | null = null;
  let maxMana: number | null = null;
  const atMost = take(AT_MOST_MANA)[0];
  const atLeast = take(AT_LEAST_MANA)[0];
  if (take(LOW_MANA).length > 0) maxMana = 2;
  if (take(LATE_GAME).length > 0) minMana = 5;
  if (atMost) {
    const groups = atMost.groups ?? {};
    const value = Number(groups.n ?? groups.n2 ?? groups.n3);
    maxMana = groups.below ? value - 1 : value;
  }
  if (atLeast) {
    const groups = atLeast.groups ?? {};
    const value = Number(groups.n ?? groups.n2 ?? groups.n3);
    minMana = groups.above ? value + 1 : value;
  }
  if (minMana === null && maxMana === null) {
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
  if (take(SPELL).length > 0) {
    for (const type of ['instant', 'sorcery'] as const) if (!types.includes(type)) types.push(type);
  }
  const keywords = KEYWORDS.filter((keyword) => take(KEYWORD_WORDS[keyword]).length > 0);
  const sort = SORT_WORDS.find(([, pattern]) => take(pattern).length > 0)?.[0] ?? null;
  const unknown = rest
    .split(/[^\p{L}\d]+/u)
    .filter((token) => token.length > 1 && !FILLER.has(token))
    .map((token) => token.replace(/^staerk(?=en?$)/, 'stark'));

  return {
    sets: [...new Set([...setCodes, ...namedSets.map(({ set }) => set.code), ...colonCodes])],
    colors,
    exactColors,
    types,
    keywords,
    synergies,
    answers,
    tribes,
    roles,
    archetype,
    minMana,
    maxMana,
    maxPrice,
    sort,
    unknown,
  };
}

/** Whether the request named any filter or order at all. */
export function understood(query: SearchQuery): boolean {
  return (
    query.sets.length > 0 ||
    query.colors !== '' ||
    query.exactColors ||
    query.types.length > 0 ||
    query.keywords.length > 0 ||
    query.synergies.length > 0 ||
    query.answers.length > 0 ||
    query.tribes.length > 0 ||
    query.roles.length > 0 ||
    query.archetype !== null ||
    query.minMana !== null ||
    query.maxMana !== null ||
    query.maxPrice !== null ||
    query.sort !== null
  );
}

/**
 * Whether the request is exactly the name of a card. `names` holds the card names normalized
 * (lib/cards/sort.ts); the search then looks for that name, even where its words read as
 * filters ("Control Magic", "Dark Ritual").
 */
export function exactNameMatch(request: string, names: ReadonlySet<string>): boolean {
  return names.has(normalizeForSearch(request).trim());
}

// Answers and card draw
const CONTROL_ROLES: readonly Role[] = ['removal', 'counterspell', 'wipe', 'draw'];

/**
 * What makes a card fit an archetype: a rough rule over roles and mana value, not deck data.
 * Lands are in every deck, so the matcher leaves them out of all archetypes.
 */
const ARCHETYPE_RULES: Readonly<Record<Archetype, (card: SearchableCard) => boolean>> = {
  // Cheap creatures and damage to the opponent's face
  aggro: (card) =>
    (card.types.includes('creature') && card.cmc <= 3) || card.roles.includes('burn'),
  control: (card) => card.roles.some((role) => CONTROL_ROLES.includes(role)),
  // Creatures in the middle of the curve
  midrange: (card) => card.types.includes('creature') && card.cmc >= 3 && card.cmc <= 5,
};

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
  const archetype = query.archetype === null ? null : ARCHETYPE_RULES[query.archetype];
  return (card) =>
    (query.sets.length === 0 || card.printedIn.some((code) => query.sets.includes(code))) &&
    (query.exactColors
      ? card.colors === query.colors
      : colors.every((color) => card.colors.includes(color))) &&
    (query.types.length === 0 || card.types.some((type) => query.types.includes(type))) &&
    query.keywords.every((keyword) => card.keywords.includes(keyword)) &&
    query.synergies.every((synergy) => card.synergies.includes(synergy)) &&
    query.answers.every((theme) => card.answers.includes(theme)) &&
    query.tribes.every((candidates) => candidates.some((tribe) => card.tribes.includes(tribe))) &&
    query.roles.every((role) => card.roles.includes(role)) &&
    (archetype === null || (!card.isLand && archetype(card))) &&
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
