/**
 * The gold line over the tab the pointer rests on (scripts/tab-trace.ts,
 * components/layout/PageTabs.astro).
 */

export interface TraceMoves<T> {
  /** Put the line over `tab`; `fresh` when it was not showing, so it draws itself in. */
  show(tab: T, fresh: boolean): void;
  hide(): void;
}

/**
 * Follows the pointer and the keyboard focus over the tabs. From one tab to the next the line
 * glides over instead of starting again; it goes away a moment after the pointer has left the
 * tabs (`delay`, so crossing the seam between two tabs does not end it) and at once over a tab
 * that `skip` leaves out, the current page's.
 */
export function traceTabs<T extends EventTarget>(
  tabs: readonly T[],
  skip: (tab: T) => boolean,
  delay: number,
  moves: TraceMoves<T>,
): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let showing = false;
  const hide = () => {
    clearTimeout(timer);
    if (!showing) return;
    showing = false;
    moves.hide();
  };
  const enter = (tab: T) => {
    clearTimeout(timer);
    if (skip(tab)) {
      hide();
      return;
    }
    moves.show(tab, !showing);
    showing = true;
  };
  const leave = () => {
    clearTimeout(timer);
    timer = setTimeout(hide, delay);
  };
  for (const tab of tabs) {
    tab.addEventListener('pointerenter', () => enter(tab));
    tab.addEventListener('pointerleave', leave);
    tab.addEventListener('focus', () => enter(tab));
    tab.addEventListener('blur', leave);
  }
}
