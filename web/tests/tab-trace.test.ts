import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { traceTabs } from '../src/lib/tab-trace';

describe('traceTabs', () => {
  const DELAY = 90;
  let tabs: EventTarget[];
  let current: EventTarget;
  let calls: string[];

  const name = (tab: EventTarget) => `tab${tabs.indexOf(tab)}`;

  beforeEach(() => {
    vi.useFakeTimers();
    tabs = [new EventTarget(), new EventTarget(), new EventTarget()];
    current = tabs[2]!;
    calls = [];
    traceTabs(tabs, (tab) => tab === current, DELAY, {
      show: (tab, fresh) => calls.push(`${fresh ? 'draw' : 'glide'} ${name(tab)}`),
      hide: () => calls.push('hide'),
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('draws the line in over the first tab and glides it to the next', () => {
    tabs[0]!.dispatchEvent(new Event('pointerenter'));
    tabs[0]!.dispatchEvent(new Event('pointerleave'));
    tabs[1]!.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(DELAY * 2);

    expect(calls).toEqual(['draw tab0', 'glide tab1']);
  });

  it('hides it a moment after the pointer has left the tabs, and draws it anew', () => {
    tabs[0]!.dispatchEvent(new Event('pointerenter'));
    tabs[0]!.dispatchEvent(new Event('pointerleave'));
    vi.advanceTimersByTime(DELAY - 1);
    expect(calls).toEqual(['draw tab0']);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(['draw tab0', 'hide']);

    tabs[1]!.dispatchEvent(new Event('pointerenter'));
    expect(calls).toEqual(['draw tab0', 'hide', 'draw tab1']);
  });

  it('shows none over the current page tab', () => {
    tabs[1]!.dispatchEvent(new Event('pointerenter'));
    tabs[1]!.dispatchEvent(new Event('pointerleave'));
    current.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(DELAY * 2);

    expect(calls).toEqual(['draw tab1', 'hide']);
  });

  it('follows the keyboard focus too', () => {
    tabs[0]!.dispatchEvent(new Event('focus'));
    tabs[0]!.dispatchEvent(new Event('blur'));
    tabs[1]!.dispatchEvent(new Event('focus'));

    expect(calls).toEqual(['draw tab0', 'glide tab1']);
  });
});
