/**
 * The gold line over the tabs (components/layout/PageTabs.astro): it comes up over the tab the
 * pointer reaches first and crawls from there to the next like a snake (lib/tab-snake.ts). It is
 * drawn on a canvas over the tabs, because CSS cannot fade a line along a bent path.
 */
import { traceTabs } from '../lib/tab-trace';
import {
  drawIn,
  moveTo,
  strips,
  snakeAt,
  type Frame,
  type Move,
  type Snake,
  type TabLine,
} from '../lib/tab-snake';

const HIDE_DELAY_MS = 90;
const DRAW_IN_MS = 450;
/** Crawling speed in pixels per millisecond, held between the two durations */
const SPEED = 0.55;
const MIN_MS = 280;
const MAX_MS = 650;
/** How far inside the tab's shape the line runs: from its top and from its left edge */
const INSET_TOP = 5;
const INSET_SIDE = 7;
/** How far the top part runs, of the shape's width inside the insets */
const TOP_PART = 0.55;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function initTabTrace(): void {
  for (const nav of document.querySelectorAll<HTMLElement>('[data-tabs]')) {
    const canvas = nav.querySelector<HTMLCanvasElement>('canvas[data-tab-trace]');
    const context = canvas?.getContext('2d');
    const tabs = [...nav.querySelectorAll<HTMLElement>('.tab')];
    if (!canvas || !context || tabs.length === 0) continue;
    const still = matchMedia('(prefers-reduced-motion: reduce)');

    let frame: Frame | undefined;
    let lines: TabLine[] = [];
    let snake: Snake | undefined;
    let current = -1;
    let raf = 0;
    let slant = 0;
    let ratio = 1;

    const measure = () => {
      const lean = parseFloat(getComputedStyle(nav).getPropertyValue('--lean')) || -13;
      slant = Math.tan((Math.abs(lean) * Math.PI) / 180);
      const first = tabs[0]!;
      frame = { top: first.offsetTop + INSET_TOP, height: first.offsetHeight - INSET_TOP };
      const f = frame;
      lines = tabs.map((tab) => {
        const leanX = parseFloat(getComputedStyle(tab).getPropertyValue('--lean-x')) || 0;
        return {
          corner: { x: tab.offsetLeft + INSET_SIDE, y: f.top },
          length: TOP_PART * (tab.offsetWidth - leanX - 2 * INSET_SIDE),
        };
      });

      ratio = devicePixelRatio || 1;
      const width = nav.scrollWidth;
      const height = nav.offsetHeight;
      if (
        canvas.width !== Math.round(width * ratio) ||
        canvas.height !== Math.round(height * ratio)
      ) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
    };

    // The colour's channels in whatever form the stylesheet has it (the build writes it as hex):
    // the canvas gives it back as #rrggbb, or as rgba() when it is see-through
    const channels = (color: string): [number, number, number, number] => {
      context.fillStyle = color.trim() || '#f2c14e';
      const value = String(context.fillStyle);
      if (value.startsWith('#')) {
        const hex = (i: number) => parseInt(value.slice(i, i + 2), 16);
        return [hex(1), hex(3), hex(5), 1];
      }
      const [r = 0, g = 0, b = 0, a = 1] = (value.match(/[\d.]+/g) ?? []).map(Number);
      return [r, g, b, a];
    };

    const draw = () => {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (!frame || !snake) return;
      // Drawn upright, then leaned from the tabs' foot like their shapes: x moves right by
      // `slant` for every pixel above the foot
      const foot = frame.top + frame.height;
      context.setTransform(ratio, 0, -slant * ratio, ratio, slant * foot * ratio, 0);
      const [r, g, b, a] = channels(getComputedStyle(canvas).getPropertyValue('--trace'));
      for (const strip of strips(frame, snake)) {
        const n = strip.alphas.length;
        const fade = strip.across
          ? context.createLinearGradient(strip.x, 0, strip.x + n, 0)
          : context.createLinearGradient(0, strip.y, 0, strip.y + n);
        strip.alphas.forEach((alpha, i) => {
          fade.addColorStop((i + 0.5) / n, `rgb(${r} ${g} ${b} / ${alpha * a})`);
        });
        context.fillStyle = fade;
        if (strip.across) context.fillRect(strip.x, strip.y, n, 1);
        else context.fillRect(strip.x, strip.y, 1, n);
      }
    };

    const play = (move: Move, duration: number) => {
      cancelAnimationFrame(raf);
      const start = performance.now();
      const time = still.matches ? 0 : duration;
      const step = (now: number) => {
        const t = time > 0 ? Math.min(1, (now - start) / time) : 1;
        snake = snakeAt(move, ease(t));
        draw();
        raf = t < 1 ? requestAnimationFrame(step) : 0;
      };
      raf = requestAnimationFrame(step);
    };

    traceTabs(tabs, (tab) => tab.getAttribute('aria-current') === 'page', HIDE_DELAY_MS, {
      show(tab, fresh) {
        const index = tabs.indexOf(tab);
        if (!fresh && index === current) return;
        measure();
        if (!frame) return;
        const line = lines[index]!;
        if (fresh || !snake) {
          snake = undefined;
          draw();
          canvas.dataset.on = '';
          play(drawIn(frame, line), DRAW_IN_MS);
        } else {
          const move = moveTo(frame, snake, line, index > current);
          const time = Math.abs(move.to - move.from) / SPEED;
          play(move, Math.min(MAX_MS, Math.max(MIN_MS, time)));
        }
        current = index;
      },
      hide() {
        delete canvas.dataset.on;
      },
    });
  }
}
