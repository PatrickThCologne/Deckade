/**
 * Roles the search understands ("Karten zum Rampen"): what a card does for its deck. Like the
 * synergies (lib/search/synergies.ts) they are read from the English rules text at build time,
 * and the archetypes of the search (aggro, control, midrange) are fixed rules over them and the
 * mana value (lib/search/query.ts). Both are a rough reading of the rules text, not deck data.
 */

// New roles go at the end: the card list file stores each role as its index in this list
export const ROLES = ['ramp', 'removal', 'counterspell', 'wipe', 'draw', 'burn', 'tutor'] as const;

export type Role = (typeof ROLES)[number];

/**
 * What the English rules text says when a card has the role. Removal deals with a creature, a
 * planeswalker or any (nonland) permanent; a card that only hits artifacts or enchantments
 * ("Naturalize") answers those (lib/search/answers.ts) but is no removal. Damage to a creature
 * is removal, damage to a player or "any target" is burn. A card that is exiled and comes back
 * by itself (BLINK below), a card exiled from a graveyard and -X/-0 (the creature keeps its
 * toughness) are no removal. A wipe hits every creature or every opposing one, not only those
 * in a fight or your own. Drawing a single card replaces the card itself, so draw needs two or
 * more, and drawing as many as were discarded (rummaging) is no draw either; what an opponent
 * draws is no draw. A tutor puts a card of your choice into the hand, onto the battlefield or
 * on top of the library; a search for lands is ramp, or nothing if the land goes to the hand.
 */
const ORACLE_PATTERNS: Readonly<Record<Role, RegExp>> = {
  ramp: /\{t\}[^.:\n]*: add\b|\bsacrifice this token: add\b|\bsearch your library for [^.]*\b(?:land|forest|plains|island|swamp|mountain) cards?\b[^.]*\bonto the battlefield|\bplay (?:an|two|three) additional lands?\b|\bput (?:a|up to \w+) lands? cards? from your hand onto the battlefield/,
  removal:
    /\b(?:destroy|exile) (?:up to \w+ )?(?:another )?target (?:[\w-]+,? (?:or )?){0,3}?(?:creature|permanent|planeswalker)s?\b(?!(?: creature)? (?:you control|cards?)\b)|\bdeals? (?:(?:\d+|x|that much) )?damage (?:equal to [^.]*? )?to (?:up to \w+ )?(?:another )?target (?:[\w-]+ (?:or [\w-]+ )?)?(?:creature|planeswalker)\b|\btarget creature (?:an opponent controls )?gets -(?:\d+|x)\/-(?:[1-9]\d*|x)\b|\b(?:target|each) (?:player|opponent) sacrifices (?:a|an|one|two|three) (?:[\w-]+ )?(?:creature|planeswalker|permanent)s?\b/,
  counterspell: /\bcounter target (?:[\w-]+,? (?:or )?){0,3}(?:spell|ability)\b/,
  wipe: /\b(?:destroy|exile) (?:all (?:other )?(?:(?!blocking |blocked )[\w-]+ )?(?:creatures|permanents|planeswalkers)|each (?:other )?(?:[\w-]+ )?(?:creature|permanent|planeswalker))\b(?! you control\b)|\ball (?:other )?(?:[\w-]+ )?creatures (?:your opponents control )?get -(?:\d+|x)\/-(?:[1-9]\d*|x)\b|\beach (?:other )?creature (?:your opponents control )?gets -(?:\d+|x)\/-(?:[1-9]\d*|x)\b|\bcreatures your opponents control get -(?:\d+|x)\/-(?:[1-9]\d*|x)\b|\bdeals? (?:(?:\d+|x|that much) )?damage to each (?:other )?(?:[\w-]+ )?creature\b(?! (?:blocking|blocked|you control)\b)/,
  draw: /(?<!opponents? )\bdraws? (?:two|three|four|five|six|seven|x|\d+) cards\b|(?<!opponents? |\bdiscard[^.]*)\bdraws? that many cards\b|(?<!opponents? )\bdraws? cards equal to\b/,
  burn: /\bdeals? (?:(?:\d+|x|that much) )?damage (?:equal to [^.]*? )?to (?:any (?:other )?target|(?:each|target|that) (?:opponent|player))\b/,
  tutor:
    /\bsearch your library for (?:an?|up to \w+) (?!(?:[\w-]+,? (?:or )?)*?(?:basic |snow )?(?:land|plains|island|swamp|mountain|forest)s?\b)(?:[\w'-]+,? (?:or )?){0,4}?cards?\b[^.]*?\b(?:into your hand|onto the battlefield|on top)\b/,
};

// Exile that brings the card back by itself: "Exile target creature. Return that card to the
// battlefield …", "Exile target nontoken permanent, then return it …". It is taken out of the
// text before removal is read. "Return the exiled card" once the exiling permanent leaves (Fiend
// Hunter) does not count here, so that stays removal.
const BLINK =
  /\bexile [^.]*?\btarget [^.]*?(?:,? then |\.\s*(?:at the beginning of the next end step, )?)return (?:it|that card|them|those cards) to the battlefield\b/g;

/**
 * The roles of a card, read from its English rules text. Reminder text in brackets is left out
 * ("Flying (This creature deals 3 damage …)" is no burn), and so is the card's own name. The
 * name is taken out as written, before lower case, so a card called like a rules word ("Card")
 * keeps that word in its text. A land's mana or a land it fetches is what every deck's lands
 * do, so lands have no ramp, and neither has the land face of a double-faced card. In the data
 * the faces are separated by a blank line, in the order of the faces of `typeLine`; a land face
 * is "Land" there, and newer texts also call it "this land", which is all a caller without the
 * type line has.
 */
export function cardRoles(
  oracleText: string,
  name: string,
  isLand: boolean,
  typeLine = '',
): Role[] {
  let text = oracleText.replace(/\([^)]*\)/g, '');
  for (const face of name.split(' // ')) {
    if (face) text = text.replaceAll(face, '');
  }
  text = text.toLowerCase();
  const faceTypes = typeLine.split(' // ');
  const spellFaces = text
    .split('\n\n')
    .filter(
      (face, index) => !/\bLand\b/.test(faceTypes[index] ?? '') && !/\bthis land\b/.test(face),
    )
    .join('\n\n');
  return ROLES.filter((role) =>
    role === 'ramp'
      ? !isLand && ORACLE_PATTERNS.ramp.test(spellFaces)
      : ORACLE_PATTERNS[role].test(role === 'removal' ? text.replace(BLINK, '') : text),
  );
}
