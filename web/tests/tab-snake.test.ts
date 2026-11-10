import { describe, expect, it } from 'vitest';
import {
  body,
  brightness,
  down,
  drawIn,
  moveTo,
  strips,
  route,
  snakeAt,
  type Frame,
  type TabLine,
} from '../src/lib/tab-snake';

const frame: Frame = { top: 5, height: 20 };
const first: TabLine = { corner: { x: 12, y: 5 }, length: 40 };
const second: TabLine = { corner: { x: 112, y: 5 }, length: 60 };

const rest = (line: TabLine) => [
  down(frame, line.corner, frame.height),
  line.corner,
  { x: line.corner.x + line.length, y: frame.top },
];
const end = (move: ReturnType<typeof drawIn>) => snakeAt(move, 1);
const lit = (move: ReturnType<typeof drawIn>, t: number) =>
  strips(frame, snakeAt(move, t)).map((strip) => ({
    ...strip,
    alphas: strip.alphas.map((alpha) => Math.round(alpha * 1000)),
  }));

describe('tab snake', () => {
  it('goes up an edge, along the top and down the other edge', () => {
    const p = down(frame, first.corner, 8);
    const q = down(frame, second.corner, 4);
    expect(route(frame, p, q)).toEqual([p, first.corner, second.corner, q]);
  });

  it('is dark at its tail, full near the corner and fades out at its head', () => {
    expect(brightness(frame, 40, 0)).toBe(0);
    expect(brightness(frame, 40, 8)).toBe(0);
    expect(brightness(frame, 40, 20)).toBe(1);
    expect(brightness(frame, 40, 20 + 14)).toBe(1);
    expect(brightness(frame, 40, 20 + 40)).toBe(0);
    expect(brightness(frame, 40, 20 + 27)).toBeCloseTo(0.5);
  });

  it('comes up out of the banner and ends in its rest shape', () => {
    const move = drawIn(frame, first);
    expect(body(frame, snakeAt(move, 0)).every((p) => p.y >= frame.top + frame.height)).toBe(true);
    expect(body(frame, end(move))).toEqual(rest(first));
  });

  it('crawls right head first: along the top, down the next edge and back up', () => {
    const there = moveTo(frame, end(drawIn(frame, first)), second, true);
    const points = there.path.points;
    const dip = down(frame, second.corner, 12);

    expect(body(frame, snakeAt(there, 0))).toEqual(rest(first));
    expect(points.slice(-4)).toEqual([second.corner, dip, second.corner, rest(second)[2]]);
    // At the end it shows the same pixels as when it rests there
    expect(lit(there, 1)).toEqual(lit(drawIn(frame, second), 1));
  });

  it('crawls left tail first and ends in its rest shape', () => {
    const there = moveTo(frame, end(drawIn(frame, first)), second, true);
    const back = moveTo(frame, end(there), first, false);

    expect(lit(back, 0)).toEqual(lit(there, 1));
    expect(body(frame, end(back))).toEqual(rest(first));
  });

  it('rests as the top row from the corner and the edge below it, each pixel once', () => {
    const [across, edge] = strips(frame, end(drawIn(frame, first)));
    expect(across).toMatchObject({ across: true, x: 12, y: 5 });
    expect(edge).toMatchObject({ across: false, x: 12 });
    // The edge starts a row below the corner and fades out before the foot
    expect(edge!.y).toBe(frame.top + 1);
    expect(edge!.y + edge!.alphas.length).toBeLessThan(frame.top + frame.height);
    expect(edge!.alphas[0]).toBeGreaterThan(edge!.alphas.at(-1)!);
  });

  it('lights each pixel once where it lies over itself', () => {
    const there = moveTo(frame, end(drawIn(frame, first)), second, true);
    for (const t of [0.2, 0.5, 0.8]) {
      const lit = strips(frame, snakeAt(there, t));
      const cells = lit.flatMap((strip) =>
        strip.alphas.map((_, i) =>
          strip.across ? `${strip.x + i}:${strip.y}` : `${strip.x}:${strip.y + i}`,
        ),
      );
      expect(new Set(cells).size).toBe(cells.length);
      expect(lit.flatMap((strip) => strip.alphas).every((a) => a > 0 && a <= 1)).toBe(true);
    }
  });
});
