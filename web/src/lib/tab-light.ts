/**
 * The light along the banner's top edge (scripts/tab-light.ts, components/hero/HeroPanel.astro).
 */

/**
 * Tells `move` which tab the light belongs under: the one the pointer rests on or the keyboard
 * focuses, otherwise `home`, the current page's tab. Going home waits `delay` milliseconds, so
 * crossing the small gap between two tabs does not send the light home and out again.
 */
export function followTabs<T extends EventTarget>(
  tabs: readonly T[],
  home: T,
  delay: number,
  move: (tab: T) => void,
): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const moveTo = (tab: T) => {
    clearTimeout(timer);
    move(tab);
  };
  const goHome = () => {
    clearTimeout(timer);
    timer = setTimeout(() => move(home), delay);
  };
  for (const tab of tabs) {
    tab.addEventListener('pointerenter', () => moveTo(tab));
    tab.addEventListener('pointerleave', goHome);
    tab.addEventListener('focus', () => moveTo(tab));
    tab.addEventListener('blur', goHome);
  }
}

/**
 * Where the light is brightest under a tab: the middle of the tab's foot. The tab's shape
 * leans from its bottom left corner and leaves `leanX` free on the right, so its foot is that
 * much narrower than the tab's box.
 */
export function tabFootCentre(left: number, width: number, leanX: number): number {
  return left + (width - leanX) / 2;
}
