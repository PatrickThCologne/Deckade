/**
 * Geometry of the page background (components/layout/Backdrop.astro): which artwork goes into
 * which row, and how far the rows move while scrolling. Pure, so it can be tested without a
 * browser; scripts/backdrop.ts applies it.
 */

/**
 * Spreads the artworks over the rows, `perRow` each. Once all artworks are used, the next rows
 * take them again in a new order -- every second one, then every third one and so on -- so no
 * two rows show the same sequence.
 */
export function artRows<T>(items: readonly T[], rowCount: number, perRow: number): T[][] {
  if (items.length === 0) return [];
  const order: T[] = [];
  for (let step = 1; order.length < rowCount * perRow; step++) {
    for (let start = 0; start < step; start++) {
      order.push(...items.filter((_, index) => index % step === start));
    }
  }
  return Array.from({ length: rowCount }, (_, row) =>
    order.slice(row * perRow, (row + 1) * perRow),
  );
}

/**
 * Sideways shift of a row in px. It stays within one sequence length (`loop`), and the row
 * holds its sequence at least twice, so its end never comes into view.
 */
export function driftOffset(scrolled: number, speed: number, phase: number, loop: number): number {
  if (loop <= 0) return 0;
  const distance = phase + scrolled * speed;
  return -(((distance % loop) + loop) % loop) || 0;
}

/**
 * How fast the art wall sinks: `preferred`, unless the wall is too short for that over the
 * whole page -- then slower, so its lower edge never comes into view.
 */
export function sinkSpeed(preferred: number, spare: number, maxScroll: number): number {
  if (spare <= 0) return 0;
  if (maxScroll <= 0) return preferred;
  return Math.min(preferred, spare / maxScroll);
}

/**
 * One frame of gliding towards the scroll position. Framerate independent: after `glideMs`
 * about two thirds of the remaining way are done. Snaps once less than half a pixel is left.
 */
export function approach(
  shown: number,
  target: number,
  elapsedMs: number,
  glideMs: number,
): number {
  const next = target + (shown - target) * Math.exp(-Math.max(elapsedMs, 0) / glideMs);
  return Math.abs(target - next) < 0.5 ? target : next;
}

/**
 * Where the rows start and stop on a page: each page tab (`tabs`, by path) has its own position,
 * `step` apart. Coming from another tab, the rows start at that tab's position and turn to this
 * one's -- one way when moving right, the other when moving left. Other pages rest at 0.
 */
export function tabTurn(
  tabs: readonly string[],
  current: string,
  previous: string | undefined,
  step: number,
): { from: number; to: number } {
  const here = tabs.indexOf(current);
  if (here < 0) return { from: 0, to: 0 };
  const before = previous === undefined ? -1 : tabs.indexOf(previous);
  return { from: (before < 0 ? here : before) * step, to: here * step };
}

/** Artists for the credit line in the footer: each once, in alphabetical order. */
export function creditedArtists(artists: readonly string[], locale: string): string[] {
  return [...new Set(artists)].sort(new Intl.Collator(locale).compare);
}
