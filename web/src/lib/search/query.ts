/**
 * The search tab reads a request in plain German or English ("günstige rote Kreaturen mit
 * Eile") as filters over the card list: sets ("aus Reality Fracture", "FRA"; lib/search/sets.ts),
 * colours (also guild, shard and wedge names, and ruled out: "nicht blau"), card types
 * ("Artefaktkreaturen" needs both), creature types ("Elfen", "dragons"), keyword abilities (also
 * ruled out: "ohne Fliegen"), synergies ("Synergie mit Artefakten", "synergiert mit
 * Elementarwesen", "mill"), answers ("Konter gegen Flieger", "entfernt Fäulnis", "artifact
 * removal"), roles ("zum Rampen", "Tutor"), archetypes ("Aggro", "Control", "Midrange"), mana
 * value, a price limit and a sort order; which cards a request finds, and in which order, is
 * lib/search/results.ts. It runs in the browser without a model, so it needs no server and the
 * request never leaves the page (docs/adr/0002-natural-language-search.md). This is the only
 * parser; an earlier C# version with the basic rules is kept in the git tag archive/api-phase2.
 * Sets, synergies, answers, creature types, roles, archetypes and the ruled out colours and
 * keywords were only ever added here.
 */
import {
  type CardType,
  matchesWords,
  normalizeForSearch,
  searchWords,
  type SortKey,
} from '../cards/sort';
import { KEYWORDS, type Keyword } from './keywords';
import type { Role } from './roles';
import { readSetCodes, readSetNames, type SearchSet } from './sets';
import { SYNERGIES, type Synergy } from './synergies';
import { tribeCandidates } from './tribes';

export type { SearchSet } from './sets';

/** Deck styles as fixed rules over roles and mana value (ARCHETYPE_RULES below). */
export type Archetype = 'aggro' | 'control' | 'midrange';

/**
 * How the cards' colours relate to the named ones: all of them and maybe more ("rot"), exactly
 * them ("mono-grün", "farblos"), or some of them and no other, the cards a deck of these colours
 * can play ("Selesnya").
 */
export type ColorMode = 'all' | 'exact' | 'within';

export interface SearchQuery {
  /** Set codes; the cards must be printed in one of them. */
  readonly sets: readonly string[];
  /** Colours in WUBRG order; colorMode says how the cards' colours must fit them. */
  readonly colors: string;
  readonly colorMode: ColorMode;
  /** Whether colorMode is 'exact': the cards have exactly `colors` and no other. */
  readonly exactColors: boolean;
  /** Colours in WUBRG order the cards must not have ("nicht blau", "non-blue"). */
  readonly notColors: string;
  /** Any of these types: every type of the groups in typeGroups, once. */
  readonly types: readonly CardType[];
  /**
   * The cards must have every type of one group. A group has one type per type word, and both
   * for a word that names two ("Artefaktkreaturen", "artifact creatures"), so "Artefakte und
   * Kreaturen" is either and "Artefaktkreaturen" is both.
   */
  readonly typeGroups: readonly (readonly CardType[])[];
  /** Any of these creature types, lower case ("elf"); the cards must be one. */
  readonly creatureTypes: readonly string[];
  /** All of these keywords. */
  readonly keywords: readonly Keyword[];
  /** None of these keywords ("ohne Fliegen", "without flying"). */
  readonly notKeywords: readonly Keyword[];
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
  /** The creature types of its type line, lower case. */
  readonly creatureTypes: readonly string[];
  readonly keywords: readonly Keyword[];
  readonly synergies: readonly Synergy[];
  readonly answers: readonly Synergy[];
  /** The creature types it works with. */
  readonly tribes: readonly string[];
  readonly roles: readonly Role[];
  /** Codes of every set that printed the card. */
  readonly printedIn: readonly string[];
  readonly cmc: number;
  readonly isLand: boolean;
  readonly price: number | null;
  /**
   * The full names, shown and other language, one per line, normalized (lib/cards/sort.ts):
   * for requests that name no filter at all, and for the card of an exact name
   * (lib/search/results.ts).
   */
  readonly search: string;
}

