/**
 * The packs on phones as a fan (scripts/coverflow.ts, components/overview/SetTimeline.astro):
 * the pack in the middle faces the viewer, the others turn away and stack up to each side.
 */

/** How far a pack turns away once it is a whole step off the middle */
const TURN_DEG = 58;
/** How far it sinks back */
const SINK_PX = 110;
/** How much closer each further pack moves to its neighbour, so the sides stack up */
const GATHER_PX = 26;

export interface FanPose {
  readonly transform: string;
  readonly zIndex: number;
}

/**
 * Where a pack stands, by its distance from the middle of the row in steps (negative on the
 * left). Within one step it turns and sinks back; further out it only moves closer in.
 */
export function fanPose(distance: number): FanPose {
  const side = Math.sign(distance);
  const turn = Math.min(1, Math.abs(distance));
  const beyond = Math.max(0, Math.abs(distance) - 1);
  const round = (value: number) => Math.round(value * 10) / 10 || 0;
  return {
    transform:
      `translateX(${round(-side * beyond * GATHER_PX)}px) ` +
      `translateZ(${round(-turn * SINK_PX)}px) rotateY(${round(-side * turn * TURN_DEG)}deg)`,
    // The nearer the middle, the further in front
    zIndex: 100 - Math.round(Math.abs(distance) * 10),
  };
}

/** The index of the distance closest to zero: the pack in the middle */
export function middleIndex(distances: readonly number[]): number {
  let best = 0;
  distances.forEach((distance, index) => {
    if (Math.abs(distance) < Math.abs(distances[best]!)) best = index;
  });
  return best;
}
