import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onHoverIntent } from '../src/lib/hover-intent';

describe('onHoverIntent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('acts when the pointer rests on the element', () => {
    const tile = new EventTarget();
    const action = vi.fn();
    onHoverIntent(tile, 150, action);

    tile.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(150);

    expect(action).toHaveBeenCalledOnce();
  });

  it('does nothing when the pointer only passes over it', () => {
    const tile = new EventTarget();
    const action = vi.fn();
    onHoverIntent(tile, 150, action);

    tile.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(100);
    tile.dispatchEvent(new Event('pointerleave'));
    vi.advanceTimersByTime(500);

    expect(action).not.toHaveBeenCalled();
  });
});
