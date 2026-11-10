/**
 * The hover bar of the page tabs (components/layout/PageTabs.astro). All tabs share one bar:
 * moving from tab to tab slides it over instead of starting a new one each time. Leaving is
 * delayed a moment, so crossing the small gap between two tabs does not reset it.
 */
const HIDE_DELAY_MS = 90;

export function initTabBar(): void {
  for (const nav of document.querySelectorAll<HTMLElement>('[data-tabs]')) {
    let hideTimer = 0;

    const show = (tab: HTMLElement) => {
      window.clearTimeout(hideTimer);
      nav.style.setProperty('--bar-x', `${tab.offsetLeft}px`);
      if (nav.dataset.bar !== undefined) return;
      // Appear at this tab instead of sliding over from where the bar was last: apply the
      // position while sliding is still off, then switch the bar on.
      void nav.offsetWidth;
      nav.dataset.bar = '';
    };

    const hide = () => {
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => delete nav.dataset.bar, HIDE_DELAY_MS);
    };

    for (const tab of nav.querySelectorAll<HTMLElement>('.tab')) {
      tab.addEventListener('pointerenter', () => show(tab));
      tab.addEventListener('pointerleave', hide);
      tab.addEventListener('focus', () => show(tab));
      tab.addEventListener('blur', hide);
    }
  }
}