// All patterns run on the normalized request: lower case and without accents, so "grün" is
// "grun" and "höchstens" is "hochstens". A word must not be part of a longer word, so "rot"
// does not match "Rotation".
const word = (words: string) => new RegExp(`(?<![\\p{L}\\d])(?:${words})(?![\\p{L}])`, 'gu');
const ending = '(?:e|en|er|es|em)?';
/** `text` with `length` characters from `index` on replaced by spaces, so the rest stays put. */
const blank = (text: string, index: number, length: number) =>
  text.slice(0, index) + ' '.repeat(length) + text.slice(index + length);

const COLOR_WORDS: readonly (readonly [string, RegExp])[] = [
  ['W', word(`wei(?:ß|ss)${ending}|white`)],
  ['U', word(`blau${ending}|blue`)],
  ['B', word(`schwarz${ending}|black`)],
  ['R', word(`rot${ending}|red`)],
  ['G', word(`grun${ending}|green`)],
];

/**
 * Two- and three-colour groups have fixed names in Magic. They stand for a deck of these
 * colours, so they mean the cards such a deck can play: of some of the colours and no other.
 */
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
  // The shards and wedges name three-colour decks the same way
  esper: 'WUB',
  grixis: 'UBR',
  jund: 'BRG',
  naya: 'WRG',
  bant: 'WUG',
  abzan: 'WBG',
  jeskai: 'WUR',
  sultai: 'UBG',
  mardu: 'WBR',
  temur: 'URG',
};
const GUILD = word(Object.keys(GUILDS).join('|'));
const COLORLESS = word('farblos\\p{L}*|colou?rless');
const ANY_COLOR = COLOR_WORDS.map(([, pattern]) => pattern.source).join('|');
// Mono only right before a colour word ("nur rote Karten", "only green"): "rote Karten nur bis 3
// Mana" is red cards up to 3 mana, and there "nur" is a filler word
const MONO = new RegExp(`(?<![\\p{L}\\d])(?:mono|nur|only|rein)[\\s-]*(?=${ANY_COLOR})`, 'gu');
// "nicht blau", "keine blauen Karten", "non-blue", "ohne Fliegen", "without flying"
const NOT = `(?<![\\p{L}\\d])(?:nicht|kein${ending}|ohne|not|non|no|without)[\\s-]+`;
const negated = (pattern: RegExp) => new RegExp(NOT + pattern.source, 'gu');

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
// One word for two types, as the type line has them: "Artefaktkreaturen", "artifact creatures",
// "Verzauberungskreatur", "Artefaktländer". Read before the single types; such a card is both.
const JOINED_TYPE_WORDS: readonly (readonly [readonly CardType[], RegExp])[] = [
  [['artifact', 'creature'], word('artefakt[\\s-]?kreatur(?:en)?|artifact[\\s-]creatures?')],
  [
    ['enchantment', 'creature'],
    word('verzauberungs?[\\s-]?kreatur(?:en)?|enchantment[\\s-]creatures?'),
  ],
  [['artifact', 'land'], word('artefakt[\\s-]?land(?:er)?|artifact[\\s-]lands?')],
];

