/**
 * Long press for touch screens: holding a finger still on `target` for `delay` milliseconds
 * starts a press; until the finger lifts, its moves are reported. A finger that moves more
 * than `slop` pixels first is scrolling, so nothing happens. Mouse and pen are left alone:
 * they have hover.
 */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface LongPressHandlers {
  start(point: Point, target: EventTarget | null): void;
  move(point: Point): void;
  end(): void;
}

export interface LongPress {
  /** True while a press runs: the caller keeps the page from scrolling meanwhile. */
  readonly active: boolean;
}

interface PointerLike {
  readonly pointerType?: string;
  readonly pointerId?: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly target: EventTarget | null;
}

export function onLongPress(
  target: EventTarget,
  { delay, slop }: { delay: number; slop: number },
  handlers: LongPressHandlers,
): LongPress {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let origin: Point | null = null;
  let pointer: number | undefined;
  let active = false;

  const pointOf = (event: PointerLike): Point => ({ x: event.clientX, y: event.clientY });
  const reset = () => {
    clearTimeout(timer);
    origin = null;
    pointer = undefined;
    if (active) {
      active = false;
      handlers.end();
    }
  };

  target.addEventListener('pointerdown', (raw) => {
    const event = raw as unknown as PointerLike;
    if (event.pointerType !== 'touch' || origin) return;
    origin = pointOf(event);
    pointer = event.pointerId;
    const pressed = event.target;
    timer = setTimeout(() => {
      if (!origin) return;
      active = true;
      handlers.start(origin, pressed);
    }, delay);
  });
  target.addEventListener('pointermove', (raw) => {
    const event = raw as unknown as PointerLike;
    if (!origin || event.pointerId !== pointer) return;
    const point = pointOf(event);
    if (active) handlers.move(point);
    else if (Math.hypot(point.x - origin.x, point.y - origin.y) > slop) reset();
  });
  for (const type of ['pointerup', 'pointercancel']) {
    target.addEventListener(type, (raw) => {
      if ((raw as unknown as PointerLike).pointerId === pointer) reset();
    });
  }

  return {
    get active() {
      return active;
    },
  };
}

export interface Box {
  readonly left: number;
  readonly top: number;
}

/**
 * Where a preview of `size` goes for a finger at `point`: centred above it, so the finger does
 * not cover it, or below it when there is no room above; always inside the viewport.
 */
export function previewPlacement(
  point: Point,
  viewport: { readonly width: number; readonly height: number },
  size: { readonly width: number; readonly height: number },
  { gap = 28, margin = 8 }: { gap?: number; margin?: number } = {},
): Box {
  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(value, Math.max(min, max)));
  const above = point.y - gap - size.height;
  const top = above >= margin ? above : point.y + gap;
  return {
    left: Math.round(clamp(point.x - size.width / 2, margin, viewport.width - size.width - margin)),
    top: Math.round(clamp(top, margin, viewport.height - size.height - margin)),
  };
}
