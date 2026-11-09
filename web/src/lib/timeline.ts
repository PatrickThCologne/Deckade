/** The overview: every set, newest first, grouped by release year. */
import type { MtgSet } from './data/schema';
import { yearOf } from './format';

export interface YearGroup {
  readonly year: number;
  readonly sets: readonly MtgSet[];
}

/**
 * Sets worth a tile. Announced sets without a pack image are left out until their
 * product photos exist -- a bare set symbol says little about an upcoming set.
 */
export function isShown(set: MtgSet): boolean {
  return set.standard?.status !== 'upcoming' || set.packImage !== null;
}

/**
 * The overview goes up to the current year: sets announced for next year get their row
 * once that year has begun. "Current" is the date of the data, so a build is reproducible.
 */
export function inOverview(set: MtgSet, today: string): boolean {
  return isShown(set) && yearOf(set.releasedAt) <= yearOf(today);
}

export function groupByYear(sets: readonly MtgSet[]): YearGroup[] {
  const groups = new Map<number, MtgSet[]>();
  const ordered = sets.toSorted((a, b) => b.releasedAt.localeCompare(a.releasedAt));
  for (const set of ordered) {
    const year = yearOf(set.releasedAt);
    groups.set(year, [...(groups.get(year) ?? []), set]);
  }
  return [...groups.entries()].map(([year, members]) => ({ year, sets: members }));
}