const KEYWORD_WORDS: Readonly<Record<Keyword, RegExp>> = {
  flying: word('fliegen|fliegend\\p{L}*|flieger\\p{L}*|flugfahig\\p{L}*|flying|flyers?|fliers?'),
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
  // Treasure tokens are artifacts, and the artifact synergy is what names them (synergies.ts)
  artifacts: 'artefakt\\p{L}*|artifacts?|schatz\\p{L}*|treasures?',
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
// "Konter gegen Flieger", "gegen Artefakte", "entfernt Fäulnis", "answer to flyers", "removes
// blight". "für" only after a word for an answer ("Removal für Artefakte", "Konter für
// Flieger"): "Karten für Artefakte" may as well mean cards for an artifact deck.
const ANSWER_VERB = 'entfern\\p{L}*|zerstor\\p{L}*|vernicht\\p{L}*|beseitig\\p{L}*';
const ANSWER_NOUN = 'konter\\p{L}*|antwort\\p{L}*|counters?|answers?|hate|removal';
const ANSWER_AFTER = word(
  `(?:(?:${ANSWER_NOUN})\\s+)?(?:gegen|against|to|for)\\s+${SYNERGY_LIST}|(?:${ANSWER_NOUN})\\s+fur\\s+${SYNERGY_LIST}|(?:${ANSWER_VERB}|removes?|destroys?|kills?|exiles?)\\s+${SYNERGY_LIST}`,
);
// German word order: "die Fäulnis entfernt", "der Flieger zerstört". And a theme in front of
// removal or hate: "artifact removal", "Verzauberungs-Removal", "graveyard hate",
// "Friedhofs-Hate". Removal of artifacts or enchantments is what such cards fight, not cards
// of that type, and no removal role (lib/search/roles.ts).
const ANSWER_BEFORE = word(
  `${SYNERGY_LIST}(?:\\s+(?:${ANSWER_VERB}|kontert?)|[\\s-]*(?:removal|hate))`,
);
// "synergiert mit Elementarwesen", "Synergie mit Elfen", "synergizes with Goblins" and "der mit
// Elementarkreaturen synergiert". After the themes, so "Synergie mit Artefakten" stays a theme.
const TRIBE_AFTER = word(
  `(?:synerg\\p{L}*\\s+(?:mit|with|for|fur|zu|von)|(?:that\\s+)?cares?\\s+about)\\s+(?:(?:den|dem|der|die|the)\\s+)?(?<tribe>\\p{L}+)`,
);
const TRIBE_BEFORE = word(`(?:mit|with)\\s+(?<tribe>\\p{L}+)\\s+synerg\\p{L}*`);
// "elf synergy", "Elfen-Synergie": only for a word that is a creature type of the cards, so
// "creatures you control synergy" asks for no creature type "control"
const TRIBE_NEXT = word(`(?<tribe>\\p{L}+)[\\s-]*synerg\\p{L}*`);
// Themes that are named on their own as well: "Lebensgewinn", "lifegain", "token makers",
// "Spielsteinerzeuger", "tokens" (a token deck), "mill" and "mahlen" (filling graveyards),
// "landfall", "sacrifice outlets". Read after the answers, so "gegen Spielsteine" stays an
// answer. Other theme words alone are card types ("Artefakte") or keywords.
const BARE_SYNERGIES: readonly (readonly [Synergy, RegExp])[] = [
  ['lifegain', word('lebens?gewinn\\p{L}*|life[\\s-]?gain\\p{L}*')],
  [
    'tokens',
    word(
      'token[\\s-]?(?:makers?|erzeuger\\p{L}*)|spielstein[\\s-]?erzeug\\p{L}*|tokens?|spielstein(?:e|en)?',
    ),
  ],
  ['graveyard', word('mill(?:s|ing)?|mahlen')],
  ['lands', word('landfall')],
  ['sacrifice', word('(?:sacrifice|sac|opfer)[\\s-]?outlets?')],
];
// "Zauber", "spell": an instant or a sorcery
const SPELL = word('zauber(?:spruch|spruche)?|spells?');

// "Karten zum Rampen", "Ramp", "Manabeschleunigung", "Removal", "Edikte", "Konter",
// "Konterzauber", "Boardwipe", "Wipes", "Kartenziehen", "Direktschaden", "Tutor". Read after the
// answers, so "removal gegen Flieger" and "Konter gegen Flieger" stay answers;
// "Kreaturen-Removal" is removal aimed at creatures, not creatures.
const ROLE_WORDS: readonly (readonly [Role, RegExp])[] = [
  ['ramp', word('(?:zum\\s+)?rampen|ramp(?:e|s|ing)?|mana[\\s-]?beschleunig\\p{L}*')],
  [
    'removal',
    word(
      '(?:kreatur(?:en)?[\\s-]?|creature[\\s-]?)?removal|entfernung|edikt\\p{L}*|edicts?(?:\\s+effects?)?',
    ),
  ],
  ['counterspell', word('counterspells?|konter(?:n|zauber\\p{L}*)?|gegenzauber\\p{L}*')],
  ['wipe', word('(?:board[\\s-]?)?wipes?|brettfeger\\p{L}*|massenvernichtung\\p{L}*|wraths?')],
  ['draw', word('karten[\\s-]?ziehen|card[\\s-]?draws?|kartenvorteil\\p{L}*|draws?')],
  ['burn', word('burn|direktschaden\\p{L}*|direct[\\s-]damage')],
  ['tutor', word('tutor(?:s|en)?|suchzauber\\p{L}*')],
];
// "mana dorks" are creatures that ramp, "mana rocks" and "Manasteine" artifacts that do
const MANA_DORKS = word('mana[\\s-]?dorks?');
const MANA_ROCKS = word('mana[\\s-]?rocks?|mana[\\s-]?stein(?:e|en)?');
// Not inside a phrase about taking a creature ("die Kontrolle übernehmen", "gain control of")
// or about the cards a player has ("creatures you control", "you don't control")
const ARCHETYPE_WORDS: readonly (readonly [Archetype, RegExp])[] = [
  ['aggro', word(`aggro|aggressiv${ending}`)],
  [
    'control',
    word(
      "(?<!(?:(?:gain|tak|steal)\\p{L}*|you|n['’]?t|not)\\s+)control(?!\\s+(?:of|over)(?![\\p{L}]))|(?<!(?:ubern|erhalt|erlang|gewinn)\\p{L}*\\s+(?:die\\s+)?)kontroll(?:e)?(?!\\s+uber)",
    ),
  ],
  ['midrange', word('mid[\\s-]?range')],
];

// "unter 2 €", "bis 1,50 Euro", "under 3 eur", "unter 50 Cent". Dollar prices stay unread:
// prices are in euro.
const MAX_PRICE =
  /(?:unter|bis|max\.?|maximal|hochstens|under|below|up\s+to|<|≤)\s*(?:(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur(?:o|os)?(?![\p{L}]))|(?<cents>\d{1,3})\s*(?:cents?|ct)(?![\p{L}]))/gu;
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
// "zwischen 2 und 4 Mana", "2 bis 4 Mana", "2-4 Mana", "between 2 and 4 mana"
const MANA_RANGE =
  /(?<![\p{L}\d])(?:(?:zwischen|between)\s+(?<from>\d{1,2})\s+(?:und|and)\s+(?<to>\d{1,2})|(?<from2>\d{1,2})\s*(?:-|–|bis|to)\s*(?<to2>\d{1,2}))\s*mana/gu;
// "bis 3 Mana", "höchstens 3 Mana", "unter 3 Mana", "3 mana or less"
const AT_MOST_MANA =
  /(?:(?:bis|max\.?|maximal|hochstens|at\s+most|up\s+to|≤|<=)\s*(?<n>\d{1,2})\s*mana)|(?:(?<below>unter|weniger\s+als|below|under|less\s+than|<)\s*(?<n2>\d{1,2})\s*mana)|(?:(?<n3>\d{1,2})\s*mana\s+(?:oder\s+weniger|or\s+less))/gu;
const DROP = word('(?<n>\\d{1,2})[\\s-]?drops?');
const EXACT_MANA = word('(?<n>\\d{1,2})\\s*mana');

const SORT_WORDS: readonly (readonly [SortKey, RegExp])[] = [
  ['value-asc', word('gunstig\\p{L}*|billig\\p{L}*|preiswert\\p{L}*|cheap\\p{L}*|budget')],
  ['value-desc', word('teuer\\p{L}*|teur\\p{L}*|wertvoll\\p{L}*|expensive|valuable')],
  // "stark", "mächtig", "beste", "top" and "die reinknallen" have no field of their own: the
  // most played first. Only these forms, so "Starkstrom" is no order; "stark", "starke" and
  // "starken" are STRONG.
  [
    'played',
    word(
      `beliebt\\p{L}*|meistgespielt\\p{L}*|popular|most\\s+played|starksten?|strong|powerful|machtige?|reinknallen|best${ending}|top`,
    ),
  ],
];
// "Stärke" is a creature's power and "starke" means strong, but without accents both read
// "starke". So these forms order by play rate only if the request as typed has no "Stärke":
// "Kreaturen mit hoher Stärke" is no order, and "Stärke des Willens" keeps its name words.
const STRONG: readonly [SortKey, RegExp] = ['played', word('stark(?:e|en)?')];
const STRENGTH_NOUN = /(?<![\p{L}\d])stärken?(?![\p{L}\d])/iu;

/**
 * Words that carry no filter: "zeig mir alle Karten mit …", "a card that …". "nur" and "only"
 * are mono before a colour word (MONO) and filler words elsewhere.
 */
const FILLER = new Set(
  (
    'a alle all an and are auf aus bitte cards card das dem den der des die ein eine einem einen ' +
    'einer find for from fur gib haben has have i ich im in is karte karten me mich mir mit nach ' +
    'oder of or show some suche such the to welche which with zeig zeige und von zu deck decks ' +
    'that who nur only'
  ).split(' '),
);

/** Blanks out and returns the matches of `pattern` in the request, those that `keep` keeps. */
type Take = (pattern: RegExp, keep?: (match: RegExpExecArray) => boolean) => RegExpExecArray[];

/** What readFilters needs besides the request. */
interface FilterContext {
  /** The creature types of the cards, lower case, that a request word may name ("Elfen"). */
  readonly creatureTypes: ReadonlySet<string>;
  /** Whether the request as typed has the noun "Stärke", so "starke" is no order (STRONG). */
  readonly strengthNoun: boolean;
}

/**
 * Reads `request` and blanks out what it understood, so the rest can be checked. `sets` are
 * the sets the request may name and `creatureTypes` the creature types of the cards, lower
 * case; without them no set and no creature type is read.
 */
export function parseQuery(
  request: string,
  sets: readonly SearchSet[] = [],
  creatureTypes: readonly string[] = [],
): SearchQuery {
  const context: FilterContext = {
    creatureTypes: new Set(creatureTypes),
    strengthNoun: STRENGTH_NOUN.test(request.normalize('NFC')),
  };
  const codes = readSetCodes(request, sets, FILLER);
  const text = normalizeForSearch(codes.rest);
  // Sets first, so "Battle for Zendikar" asks for no battles. A trial run of the filters tells
  // which words they read, for a one-word set name next to one ("Bloomburrow creatures").
  const words = [...text.matchAll(/[\p{L}\d]+/gu)];
  const trial = sets.length > 0 ? readFilters(text, context).rest : text;
  const filterWords = new Set(
    words.flatMap((word, index) =>
      trial.slice(word.index, word.index + word[0].length).trim() === '' ? [index] : [],
    ),
  );
  const named = readSetNames(
    words.map(([word]) => word),
    sets,
    FILLER,
    filterWords,
  );
  let rest = text;
  for (const index of named.used) {
    const word = words[index]!;
    rest = blank(rest, word.index, word[0].length);
  }
  return {
    sets: [...new Set([...codes.codes, ...named.codes])],
    ...readFilters(rest, context).filters,
  };
}

/**
 * Every filter but the sets in `text`, the normalized request, and the text that is left once
 * what they read is blanked out.
 */
function readFilters(
  text: string,
  context: FilterContext,
): { filters: Omit<SearchQuery, 'sets'>; rest: string } {
  let rest = text;
  const take: Take = (pattern, keep = () => true) => {
    const matches = [...rest.matchAll(pattern)].filter(keep);
    for (const match of matches) rest = blank(rest, match.index, match[0].length);
    return matches;
  };
  // The creature types of the cards that a request word may name
  const typesOf = (word: string) =>
    tribeCandidates(word).filter((type) => context.creatureTypes.has(type));

  // Synergies first, so "Synergie mit Artefakten" asks for no artifacts and "mit Fliegern" for
  // no flyers
  const synergyText = [...take(SYNERGY_AFTER), ...take(SYNERGY_BEFORE)]
    .map((match) => match[0])
    .join(' ');
  const answerText = [...take(ANSWER_AFTER), ...take(ANSWER_BEFORE)]
    .map((match) => match[0])
    .join(' ');
  const answers = SYNERGIES.filter((theme) => answerText.search(SYNERGY_WORDS[theme]) >= 0);
  const bare = BARE_SYNERGIES.filter(([, pattern]) => take(pattern).length > 0).map(
    ([synergy]) => synergy,
  );
  const synergies = SYNERGIES.filter(
    (synergy) => synergyText.search(SYNERGY_WORDS[synergy]) >= 0 || bare.includes(synergy),
  );
  const tribes = [
    ...[...take(TRIBE_AFTER), ...take(TRIBE_BEFORE)].map((match) =>
      tribeCandidates(match.groups?.tribe ?? ''),
    ),
    ...take(TRIBE_NEXT, (match) => typesOf(match.groups?.tribe ?? '').length > 0).map((match) =>
      typesOf(match.groups?.tribe ?? ''),
    ),
  ].filter((candidates) => candidates.length > 0);
  const dorks = take(MANA_DORKS).length > 0;
  const rocks = take(MANA_ROCKS).length > 0;
  const roles = ROLE_WORDS.filter(
    ([role, pattern]) => take(pattern).length > 0 || (role === 'ramp' && (dorks || rocks)),
  ).map(([role]) => role);
  // Every archetype word is understood; the one named first counts ("aggro control" is aggro)
  const archetype =
    ARCHETYPE_WORDS.flatMap(([name, pattern]) =>
      take(pattern).map((match) => [match.index, name] as const),
    ).sort(([a], [b]) => a - b)[0]?.[1] ?? null;

  const price = take(MAX_PRICE)[0];
  const cents = price?.groups?.cents;
  const maxPrice = !price
    ? null
    : cents !== undefined
      ? Number(cents) / 100
      : Number(price[1]!.replace(',', '.'));
  const { minMana, maxMana } = readMana(take);
  const { colors, colorMode, notColors } = readColors(take);

  const typeGroups: CardType[][] = JOINED_TYPE_WORDS.filter(
    ([, pattern]) => take(pattern).length > 0,
  ).map(([joined]) => [...joined]);
  for (const [type, pattern] of TYPE_WORDS) {
    if (
      take(pattern).length > 0 ||
      (type === 'creature' && dorks) ||
      (type === 'artifact' && rocks)
    ) {
      typeGroups.push([type]);
    }
  }
  if (take(SPELL).length > 0) typeGroups.push(['instant'], ['sorcery']);
  const types = [...new Set(typeGroups.flat())];
  // "ohne Fliegen" before the keywords themselves, so its "Fliegen" asks for no flying
  const notKeywords = KEYWORDS.filter(
    (keyword) => take(negated(KEYWORD_WORDS[keyword])).length > 0,
  );
  const keywords = KEYWORDS.filter((keyword) => take(KEYWORD_WORDS[keyword]).length > 0);
  const sortWords = context.strengthNoun ? SORT_WORDS : [...SORT_WORDS, STRONG];
  const sort = sortWords.find(([, pattern]) => take(pattern).length > 0)?.[0] ?? null;
  // Last, among the words no other filter read: "Elfen", "dragons", "Zombies in Schwarz"
  const creatureTypes = [
    ...new Set(
      take(/\p{L}+/gu, ([word]) => !FILLER.has(word) && typesOf(word).length > 0).flatMap(
        ([word]) => typesOf(word),
      ),
    ),
  ];
  const unknown = rest.split(/[^\p{L}\d]+/u).filter((word) => word.length > 1 && !FILLER.has(word));

  return {
    filters: {
      colors,
      colorMode,
      exactColors: colorMode === 'exact',
      notColors,
      types,
      typeGroups,
      creatureTypes,
      keywords,
      notKeywords,
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
    },
    rest,
  };
}

/**
 * The mana value limits. A number wins over a phrase ("Finisher 6 Mana" is 6); "Late Game",
 * "Low-Mana" and the like only fill a side no number named, and only where they fit: "Late Game
 * ab 7 Mana" is 7 or more, "Late Game bis 7 Mana" 5 to 7.
 */
function readMana(take: Take): { minMana: number | null; maxMana: number | null } {
  let minMana: number | null = null;
  let maxMana: number | null = null;
  const range = take(MANA_RANGE)[0];
  const atMost = take(AT_MOST_MANA)[0];
  const atLeast = take(AT_LEAST_MANA)[0];
  const low = take(LOW_MANA).length > 0;
  const late = take(LATE_GAME).length > 0;
  if (range) {
    const groups = range.groups ?? {};
    const ends = [Number(groups.from ?? groups.from2), Number(groups.to ?? groups.to2)];
    minMana = Math.min(...ends);
    maxMana = Math.max(...ends);
  } else if (atMost || atLeast) {
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
  } else {
    const exact = take(DROP)[0] ?? take(EXACT_MANA)[0];
    if (exact) minMana = maxMana = Number(exact.groups?.n);
  }
  if (late && minMana === null && (maxMana === null || maxMana >= 5)) minMana = 5;
  if (low && maxMana === null && (minMana === null || minMana <= 2)) maxMana = 2;
  return { minMana, maxMana };
}

/**
 * The colours and how the cards must fit them (ColorMode), and the colours they must not have.
 * The ruled out ones first, so "nicht blau" asks for no blue cards, and mono before the colour
 * words, which it needs right behind it.
 */
function readColors(take: Take): { colors: string; colorMode: ColorMode; notColors: string } {
  const notColors = COLOR_WORDS.filter(([, pattern]) => take(negated(pattern)).length > 0)
    .map(([color]) => color)
    .join('');
  const guild = take(GUILD)[0];
  if (take(COLORLESS).length > 0) return { colors: '', colorMode: 'exact', notColors };
  if (guild) return { colors: GUILDS[guild[0]]!, colorMode: 'within', notColors };
  const mono = take(MONO).length > 0;
  const colors = COLOR_WORDS.filter(([, pattern]) => take(pattern).length > 0)
    .map(([color]) => color)
    .join('');
  return { colors, colorMode: mono && colors.length > 0 ? 'exact' : 'all', notColors };
}

/** Whether the request named any filter or order at all. */
export function understood(query: SearchQuery): boolean {
  return (
    query.sets.length > 0 ||
    query.colors !== '' ||
    query.exactColors ||
    query.notColors !== '' ||
    query.types.length > 0 ||
    query.creatureTypes.length > 0 ||
    query.keywords.length > 0 ||
    query.notKeywords.length > 0 ||
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
 * (lib/cards/sort.ts); nameWins decides whether the request is then searched as that name.
 */
export function exactNameMatch(request: string, names: ReadonlySet<string>): boolean {
  return names.has(normalizeForSearch(request).trim());
}

/**
 * Whether the request is searched as the card name it is (exactNameMatch). It is where the
 * request names no filter ("Dark Ritual") or words are left that no filter reads ("Control
 * Magic", "Wall of Omens"). Where every word reads as a filter ("Flash", "Counterspell",
 * "Wrath of God" with the creature type God) the filters win; searchResults
 * (lib/search/results.ts) then puts the card of that name on top of their results.
 */
export function nameWins(query: SearchQuery, request: string, names: ReadonlySet<string>): boolean {
  return exactNameMatch(request, names) && (!understood(query) || query.unknown.length > 0);
}

/** A request that names no filter at all. */
const NO_FILTERS: SearchQuery = {
  sets: [],
  colors: '',
  colorMode: 'all',
  exactColors: false,
  notColors: '',
  types: [],
  typeGroups: [],
  creatureTypes: [],
  keywords: [],
  notKeywords: [],
  synergies: [],
  answers: [],
  tribes: [],
  roles: [],
  archetype: null,
  minMana: null,
  maxMana: null,
  maxPrice: null,
  sort: null,
  unknown: [],
};

/**
 * The query of a name search: no filter, and every word of the request a word of the name,
 * filler words too, so "Day of Judgment" puts the card of exactly that name first (nameRank).
 */
export function nameQuery(request: string): SearchQuery {
  return { ...NO_FILTERS, unknown: searchWords(request) };
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
  const colorsFit: Readonly<Record<ColorMode, (cardColors: string) => boolean>> = {
    all: (cardColors) => colors.every((color) => cardColors.includes(color)),
    exact: (cardColors) => cardColors === query.colors,
    // A colourless card is no card of a guild deck in particular
    within: (cardColors) =>
      cardColors !== '' && [...cardColors].every((color) => colors.includes(color)),
  };
  const fitsColors = colorsFit[query.colorMode];
  const manaLimit = query.minMana !== null || query.maxMana !== null;
  const archetype = query.archetype === null ? null : ARCHETYPE_RULES[query.archetype];
  return (card) =>
    (query.sets.length === 0 || card.printedIn.some((code) => query.sets.includes(code))) &&
    fitsColors(card.colors) &&
    ![...query.notColors].some((color) => card.colors.includes(color)) &&
    (query.typeGroups.length === 0 ||
      query.typeGroups.some((group) => group.every((type) => card.types.includes(type)))) &&
    (query.creatureTypes.length === 0 ||
      card.creatureTypes.some((type) => query.creatureTypes.includes(type))) &&
    query.keywords.every((keyword) => card.keywords.includes(keyword)) &&
    !query.notKeywords.some((keyword) => card.keywords.includes(keyword)) &&
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
