/**
 * The light along the banner's top edge (components/hero/HeroPanel.astro): brightest under the
 * current page's tab, it glides over to a tab the pointer rests on or the keyboard focuses,
 * and back when it leaves. The script only says where; the banner's CSS draws and glides it.
 */
import { followTabs, reachPastCorner, tabFootCentre } from '../lib/tab-light';

const RETURN_DELAY_MS = 90;
/** How far the light runs down the right edge when it starts under the last tab */
const PAST_CORNER_PX = 120;

export function initTabLight(): void {
  for (const nav of document.querySelectorAll<HTMLElement>('[data-tabs]')) {
    const host = nav.closest<HTMLElement>('[data-tab-light]');
    const tabs = [...nav.querySelectorAll<HTMLElement>('.tab')];
    const home = tabs.find((tab) => tab.getAttribute('aria-current') === 'page');
    const frame = host?.querySelector<HTMLElement>('[data-light-frame]');
    if (!host || !home || !frame) continue;
    let target = home;

    // The tabs and the banner start at the same left edge, so a tab's offset is the light's
    const centre = (tab: HTMLElement) => {
      const leanX = parseFloat(getComputedStyle(tab).getPropertyValue('--lean-x')) || 0;
      return tabFootCentre(tab.offsetLeft, tab.offsetWidth, leanX);
    };
    const place = () => host.style.setProperty('--light-x', `${centre(target)}px`);

    // The light carries on round the banner's corners, so it needs to know where they are
    const measure = () => {
      const width = frame.offsetWidth;
      host.style.setProperty('--light-w', `${width}px`);
      host.style.setProperty('--light-h', `${frame.offsetHeight}px`);
      const span = reachPastCorner(width, centre(tabs[tabs.length - 1]!), PAST_CORNER_PX);
      host.style.setProperty('--light-span', `${span}px`);
    };

    followTabs(tabs, home, RETURN_DELAY_MS, (tab) => {
      target = tab;
      place();
    });

    // Under the current tab from the start, gliding only from then on
    measure();
    place();
    host.style.setProperty('--light-on', '1');
    void host.offsetWidth;
    host.dataset.lightGlide = '';

    // The tabs change width when the display font arrives, the banner when the text wraps
    const resized = new ResizeObserver(() => {
      measure();
      place();
    });
    for (const tab of tabs) resized.observe(tab);
    resized.observe(frame);
  }
}
