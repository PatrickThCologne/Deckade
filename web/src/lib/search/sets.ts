/**
 * The sets a search request names, for the parser (lib/search/query.ts): by code in capitals
 * ("FRA"), by the English name in any word order ("Fractured Reality"), by a short name ("Crimson
 * Vow", "Lord of the Rings") or by the word before the colon ("Duskmourn"). Set names are words
 * of card names too ("Dark Ritual", "Uneasy Alliance", "Avatar of Woe"), so the rules are narrow;
 * docs/adr/0002-natural-language-search.md sums them up.
 */
import { normalizeForSearch } from '../cards/sort';
import { GERMAN_TRIBES, singular } from './tribes';

/** A set the request may name; on the site, the sets of the card list file. */
export interface SearchSet {
  readonly code: string;
  readonly name: string;
}

// A set name of one word is often a word of card names too ("Dark Ritual", "Uneasy Alliance"),
// so it names the set only on its own, right after one of these words ("aus Zendikar") or, from
// SINGLE_WORD_MIN letters on, next to a word a filter reads ("Bloomburrow creatures")
const SET_CUES = new Set(['aus', 'von', 'from', 'in', 'set', 'edition']);

// A set code counts only in capitals ("Kreaturen aus FRA", "DSK-Karten"): codes such as "one",
// "war" and "all" are also words. It is read in the request as typed, before lower case.
const SET_CODE = /(?<![\p{L}\d])[A-Z\d]*[A-Z][A-Z\d]*(?![\p{L}\d])/gu;
// Codes that are words a request is made of, besides the filler words: in capitals too they
// are the word ("ONE drop creatures") unless they stand right after a cue word ("aus ONE")
const CODE_WORDS = new Set(['one']);
const LAST_WORD = /([\p{L}\d]+)[^\p{L}\d]*$/u;

/**
 * The set codes in `request` as typed, and the request with them blanked out. A code that is
 * also one of the `filler` words ("ALL", "MIR") or "ONE" counts only right after a cue word, so
 * "ALL CARDS WITH FLYING" and "ZEIG MIR …" name no set, but "cards from ALL" does.
 */
export function readSetCodes(
  request: string,
  sets: readonly SearchSet[],
  filler: ReadonlySet<string>,
): { codes: string[]; rest: string } {
  const byCode = new Map(sets.map((set) => [set.code.toLowerCase(), set.code]));
  const codes: string[] = [];
  const rest = request.replace(SET_CODE, (code: string, offset: number) => {
    const lower = code.toLowerCase();
    const known = byCode.get(lower);
    if (known === undefined) return code;
    if (filler.has(lower) || CODE_WORDS.has(lower)) {
      const before = LAST_WORD.exec(request.slice(0, offset))?.[1]?.toLowerCase() ?? '';
      if (!SET_CUES.has(before)) return code;
    }
    codes.push(known);
    return ' '.repeat(code.length);
  });
  return { codes, rest };
}

// Words a set name needs not repeat: "War of the Spark" is named by "War Spark" as well
const SET_NAME_FILLER = new Set(['the', 'of', 'and']);
const nameWords = (text: string) => normalizeForSearch(text).match(/[\p{L}\d]+/gu) ?? [];
const isNumber = (word: string) => /^\d+$/.test(word);
// "Fractured Reality" names "Reality Fracture": one word may start with the other, but only
// as another ending, from 4 letters on and at most 2 letters longer. So "all" does not name
// "Alliances", "vows" not "Crimson Vow", and "Aether", "cold" and "listige" not "Aetherdrift",
// "Coldsnap" and "The List".
const sameWord = (a: string, b: string) =>
  a === b ||
  (Math.min(a.length, b.length) >= 4 &&
    Math.abs(a.length - b.length) <= 2 &&
    (a.startsWith(b) || b.startsWith(a)));
