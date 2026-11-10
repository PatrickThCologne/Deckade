/**
 * The year rail beside the overview's packs (components/overview/YearRail.astro): a fisheye
 * list of the years. The year being read stands in its middle, largest; the others shrink and
 * close up the further they are from it.
 */

/**
 * Where the reading point stands among the year rows, given the top of each row from the
 * first: 2.5 is halfway between the third row and the fourth. Held at the first and last.
 */
export function focusIndex(tops: readonly number[], point: number): number {
  if (tops.length === 0) return 0;
  if (point <= tops[0]!) return 0;
  for (let i = 0; i < tops.length - 1; i++) {
    const start = tops[i]!;
    const end = tops[i + 1]!;
    if (point < end) return i + (end > start ? (point - start) / (end - start) : 0);
  }
  return tops.length - 1;
}

/** How much an entry swells, from 1 at the focus down to 0 `reach` places away, smoothly */
export function swell(distance: number, reach = 3): number {
  const x = Math.max(0, 1 - Math.abs(distance) / reach);
  return x * x * (3 - 2 * x);
}

/** Where the focus lies along the list, between the middles of its two nearest entries */
export function focusOffset(middles: readonly number[], focus: number): number {
  if (middles.length === 0) return 0;
  const i = Math.max(0, Math.min(middles.length - 1, Math.floor(focus)));
  const next = middles[Math.min(middles.length - 1, i + 1)]!;
  return middles[i]! + (next - middles[i]!) * (focus - i);
}
