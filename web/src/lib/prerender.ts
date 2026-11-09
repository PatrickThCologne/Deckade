/**
 * Pages behind the page tabs are prerendered in the background once the pointer rests on a
 * tab (speculation rules in layouts/BaseLayout.astro), so they open without waiting. Their
 * scripts run before the reader sees them; effects meant to be seen wait with this.
 */

/** The parts of `document` this needs; `prerendering` is missing in browsers without it. */
interface Page extends EventTarget {
  readonly prerendering?: boolean;
}

/** Runs `action` once the page is shown: at once, or when a prerendered page is opened. */
export function whenShown(page: Page, action: () => void): void {
  if (!page.prerendering) {
    action();
    return;
  }
  page.addEventListener('prerenderingchange', () => action(), { once: true });
}
