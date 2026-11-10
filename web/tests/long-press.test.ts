import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onLongPress, previewPlacement } from '../src/lib/long-press';

function pointer(type: string, x: number, y: number, pointerType = 'touch', pointerId = 1) {
  return Object.assign(new Event(type), { clientX: x, clientY: y, pointerType, pointerId });
}

function setup() {
  const target = new EventTarget();
  const handlers = { start: vi.fn(), move: vi.fn(), end: vi.fn() };
  const press = onLongPress(target, { delay: 350, slop: 10 }, handlers);
  return { target, handlers, press };
}

describe('onLongPress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts when a finger rests, follows it and ends when it lifts', () => {
    const { target, handlers, press } = setup();

    target.dispatchEvent(pointer('pointerdown', 100, 200));
    vi.advanceTimersByTime(349);
    expect(handlers.start).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(handlers.start).toHaveBeenCalledWith({ x: 100, y: 200 }, target);
    expect(press.active).toBe(true);

    target.dispatchEvent(pointer('pointermove', 100, 260));
    expect(handlers.move).toHaveBeenCalledWith({ x: 100, y: 260 });

    target.dispatchEvent(pointer('pointerup', 100, 260));
    expect(handlers.end).toHaveBeenCalledOnce();
    expect(press.active).toBe(false);
  });

  it('leaves a finger that starts scrolling alone', () => {
    const { target, handlers } = setup();

    target.dispatchEvent(pointer('pointerdown', 100, 200));
    target.dispatchEvent(pointer('pointermove', 100, 215));
    vi.advanceTimersByTime(500);

    expect(handlers.start).not.toHaveBeenCalled();
  });

  it('tolerates a slight wobble', () => {
    const { target, handlers } = setup();

    target.dispatchEvent(pointer('pointerdown', 100, 200));
    target.dispatchEvent(pointer('pointermove', 104, 206));
    vi.advanceTimersByTime(350);

    expect(handlers.start).toHaveBeenCalledOnce();
  });

  it('does nothing for a short tap or when the browser takes over the touch', () => {
    const { target, handlers } = setup();

    target.dispatchEvent(pointer('pointerdown', 100, 200));
    target.dispatchEvent(pointer('pointerup', 100, 200));
    target.dispatchEvent(pointer('pointerdown', 100, 200));
    target.dispatchEvent(pointer('pointercancel', 100, 200));
    vi.advanceTimersByTime(500);

    expect(handlers.start).not.toHaveBeenCalled();
    expect(handlers.end).not.toHaveBeenCalled();
  });

  it('ignores the mouse, which has hover', () => {
    const { target, handlers } = setup();

    target.dispatchEvent(pointer('pointerdown', 100, 200, 'mouse'));
    vi.advanceTimersByTime(500);

    expect(handlers.start).not.toHaveBeenCalled();
  });

  it('follows only the finger that started the press', () => {
    const { target, handlers } = setup();

    target.dispatchEvent(pointer('pointerdown', 100, 200, 'touch', 1));
    vi.advanceTimersByTime(350);
    target.dispatchEvent(pointer('pointermove', 300, 300, 'touch', 2));
    target.dispatchEvent(pointer('pointerup', 300, 300, 'touch', 2));

    expect(handlers.move).not.toHaveBeenCalled();
    expect(handlers.end).not.toHaveBeenCalled();
  });
});

describe('previewPlacement', () => {
  const viewport = { width: 375, height: 800 };
  const size = { width: 240, height: 334 };

  it('centres the preview above the finger', () => {
    expect(previewPlacement({ x: 187, y: 600 }, viewport, size)).toEqual({ left: 67, top: 238 });
  });

  it('goes below the finger near the top of the screen', () => {
    expect(previewPlacement({ x: 187, y: 200 }, viewport, size)).toEqual({ left: 67, top: 228 });
  });

  it('stays inside the screen at its edges', () => {
    expect(previewPlacement({ x: 20, y: 600 }, viewport, size).left).toBe(8);
    expect(previewPlacement({ x: 370, y: 600 }, viewport, size).left).toBe(127);
    expect(previewPlacement({ x: 187, y: 330 }, viewport, size).top).toBe(358);
    expect(previewPlacement({ x: 187, y: 340 }, { width: 375, height: 600 }, size).top).toBe(258);
  });
});
