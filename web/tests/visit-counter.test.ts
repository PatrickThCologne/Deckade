import { describe, expect, it } from 'vitest';
import { type CounterDocument, startCounting } from '../src/lib/visit-counter';

const config = {
  endpoint: 'https://example.goatcounter.com/count',
  script: 'https://gc.zgo.at/count.v5.js',
  integrity: 'sha384-test',
};

function fakeDocument(prerendering: boolean) {
  const appended: Record<string, unknown>[] = [];
  const listeners: (() => void)[] = [];
  const doc: CounterDocument = {
    prerendering,
    head: { append: (node) => appended.push(node as unknown as Record<string, unknown>) },
    createElement: () => ({ dataset: {} }) as unknown as HTMLScriptElement,
    addEventListener: (_type, listener) => listeners.push(listener),
  };
  return { doc, appended, listeners };
}

describe('startCounting', () => {
  it('loads the pinned script with its count address on a shown page', () => {
    const { doc, appended } = fakeDocument(false);

    startCounting(doc, config);

    expect(appended).toEqual([
      {
        async: true,
        src: config.script,
        integrity: config.integrity,
        crossOrigin: 'anonymous',
        dataset: { goatcounter: config.endpoint },
      },
    ]);
  });

  it('waits until a prerendered page is shown', () => {
    const { doc, appended, listeners } = fakeDocument(true);

    startCounting(doc, config);
    expect(appended).toHaveLength(0);

    for (const listener of listeners) listener();
    expect(appended).toHaveLength(1);
  });
});
