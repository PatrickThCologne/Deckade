import type { StandardSet } from '../data/schema';

export type WaveKind = 'next' | 'later' | 'special';

export interface Wave {
  readonly kind: WaveKind;
  /** 0 = next rotation; null for sets with a special rule. */
  readonly index: number | null;
  readonly earliest: string | null;
  readonly legalUntilAtLeast: number | null;
  readonly sets: readonly StandardSet[];
}

/** Groups sets by rotation wave: next rotation first, special rules last. */
export function groupIntoWaves(sets: readonly StandardSet[]): Wave[] {
  const groups = new Map<string, StandardSet[]>();
  for (const mtgSet of sets) {
    const { wave, legalUntilAtLeast } = mtgSet.standard.rotation;
    const key = wave != null ? `wave-${wave}` : `special-${legalUntilAtLeast ?? 'open'}`;
    groups.set(key, [...(groups.get(key) ?? []), mtgSet]);
  }

  return [...groups.values()]
    .map((members) => toWave(members.toSorted(byRelease)))
    .toSorted(
      (a, b) => (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER),
    );
}

function toWave(members: StandardSet[]): Wave {
  const { rotation } = members[0]!.standard;
  const kind: WaveKind = rotation.wave == null ? 'special' : rotation.wave === 0 ? 'next' : 'later';
  return {
    kind,
    index: rotation.wave,
    earliest: rotation.earliest,
    legalUntilAtLeast: rotation.legalUntilAtLeast,
    sets: members,
  };
}

function byRelease(a: StandardSet, b: StandardSet): number {
  return a.releasedAt.localeCompare(b.releasedAt);
}
