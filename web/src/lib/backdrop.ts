/**
 * Geometry of the page background (components/layout/Backdrop.astro): which artwork goes into
 * which row, and how far the rows move while scrolling. Pure, so it can be tested without a
 * browser; scripts/backdrop.ts applies it.
 */

/** Where the colour wheel starts: pink-reds just below 360° belong to the reds at the top. */
const WHEEL_START = 340;

/** Position on the wall's colour order; artworks without a main colour come last. */
function wheelPosition(hue: number | null): number {
  return hue === null ? 360 : (hue - WHEEL_START + 360) % 360;
}

/**
 * Spreads the artworks over the rows, `perRow` each, sorted by their main colour (pipeline:
 * domain/art.py): red at the top, then yellow, green and blue to violet, grey ones last.
 * Each row shows a stretch of that order a little further along than the row above, so the
 * colours change gradually and no two rows show the same sequence. The order runs round
 * like a colour wheel: the last rows lead from violet back to red.
 */
export function colourRows<T extends { hue: number | null }>(
  items: readonly T[],
  rowCount: number,
  perRow: number,
): T[][] {
  const sorted = [...items].sort((a, b) => wheelPosition(a.hue) - wheelPosition(b.hue));
  if (sorted.length === 0) return [];
  // The order repeated often enough that a stretch starting anywhere in it fits
  const copies = Math.ceil((sorted.length + perRow) / sorted.length);
  const loop = Array.from({ length: copies }, () => sorted).flat();
  return Array.from({ length: rowCount }, (_, row) => {
    const start = Math.round((row * sorted.length) / rowCount);
    return loop.slice(start, start + perRow);
  });
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

/** Artists for the credit line in the footer: each once, in alphabetical order. */
export function creditedArtists(artists: readonly string[], locale: string): string[] {
  return [...new Set(artists)].sort(new Intl.Collator(locale).compare);
}
