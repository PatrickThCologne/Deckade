/**
 * The gold line over the tabs as a snake (scripts/tab-trace.ts, components/layout/PageTabs.astro).
 *
 * At rest over a tab it runs up the tab's left edge, round the corner and along the top to about
 * the middle, faded at both ends. It lives on a frame made of the tabs' left edges and the line
 * along their tops, as a stretch of a path on that frame: moving means sliding that stretch along
 * the path, so the line crawls from tab to tab instead of jumping.
 *
 * Everything here is upright: the edges stand straight up and lengths are pixels across the top
 * and pixel rows up an edge. The script leans the drawing like the tabs, as the CSS did, so the
 * corner keeps the tab's shape.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Frame {
  /** The pixel row of the line along the tabs' tops */
  top: number;
  /** Rows from a tab's foot up to the top line: the upright part at rest */
  height: number;
}

/** Where the line rests over one tab */
export interface TabLine {
  /** Where the top line meets the tab's left edge */
  corner: Point;
  /** How far the top part runs from the corner */
  length: number;
}

/** A path on the frame, with the distance from its start to each point */
export interface Path {
  points: Point[];
  at: number[];
}

/** The line: the stretch of `path` that ends at `head` and is as long as its rest shape */
export interface Snake {
  path: Path;
  head: number;
  /** The top part's length at rest; with the frame's height it sets the snake's length */
  length: number;
}

/** A slide of the line along `path`, from one head position and top length to another */
export interface Move {
  path: Path;
  from: number;
  to: number;
  fromLength: number;
  toLength: number;
}

/** A run of the line one pixel wide: along the top from column `x` to the right, or down an edge
 * from row `y` */
export interface Strip {
  across: boolean;
  x: number;
  y: number;
  /** How bright each of its pixels is, in order */
  alphas: number[];
}

/** How deep the line runs down the next tab's edge before it turns: where its fade ends */
const DIP = 0.6;
const EPSILON = 1e-6;

const onTop = (frame: Frame, p: Point) => p.y - frame.top < EPSILON;

/** The corner above a point on an edge */
export function cornerOf(frame: Frame, p: Point): Point {
  return onTop(frame, p) ? p : { x: p.x, y: frame.top };
}

/** The point `depth` rows down the edge below `corner` */
export function down(frame: Frame, corner: Point, depth: number): Point {
  return { x: corner.x, y: frame.top + depth };
}

/** From p to q over the frame: up p's edge, along the top, down q's edge */
export function route(frame: Frame, p: Point, q: Point): Point[] {
  return [p, cornerOf(frame, p), cornerOf(frame, q), q];
}

const span = (p: Point, q: Point) =>
  Math.abs(q.y - p.y) > EPSILON ? Math.abs(q.y - p.y) : Math.abs(q.x - p.x);

export function makePath(points: readonly Point[]): Path {
  const kept: Point[] = [];
  const at: number[] = [];
  for (const p of points) {
    const last = kept[kept.length - 1];
    if (last && span(last, p) < EPSILON) continue;
    at.push(last ? at[at.length - 1]! + span(last, p) : 0);
    kept.push(p);
  }
  return { points: kept, at };
}

export const pathLength = (path: Path) => path.at[path.at.length - 1] ?? 0;

/** The point `s` along the path, held at its ends */
export function pointAt(path: Path, s: number): Point {
  const { points, at } = path;
  if (s <= 0 || points.length < 2) return points[0]!;
  for (let i = 1; i < points.length; i++) {
    if (s <= at[i]!) {
      const p = points[i - 1]!;
      const q = points[i]!;
      const f = (s - at[i - 1]!) / (at[i]! - at[i - 1]!);
      return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f };
    }
  }
  return points[points.length - 1]!;
}

/** The points of the path from `a` to `b` */
export function slice(path: Path, a: number, b: number): Point[] {
  const inner = path.points.filter((_, i) => path.at[i]! > a && path.at[i]! < b);
  return [pointAt(path, a), ...inner, pointAt(path, b)];
}

const snakeSpan = (frame: Frame, length: number) => frame.height + length;

/** The line's points from its tail to its head */
export function body(frame: Frame, snake: Snake): Point[] {
  return slice(snake.path, snake.head - snakeSpan(frame, snake.length), snake.head);
}

/**
 * How bright the line is `d` from its tail: dark over the lower 40 % of the upright part, then
 * brightening to full a little below the corner, full for the first third of the top part, then
 * fading out to its end (the shape the two CSS gradients had).
 */
export function brightness(frame: Frame, length: number, d: number): number {
  const h = frame.height;
  if (d < 0.4 * h || d > h + length) return 0;
  if (d < 0.85 * h) return (d - 0.4 * h) / (0.45 * h);
  if (d < h + 0.35 * length) return 1;
  return (h + length - d) / (0.65 * length);
}

