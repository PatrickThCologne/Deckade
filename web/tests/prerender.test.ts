import { describe, expect, it, vi } from 'vitest';
import { whenShown } from '../src/lib/prerender';

function page(prerendering: boolean | undefined) {
  return Object.assign(new EventTarget(), { prerendering });
}

describe('whenShown', () => {
  it('acts at once on a page that is already shown', () => {
    const action = vi.fn();
    whenShown(page(false), action);

    expect(action).toHaveBeenCalledOnce();
  });

  it('acts at once in browsers that do not prerender', () => {
    const action = vi.fn();
    whenShown(page(undefined), action);

    expect(action).toHaveBeenCalledOnce();
  });

  it('waits until a prerendered page is opened', () => {
    const prerendered = page(true);
    const action = vi.fn();
    whenShown(prerendered, action);

    expect(action).not.toHaveBeenCalled();

    prerendered.dispatchEvent(new Event('prerenderingchange'));
    prerendered.dispatchEvent(new Event('prerenderingchange'));

    expect(action).toHaveBeenCalledOnce();
  });
});
