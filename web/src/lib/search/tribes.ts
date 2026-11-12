/**
 * Creature types a card works with ("synergiert mit Elementarwesen", "synergy with Elves"): read
 * at build time from the English rules text, against the creature types that appear in the type
 * lines of all cards. German requests name the common types by their German card words; English
 * requests may name any type.
 */

// Artifact types that a few artifact creatures carry too; as themes they are artifacts and
// tokens (lib/search/synergies.ts), not creature types
const NOT_CREATURE_TYPES = new Set([
  'Treasure',
  'Food',
  'Clue',
  'Equipment',
  'Vehicle',
  'Blood',
  'Map',
  'Gold',
  'Powerstone',
  'Junk',
  'Incubator',
  'Attraction',
]);

/** The creature types in a type line: "Creature — Elf Warrior" -> Elf, Warrior. */
export function creatureTypes(typeLine: string): string[] {
  return typeLine.split(' // ').flatMap((face) => {
    const [types, subtypes] = face.split(' — ');
    if (!subtypes || !/\b(?:Creature|Kindred|Tribal)\b/.test(types ?? '')) return [];
    return subtypes
      .split(' ')
      .filter((type) => /^[A-Z][a-z'-]+$/.test(type) && !NOT_CREATURE_TYPES.has(type));
  });
}

const IRREGULAR: Readonly<Record<string, string>> = {
  elves: 'elf',
  dwarves: 'dwarf',
  wolves: 'wolf',
  mice: 'mouse',
  werewolves: 'werewolf',
  thieves: 'thief',
};

/** The singular a plural most likely stands for; the caller checks it is a creature type. */
export function singular(word: string): string[] {
  const lower = word.toLowerCase();
  const irregular = IRREGULAR[lower];
  if (irregular) return [irregular];
  return [lower, lower.replace(/es$/, ''), lower.replace(/s$/, ''), lower.replace(/ies$/, 'y')];
}

// "Elementals you control", "another Elf", "Goblin spells", "for each Zombie", "Soldier
// creature token": the type stands next to what makes it a theme of the card.
const MENTION =
  /\b(?:(?:other|another|each|every|nontoken|target)\s+)?([A-Z][a-z'-]+)\b(?=\s+(?:you control|spells?|cards?|creatures?|tokens?|permanents?|you cast)\b)|\b(?:other|another|each|every)\s+([A-Z][a-z'-]+)\b/g;

/** The creature types a card's rules text works with, lower case; the card's own name left out. */
export function cardTribes(oracleText: string, name: string, known: ReadonlySet<string>): string[] {
  let text = oracleText.replace(/\([^)]*\)/g, '');
  for (const face of name.split(' // ')) {
    if (face) text = text.replaceAll(face, '');
  }
  const found = new Set<string>();
  for (const match of text.matchAll(MENTION)) {
    const word = match[1] ?? match[2] ?? '';
    const type = singular(word).find((candidate) => known.has(candidate));
    if (type) found.add(type);
  }
  return [...found].sort();
}

/**
 * German words for common creature types, as they start on German cards (normalized: no
 * umlauts). "Elementarkreaturen" and "Elementarwesen" both start with "elementar".
 */
export const GERMAN_TRIBES: readonly (readonly [string, string])[] = [
  ['elementar', 'elemental'],
  ['elf', 'elf'],
  ['elfen', 'elf'],
  ['goblin', 'goblin'],
  ['zombie', 'zombie'],
  ['vampir', 'vampire'],
  ['engel', 'angel'],
  ['drache', 'dragon'],
  ['meervolk', 'merfolk'],
  ['mensch', 'human'],
  ['ritter', 'knight'],
  ['zauberer', 'wizard'],
  ['krieger', 'warrior'],
  ['geist', 'spirit'],
  ['feen', 'faerie'],
  ['katze', 'cat'],
  ['ratte', 'rat'],
  ['eichhorn', 'squirrel'],
  ['dinosaurier', 'dinosaur'],
  ['pirat', 'pirate'],
  ['soldat', 'soldier'],
  ['kleriker', 'cleric'],
  ['schurke', 'rogue'],
  ['schamane', 'shaman'],
  ['druide', 'druid'],
  ['zwerg', 'dwarf'],
  ['wolf', 'wolf'],
  ['wolfe', 'wolf'],
  ['vogel', 'bird'],
  ['hund', 'dog'],
  ['damon', 'demon'],
  ['horror', 'horror'],
  ['schlange', 'snake'],
  ['spinne', 'spider'],
  ['werwolf', 'werewolf'],
  ['avatar', 'avatar'],
];

/**
 * The creature types a request word may name: the German one, or the English word's possible
 * singulars (the cards decide which one is a type).
 */
export function tribeCandidates(word: string): string[] {
  const german = GERMAN_TRIBES.find(([start]) => word.startsWith(start));
  if (german) return [german[1]];
  return /^[a-z'-]{3,}$/.test(word) ? [...new Set(singular(word))] : [];
}