// A single word names a set beyond the plain rules only from 5 letters on, as shorter words
// are in too many card names ("Stitch in Time", "Dark Ritual"): a one-word set name next to a
// word a filter reads ("Bloomburrow creatures"), a word after a cue that several set names
// share ("aus Eldraine"), and a single word before the colon ("Duskmourn", "Kamigawa"). Longer
// parts before the colon ("March of the Machine") are short names instead (namesOf).
const SINGLE_WORD_MIN = 5;
// A creature type the parser knows ("Avatar of Woe") only counts as a set right after a cue word
const KNOWN_TRIBES = new Set(GERMAN_TRIBES.map(([, english]) => english));
const isCreatureType = (word: string) => singular(word).some((type) => KNOWN_TRIBES.has(type));
// Format names that are words of several set names ("Modern Horizons", "Commander Legends"):
// "Karten in Modern" asks for the format, not for every set with that word
const FORMATS = new Set([
  'standard',
  'pioneer',
  'modern',
  'legacy',
  'vintage',
  'pauper',
  'commander',
]);
// "Marvel's Spider-Man": a name may leave out a possessive at its start
const POSSESSIVE_START = /^\S+['’]s\s+/u;

/** One way to name a set: its full name or a short one ("Crimson Vow"). */
interface SetName {
  readonly code: string;
  /** Every word of the name, normalized. */
  readonly words: readonly string[];
  /** The words a request must have: numbers, and words of 3 letters or more but no filler. */
  readonly needed: readonly string[];
  /** A short name loses to a full name of as many words ("Commander Legends" is not CLB). */
  readonly short: boolean;
  /** The word before the colon of a full name, if that part is one word ("Duskmourn: …"). */
  readonly beforeColon: string | null;
}

const setName = (
  code: string,
  text: string,
  short: boolean,
  beforeColon: string | null,
): SetName => {
  const words = nameWords(text);
  return {
    code,
    words,
    needed: words.filter(
      (word) => (word.length >= 3 || isNumber(word)) && !SET_NAME_FILLER.has(word),
    ),
    short,
    beforeColon,
  };
};

/**
 * The full name of a set and its short names: the part after the colon ("Crimson Vow"), the
 * part before it if that has several words ("The Lord of the Rings") and the name without a
 * possessive at its start ("Spider-Man"). A short name needs at least two words; one word
 * would be a word of too many card names ("Saga" for "Urza's Saga").
 */
function namesOf(set: SearchSet): SetName[] {
  const colon = set.name.indexOf(':');
  const before = colon < 0 ? [] : nameWords(set.name.slice(0, colon));
  const full = setName(set.code, set.name, false, before.length === 1 ? before[0]! : null);
  const parts =
    colon < 0
      ? [set.name.replace(POSSESSIVE_START, '')]
      : [set.name.slice(0, colon), set.name.slice(colon + 1)];
  const short = parts
    .filter((part) => part !== set.name)
    .map((part) => setName(set.code, part, true, null))
    .filter((name) => name.needed.length >= 2);
  return [full, ...short];
}

// The site parses every request against the same list of sets, so its names are read once
const setNamesCache = new WeakMap<readonly SearchSet[], readonly SetName[]>();
function setNames(sets: readonly SearchSet[]): readonly SetName[] {
  let names = setNamesCache.get(sets);
  if (!names) {
    names = sets.flatMap(namesOf);
    setNamesCache.set(sets, names);
  }
  return names;
}

/**
 * Which request word stands for each needed word of a set name, or null if one is missing.
 * Each request word stands for one name word only, so "3" in "Modern Horizons 3 … bis 3 Mana"
 * is left for the mana value. A name word prefers the request word written exactly so over
 * another ending, and a request word after the previous name word's over an earlier one. A
 * number counts only right after the previous name word, so "Modern Horizons Kreaturen bis 3
 * Mana" is Modern Horizons and the 3 the mana value.
 */
function nameTokens(needed: readonly string[], tokens: readonly string[]): number[] | null {
  const used: number[] = [];
  for (const name of needed) {
    const last = used.at(-1) ?? -1;
    if (isNumber(name) && last >= 0) {
      if (tokens[last + 1] !== name) return null;
      used.push(last + 1);
      continue;
    }
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

/** The items with the highest score. */
function best<T>(items: readonly T[], score: (item: T) => number): T[] {
  const top = Math.max(...items.map(score));
  return items.filter((item) => score(item) === top);
}

/**
 * The sets named by the words of a request (normalized, lib/cards/sort.ts), and the indexes of
 * the words that named them. `filler` are the words that carry no filter ("Karten"),
 * `filterWords` the indexes of the words a filter reads ("creatures", "removal").
 *
 * A set is named when every needed word of its full or a short name is in the request, in any
 * order, a name of one word only on its own, after one of SET_CUES or next to a filter word. Of
 * those, the names with the most words count, so "Innistrad: Crimson Vow" is not Innistrad as
 * well; then those whose words stand together ("Tarkir Dragonstorm dragons" is not Dragons of
 * Tarkir), then those written exactly so, then full names over short ones. Without such a name,
 * a word right after a cue that several set names share names all of them ("aus Eldraine"),
 * and an exact word of 5 letters or more before a colon names that set ("Duskmourn").
 */
export function readSetNames(
  words: readonly string[],
  sets: readonly SearchSet[],
  filler: ReadonlySet<string>,
  filterWords: ReadonlySet<number>,
): { codes: string[]; used: Set<number> } {
  const names = setNames(sets);
  const cued = (index: number) => SET_CUES.has(words[index - 1] ?? '');

  const oneWordNamed = (name: SetName, index: number) => {
    // "cards from The Dark": the other words of the name may stand in between
    let before = index - 1;
    while (before >= 0 && name.words.includes(words[before]!)) before--;
    if (SET_CUES.has(words[before] ?? '')) return true;
    const alone = words.every(
      (word, other) => other === index || word.length < 2 || filler.has(word),
    );
    if (alone) return true;
    const word = name.needed[0]!;
    return (
      word.length >= SINGLE_WORD_MIN &&
      !isCreatureType(word) &&
      (filterWords.has(index - 1) || filterWords.has(index + 1))
    );
  };

  const fits = names.flatMap((name) => {
    const used = name.needed.length > 0 ? nameTokens(name.needed, words) : null;
    if (used === null) return [];
    if (used.length === 1 && !oneWordNamed(name, used[0]!)) return [];
    const exact = used.filter((index, i) => words[index] === name.needed[i]).length;
    const low = Math.min(...used);
    const together = words
      .slice(low, Math.max(...used) + 1)
      .every((word, i) => used.includes(low + i) || name.words.includes(word));
    return [{ name, used, exact, together }];
  });
  // Most words first, then words together, then words written exactly so, then full names
  const ranking: ((fit: (typeof fits)[number]) => number)[] = [
    ({ used }) => used.length,
    ({ together }) => Number(together),
    ({ exact }) => exact,
    ({ name }) => Number(!name.short),
  ];
  const named = ranking.reduce(best, fits);

  const used = new Set(named.flatMap(({ used }) => used));
  if (named.length > 0) {
    // Only the request words that named the set are taken, and the short words of its name
    // ("be" in "All Will Be One"): the second "3" of "Modern Horizons 3 bis 3 Mana" is the mana
    words.forEach((word, index) => {
      if (named.some(({ name }) => name.words.includes(word) && !name.needed.includes(word))) {
        used.add(index);
      }
    });
    return { codes: [...new Set(named.map(({ name }) => name.code))], used };
  }

  const full = names.filter((name) => !name.short);
  const codes: string[] = [];
  words.forEach((word, index) => {
    if (word.length < SINGLE_WORD_MIN) return;
    // "aus Eldraine" is Throne of Eldraine and Wilds of Eldraine
    if (cued(index) && !FORMATS.has(word)) {
      const sharing = new Set(full.filter((name) => name.needed.includes(word)).map((n) => n.code));
      if (sharing.size >= 2) {
        codes.push(...sharing);
        used.add(index);
        return;
      }
    }
    // "Duskmourn", "Phyrexia"; a set called just that word wins ("Innistrad Crimson Vows" is
    // Innistrad)
    if (!cued(index) && isCreatureType(word)) return;
    const before = full.filter((name) => name.beforeColon === word);
    if (before.length === 0) return;
    const called = full.filter((name) => name.needed.length === 1 && name.needed[0] === word);
    codes.push(...(called.length > 0 ? called : before).map((name) => name.code));
    used.add(index);
  });
  return { codes: [...new Set(codes)], used };
}
