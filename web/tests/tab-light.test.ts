import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { followTabs, tabFootCentre } from '../src/lib/tab-light';

describe('followTabs', () => {
  const DELAY = 90;
  let tabs: EventTarget[];
  let home: EventTarget;
  let moves: EventTarget[];

  beforeEach(() => {
    vi.useFakeTimers();
    tabs = [new EventTarget(), new EventTarget(), new EventTarget()];
    home = tabs[0]!;
    moves = [];
    followTabs(tabs, home, DELAY, (tab) => moves.push(tab));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('moves the light under the tab the pointer enters', () => {
    tabs[2]!.dispatchEvent(new Event('pointerenter'));
    expect(moves).toEqual([tabs[2]]);
  });

  it('sends it home once the pointer has left for a moment', () => {
    tabs[2]!.dispatchEvent(new Event('pointerenter'));
    tabs[2]!.dispatchEvent(new Event('pointerleave'));
    vi.advanceTimersByTime(DELAY - 1);
    expect(moves).toEqual([tabs[2]]);
    vi.advanceTimersByTime(1);
    expect(moves).toEqual([tabs[2], home]);
  });

  it('does not go home while the pointer crosses the gap to the next tab', () => {
    tabs[1]!.dispatchEvent(new Event('pointerenter'));
    tabs[1]!.dispatchEvent(new Event('pointerleave'));
    vi.advanceTimersByTime(DELAY / 2);
    tabs[2]!.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(DELAY * 2);
    expect(moves).toEqual([tabs[1], tabs[2]]);
  });

  it('follows the keyboard focus too', () => {
    tabs[1]!.dispatchEvent(new Event('focus'));
    tabs[1]!.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(DELAY);
    expect(moves).toEqual([tabs[1], home]);
  });
});

describe('tabFootCentre', () => {
  it('is the middle of the foot, which is narrower than the box by the lean', () => {
    expect(tabFootCentre(100, 130, 10)).toBe(160);
  });
});