/** The line comes up out of the banner over a tab and round its corner */
export function drawIn(frame: Frame, line: TabLine): Move {
  const total = snakeSpan(frame, line.length);
  const path = makePath([
    down(frame, line.corner, frame.height + total),
    line.corner,
    { x: line.corner.x + line.length, y: frame.top },
  ]);
  return {
    path,
    from: total,
    to: pathLength(path),
    fromLength: line.length,
    toLength: line.length,
  };
}

/**
 * The line crawls over to another tab. To the right its head leads: along the top, a stretch down
 * the new tab's edge, back up and along to the middle, so its tail ends on that edge. To the left
 * its tail leads the same way back.
 */
export function moveTo(frame: Frame, snake: Snake, line: TabLine, rightward: boolean): Move {
  const now = body(frame, snake);
  const tail = now[0]!;
  const head = now[now.length - 1]!;
  const end = { x: line.corner.x + line.length, y: frame.top };
  if (rightward) {
    const dip = down(frame, line.corner, Math.round(DIP * frame.height));
    const path = makePath([...now, ...route(frame, head, dip), line.corner, end]);
    return {
      path,
      from: snakeSpan(frame, snake.length),
      to: pathLength(path),
      fromLength: snake.length,
      toLength: line.length,
    };
  }
  const foot = down(frame, line.corner, frame.height);
  const path = makePath([foot, line.corner, end, ...route(frame, end, tail), ...now]);
  return {
    path,
    from: pathLength(path),
    to: snakeSpan(frame, line.length),
    fromLength: snake.length,
    toLength: line.length,
  };
}

/** Where the move has got to, `t` from 0 to 1 */
export function snakeAt(move: Move, t: number): Snake {
  return {
    path: move.path,
    head: move.from + (move.to - move.from) * t,
    length: move.fromLength + (move.toLength - move.fromLength) * t,
  };
}

/** Keeps the brighter value: where the line lies over itself, the fold is not lit twice */
const keep = (cells: Map<number, number>, key: number, alpha: number) => {
  if (alpha > (cells.get(key) ?? 0)) cells.set(key, alpha);
};

/** Runs of neighbouring cells, as strips */
function runs(cells: Map<number, number>, across: boolean, other: number): Strip[] {
  const found: Strip[] = [];
  let last: Strip | undefined;
  let lastKey = Number.NaN;
  for (const key of [...cells.keys()].sort((a, b) => a - b)) {
    if (last && key === lastKey + 1) {
      last.alphas.push(cells.get(key)!);
    } else {
      last = across
        ? { across, x: key, y: other, alphas: [cells.get(key)!] }
        : { across, x: other, y: key, alphas: [cells.get(key)!] };
      found.push(last);
    }
    lastKey = key;
  }
  return found;
}

/**
 * What the line covers, pixel by pixel: one row across the top, one column down each edge. The
 * top row includes the corner, so an edge starts a row below it and no pixel is covered twice.
 */
export function strips(frame: Frame, snake: Snake): Strip[] {
  const tail = snake.head - snakeSpan(frame, snake.length);
  const from = Math.max(tail, 0);
  const { points, at } = snake.path;
  const top = new Map<number, number>();
  const edges = new Map<number, Map<number, number>>();

  for (let i = 1; i < points.length; i++) {
    const lo = Math.max(at[i - 1]!, from);
    const hi = Math.min(at[i]!, snake.head);
    if (lo >= hi) continue;
    const p = points[i - 1]!;
    const q = points[i]!;
    // Each pixel's middle, its distance along the path, and so its brightness
    const light = (cells: Map<number, number>, start: number, end: number, first: number) => {
      for (let cell = Math.floor(Math.min(start, end)); cell < Math.max(start, end); cell++) {
        if (cell < first) continue;
        const s = at[i - 1]! + Math.abs(cell + 0.5 - start);
        if (s >= lo && s <= hi) keep(cells, cell, brightness(frame, snake.length, s - tail));
      }
    };
    if (onTop(frame, p) && onTop(frame, q)) {
      light(top, p.x, q.x, -Infinity);
    } else {
      const edge = edges.get(p.x) ?? new Map<number, number>();
      edges.set(p.x, edge);
      light(edge, p.y, q.y, frame.top + 1);
    }
  }

  const lit = (cells: Map<number, number>) => new Map([...cells].filter(([, alpha]) => alpha > 0));
  return [
    ...runs(lit(top), true, frame.top),
    ...[...edges].flatMap(([x, cells]) => runs(lit(cells), false, x)),
  ];
}
