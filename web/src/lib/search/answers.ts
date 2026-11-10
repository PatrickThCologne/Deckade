/**
 * Answers the search understands ("Konter gegen Flieger", "removes blight"): what a card's rules
 * text fights, as the opposite of a synergy (lib/search/synergies.ts), over the same themes.
 * Read from the English rules text at build time. A match stays inside one sentence ([^.]*), so
 * "destroy" in one sentence and "flying" in the next do not make an answer.
 */
import { SYNERGIES, type Synergy } from './synergies';

const ANSWER_PATTERNS: Readonly<Partial<Record<Synergy, RegExp>>> = {
  flying:
    /\b(?:destroy|exile|deals? (?:\d+|x|that much) damage to|return)[^.]*\b(?:creatures? with flying|flying creatures?)|\bcreatures? with flying (?:your opponents control )?(?:get -|can't)|\b(?:target|each|all) creatures? with flying\b(?! you control)/,
  artifacts:
    /\b(?:destroy|exile|counter)[^.]*\b(?:target|all|each|any number of target|up to (?:one|two|three) target) (?:nonland |noncreature |nontoken )?artifacts?\b|\b(?:destroy|exile)[^.]*\bartifact(?:s)? (?:or|and) enchantments?\b|\bartifacts? your opponents control\b[^.]*\b(?:can't|lose)/,
  enchantments:
    /\b(?:destroy|exile|counter)[^.]*\b(?:target|all|each|any number of target|up to (?:one|two|three) target) (?:nonland |noncreature |nontoken )?enchantments?\b|\b(?:destroy|exile)[^.]*\b(?:artifact|creature) (?:or|and) enchantments?\b/,
  tokens: /\b(?:destroy|exile)[^.]*\b(?:target|all|each) (?:creature )?tokens?\b/,
  graveyard:
    /\bexile (?:all cards from )?(?:target player's|each opponent's|each player's|all|a|an opponent's) graveyards?\b|\bexile (?:up to \w+ )?target cards? from (?:a|an opponent's|target player's|a single) graveyard|\bcards? in graveyards can't\b|\bif a card would be put into an opponent's graveyard/,
  counters:
    /\bremove (?:all|a|an|one|two|three|x|any number of) (?:\+1\/\+1 )?counters? from\b|\bremove all counters\b/,
  blight:
    /\bremove (?:all|a|an|one|two|three|x|any number of) (?:-1\/-1 )?counters? from\b|\bremove all counters\b/,
  lifegain: /\bcan't gain life\b|\bwould gain life\b[^.]*\binstead\b/,
  spells: /\bcounter target (?:\w+ )?(?:spell|instant|sorcery)\b/,
  lands:
    /\b(?:destroy|exile)[^.]*\b(?:target|all|each|up to (?:one|two) target) (?:nonbasic )?lands?\b(?! you control)/,
};

/** What a card fights, read like its synergies: reminder text and its own name left out. */
export function cardAnswers(oracleText: string, name: string): Synergy[] {
  let text = oracleText.replace(/\([^)]*\)/g, '').toLowerCase();
  for (const face of name.toLowerCase().split(' // ')) {
    if (face) text = text.replaceAll(face, '');
  }
  return SYNERGIES.filter((theme) => ANSWER_PATTERNS[theme]?.test(text) ?? false);
}
