/**
 * Scroll effects of the page background (components/layout/Backdrop.astro): the art wall sinks
 * slower than the page, its rows drift sideways in alternating directions, and a dark layer
 * fades in once the reader leaves the top. The movement follows the scroll position with a
 * short glide. Only transform and opacity change, so the browser does not repaint. With
 * reduced motion the wall stands still and only the darkening remains.
 */
import { approach, driftOffset, sinkSpeed } from '../lib/backdrop';

/** px the wall sinks per px scrolled (less if the wall is too short for the page) */
const SINK = 0.1;
/** px a row drifts sideways per px scrolled */
const DRIFT = 0.15;
/** px each row is shifted against the one above, so the tiles do not line up */
const ROW_PHASE = 137;
/** px of scrolling until the dark layer is fully there */
const DIM_DISTANCE = 700;
const GLIDE_MS = 140;

interface Row {
  element: HTMLElement;
  speed: number;
  phase: number;
  loop: number;
}

export function initBackdrop(): void {
  const dim = document.querySelector<HTMLElement>('[data-dim]');
  const found = document.querySelector<HTMLElement>('[data-wall]');
  const wall = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? null : found;
  const rows: Row[] = [...(wall?.querySelectorAll<HTMLElement>('[data-row]') ?? [])].map(
    (element, index) => ({
      element,
      speed: index % 2 === 0 ? DRIFT : -DRIFT,
      phase: index * ROW_PHASE,
      loop: 0,
    }),
  );
  let sink = 0;
  let shown = window.scrollY;
  let frame = 0;
  let last = 0;

  const measure = () => {
    for (const row of rows) row.loop = fill(row.element);
    if (!wall) return;
    const page = document.documentElement.scrollHeight - window.innerHeight;
    sink = sinkSpeed(SINK, wall.offsetHeight - window.innerHeight, page);
  };

  const render = () => {
    if (dim) dim.style.opacity = String(Math.min(shown / DIM_DISTANCE, 1));
    if (!wall) return;
    wall.style.transform = `translate3d(0, ${-shown * sink}px, 0)`;
    for (const { element, speed, phase, loop } of rows) {
      const offset = driftOffset(shown, speed, phase, loop);
      element.style.transform = `translate3d(${offset}px, 0, 0)`;
    }
  };

  const tick = (now: number) => {
    const target = window.scrollY;
    const elapsed = last ? now - last : 16;
    shown = wall ? approach(shown, target, elapsed, GLIDE_MS) : target;
    last = now;
    render();
    frame = shown === target ? 0 : requestAnimationFrame(tick);
  };

  const start = () => {
    if (frame) return;
    last = 0;
    frame = requestAnimationFrame(tick);
  };

  window.addEventListener('scroll', start, { passive: true });
  for (const event of ['resize', 'load']) {
    window.addEventListener(event, () => {
      measure();
      render();
    });
  }
  measure();
  render();
}

/**
 * Length of a row's sequence in px. The row holds the sequence twice; on very wide screens
 * further copies are appended, so the row covers the screen at every shift.
 */
function fill(row: HTMLElement): number {
  const count = Number(row.dataset.count);
  const tiles = [...row.children] as HTMLElement[];
  const second = tiles[count];
  const first = tiles[0];
  if (!first || !second) return 0;
  const loop = second.offsetLeft - first.offsetLeft;
  while (loop > 0 && row.offsetWidth < loop + window.innerWidth) {
    for (const tile of tiles.slice(0, count)) row.append(tile.cloneNode(true));
  }
  return loop;
}
