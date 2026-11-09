import { withBase } from './links';

export const COLORS = ['W', 'U', 'B', 'R', 'G'] as const;
export type Color = (typeof COLORS)[number];

/** Symbols of the front face: '{2}{W/U} // {B}' -> ['2', 'W/U']. */
export function manaSymbols(manaCost: string): string[] {
  const front = manaCost.split(' // ')[0] ?? '';
  return [...front.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]!);
}

/** One pip per colour of the identity; colourless cards get the 'C' symbol. */
export function colorPips(colors: string): string[] {
  return colors ? [...colors] : ['C'];
}

/** Local copy of the Scryfall symbol, downloaded by the pipeline. */
export function symbolUrl(symbol: string): string {
  return withBase(`images/symbols/${symbol.replaceAll('/', '')}.svg`);
}
