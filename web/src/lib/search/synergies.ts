/**
 * Synergies the search understands ("Synergie mit Artefakten"): what a card's rules text cares
 * about or makes. They are read from the English rules text at build time, like the keywords
 * (lib/search/keywords.ts). The German words are those on German cards ("Fäulnis" for blight,
 * "Marken" for counters), checked against the pipeline's German card texts.
 */

export const SYNERGIES = [
  'artifacts',
  'enchantments',
  'counters',
  'blight',
  'flying',
  'tokens',
  'graveyard',
  'lifegain',
  'sacrifice',
  'spells',
  'lands',
] as const;

export type Synergy = (typeof SYNERGIES)[number];

/**
 * What the English rules text says when a card works with the theme. Removal such as "destroy
 * target artifact" is no synergy, so a bare type name is not enough.
 */
const ORACLE_PATTERNS: Readonly<Record<Synergy, RegExp>> = {
  artifacts:
    /\bartifacts? you control|\bartifact (?:spells?|cards?|tokens?|creatures? you control)|\b(?:an?|another|one or more|other) (?:nontoken )?artifacts?\b(?! or)|\bfor each artifact|\bnumber of artifacts|\baffinity for artifacts|\bimprovise\b|\bmetalcraft\b|\b(?:treasure|clue|food|blood|map|powerstone|gold|junk|incubator) tokens?\b/,
  enchantments:
    /\benchantments? you control|\benchantment (?:spells?|cards?|creatures? you control)|\b(?:an?|another|one or more|other) (?:nontoken )?enchantments?\b(?! or)|\bfor each enchantment|\bnumber of enchantments|\bconstellation\b|\bauras? you control|\baura spells?\b|\beerie\b/,
  counters:
    /[+-]1\/[+-]1 counters?|\bproliferate\b|\bcounters? (?:on|from)\b|\b(?:bolster|adapt|evolve|mentor|backup|outlast)\b/,
  blight: /\bblight(?:s|ed)?\b|-1\/-1 counters?/,
  // Not "damage to each creature with flying": that fights flyers instead of using them
  flying:
    /\bcreatures? you control with flying|\b(?:other|another) creatures? (?:you control )?with flying|\bflying creatures? you control|\b(?:gains?|has|have)(?: [\w,]+){0,3}? (?:and )?flying\b|\btokens? with flying|\bflyers?\b/,
  tokens: /\btokens?\b/,
  graveyard:
    /\b(?:from|in) (?:your|a|their|an opponent's|each player's) graveyard|\bcards? in graveyards\b|\bmills?\b|\bsurveil\b|\bflashback\b|\bescape\b|\bdelve\b|\bdisturb\b|\bunearth\b|\bembalm\b|\beternalize\b|\bdelirium\b|\bthreshold\b|\bcraft with\b/,
  lifegain:
    /\byou gain (?:\d+ |x |that much )?life\b|\bgains? \d+ life\b|\bgain life\b|\blifelink\b/,
  sacrifice:
    /\bsacrifice (?:an?|another|one or more|any number of|x|two|three)\b|\bwhenever you sacrifice\b|\bsacrificed\b/,
  spells:
    /\binstant (?:or|and) sorcery|\binstants? (?:or|and) sorceries|\bnoncreature spells?|\b(?:instant|sorcery) spells?|\bmagecraft\b|\bprowess\b/,
  lands:
    /\blandfall\b|\bwhenever (?:a|one or more) lands?\b|\blands? you control\b|\bplay an additional land\b|\bland cards?\b/,
};

/**
 * The synergies of a card, read from its English rules text. Reminder text in brackets is
 * left out (blight explains itself with -1/-1 counters, which is no counter theme of its own),
 * and so is the card's own name ("Skithiryx, the Blight Dragon").
 */
export function cardSynergies(oracleText: string, name: string): Synergy[] {
  let text = oracleText.replace(/\([^)]*\)/g, '').toLowerCase();
  for (const face of name.toLowerCase().split(' // ')) {
    if (face) text = text.replaceAll(face, '');
  }
  return SYNERGIES.filter((synergy) => ORACLE_PATTERNS[synergy].test(text));
}
