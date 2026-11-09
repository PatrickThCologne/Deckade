/**
 * Scroll effects of the page background (components/layout/Backdrop.astro): the art wall sinks
 * slower than the page, its rows drift sideways in alternating directions, and a dark layer
 * fades in once the reader leaves the top. The movement follows the scroll position with a
 * short glide. Only transform and opacity change, so the browser does not repaint. With
 * reduced motion the wall stands still and only the darkening remains.
 *
 * Each page tab (data-wall-tab) has its own row position. After a tab change the rows start at
 * the last tab's position and turn to this one's, once the page change has faded over (view
 * transition, styles/global.css). Nothing is stored: the last tab is the previous address.
 */
import { approach, driftOffset, sinkSpeed, tabTurn } from '../lib/backdrop';

/** px the wall sinks per px scrolled (less if the wall is too short for the page) */
const SINK = 0.1;
/** px a row drifts sideways per px scrolled */
const DRIFT = 0.15;
/** px each row is shifted against the one above, so the tiles do not line up */
const ROW_PHASE = 137;
/** px of scrolling until the dark layer is fully there */
const DIM_DISTANCE = 700;
const GLIDE_MS = 140;
/** px of scrolling the rows drift on by per tab */
const TURN = 700;
const TURN_GLIDE_MS = 260;
/** Turn even if the page change is not reported (older browsers) */
const TURN_FALLBACK_MS = 600;

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
  // Drift on top of the scroll position: this tab's position, or the last tab's while turning
  let turned = 0;
  let turnTarget = 0;
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
      const offset = driftOffset(shown + turned, speed, phase, loop);
      element.style.transform = `translate3d(${offset}px, 0, 0)`;
    }
  };

  const tick = (now: number) => {
    const target = window.scrollY;
    const elapsed = last ? now - last : 16;
    shown = wall ? approach(shown, target, elapsed, GLIDE_MS) : target;
    turned = approach(turned, turnTarget, elapsed, TURN_GLIDE_MS);
    last = now;
    render();
    frame = shown === target && turned === turnTarget ? 0 : requestAnimationFrame(tick);
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
  if (wall) {
    const tabs = [...document.querySelectorAll<HTMLAnchorElement>('a[data-wall-tab]')];
    const { from, to } = tabTurn(
      tabs.map((tab) => tab.pathname),
      window.location.pathname,
      previousPath(),
      TURN,
    );
    turned = turnTarget = from;
    if (to !== from) {
      afterPageChange(() => {
        turnTarget = to;
        start();
      });
    }
  }
  measure();
  render();
}

/** Path of the page the reader came from, if it is on this site. */
function previousPath(): string | undefined {
  const from = ('navigation' in window && navigation.activation?.from?.url) || document.referrer;
  if (!from) return undefined;
  const url = new URL(from);
  return url.origin === window.location.origin ? url.pathname : undefined;
}

/** Runs `turn` once the page change has faded over, or at once without a view transition. */
function afterPageChange(turn: () => void): void {
  let done = false;
  const turnOnce = () => {
    if (done) return;
    done = true;
    turn();
  };
  const after = (transition: ViewTransition | null | undefined) => {
    if (transition) transition.finished.then(turnOnce, turnOnce);
    else turnOnce();
  };
  if (document.activeViewTransition) after(document.activeViewTransition);
  else
    window.addEventListener('pagereveal', (event) => after(event.viewTransition), { once: true });
  window.setTimeout(turnOnce, TURN_FALLBACK_MS);
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
