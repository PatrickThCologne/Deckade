/**
 * Visitor counting with GoatCounter (docs/adr/0004-visitor-counting.md). The count script is
 * loaded only once the page is really shown: tabs are prerendered while the pointer rests on
 * them (layouts/BaseLayout.astro), and the script skips a prerendered page, so such visits
 * would go uncounted.
 */

export interface CounterConfig {
  /** The site's public count address */
  readonly endpoint: string;
  /** The pinned count script and its hash, so a changed script does not run */
  readonly script: string;
  readonly integrity: string;
}

/** The parts of the document the counter uses; `prerendering` is true while prerendered. */
export interface CounterDocument {
  readonly prerendering?: boolean;
  readonly head: { append(node: HTMLScriptElement): void };
  createElement(tag: 'script'): HTMLScriptElement;
  addEventListener(type: 'prerenderingchange', listener: () => void, options: { once: true }): void;
}

/** Loads the count script now, or when a prerendered page is shown. */
export function startCounting(doc: CounterDocument, config: CounterConfig): void {
  const load = () => {
    const script = doc.createElement('script');
    script.async = true;
    script.src = config.script;
    script.integrity = config.integrity;
    script.crossOrigin = 'anonymous';
    // The script finds its count address in this attribute
    script.dataset['goatcounter'] = config.endpoint;
    doc.head.append(script);
  };
  if (doc.prerendering) doc.addEventListener('prerenderingchange', load, { once: true });
  else load();
}
