/**
 * The light along the banner's top edge (components/hero/HeroPanel.astro): brightest under the
 * current page's tab, it glides over to a tab the pointer rests on or the keyboard focuses,
 * and back when it leaves. The script only says where; the banner's CSS draws and glides it.
 */
import { followTabs, tabFootCentre } from '../lib/tab-light';

const RETURN_DELAY_MS = 90;

export function initTabLight(): void {
  for (const nav of document.querySelectorAll<HTMLElement>('[data-tabs]')) {
    const host = nav.closest<HTMLElement>('[data-tab-light]');
    const tabs = [...nav.querySelectorAll<HTMLElement>('.tab')];
    const home = tabs.find((tab) => tab.getAttribute('aria-current') === 'page');
    if (!host || !home) continue;
    let target = home;

    // The tabs and the banner start at the same left edge, so a tab's offset is the light's
    const place = () => {
      const leanX = parseFloat(getComputedStyle(target).getPropertyValue('--lean-x')) || 0;
      const x = tabFootCentre(target.offsetLeft, target.offsetWidth, leanX);
      host.style.setProperty('--light-x', `${x}px`);
    };

    followTabs(tabs, home, RETURN_DELAY_MS, (tab) => {
      target = tab;
      place();
    });

    // Under the current tab from the start, gliding only from then on
    place();
    void host.offsetWidth;
    host.dataset.lightGlide = '';

    // The tabs change width when the display font arrives and on narrow screens
    const resized = new ResizeObserver(place);
    for (const tab of tabs) resized.observe(tab);
  }
}
