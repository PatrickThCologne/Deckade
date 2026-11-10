/**
 * Keyword abilities the search understands ("rote Kreaturen mit Eile"). The German names are
 * those printed on German cards; the pipeline's card data was checked for each of them.
 */

export const KEYWORDS = [
  'flying',
  'haste',
  'trample',
  'vigilance',
  'deathtouch',
  'lifelink',
  'first-strike',
  'double-strike',
  'menace',
  'reach',
  'hexproof',
  'indestructible',
  'flash',
  'defender',
  'ward',
  'prowess',
] as const;

export type Keyword = (typeof KEYWORDS)[number];

/** The keyword as the English rules text writes it at the start of a line. */
const ORACLE_NAMES: Readonly<Record<string, Keyword>> = Object.fromEntries(
  KEYWORDS.map((keyword) => [keyword.replace('-', ' '), keyword]),
);

/**
 * The keywords a card has, read from its English rules text. Keyword abilities stand on a line
 * of their own, several separated by commas ("Flying, vigilance"), reminder text in brackets
 * behind them and ward with its cost ("Ward {2}"). A line with anything else on it is rules
 * text, so "creatures with flying can't block" gives no keyword.
 */
export function cardKeywords(oracleText: string): Keyword[] {
  const found = new Set<Keyword>();
  for (const line of oracleText.split('\n')) {
    const parts = line
      .replace(/\([^)]*\)/g, '')
      .toLowerCase()
      .split(/[,;]/)
      .map((part) => part.trim().replace(/^ward(?: \{[^}]+\}|—.*)$/, 'ward'));
    const keywords = parts.map((part) => ORACLE_NAMES[part]);
    if (keywords.every((keyword) => keyword !== undefined)) {
      for (const keyword of keywords) found.add(keyword);
    }
  }
  return KEYWORDS.filter((keyword) => found.has(keyword));
}
