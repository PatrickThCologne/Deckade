/**
 * The year rail (components/overview/YearRail.astro): on every scroll it works out which year row
 * is being read, swells the entries around it and slides the list so that year stays in the
 * rail's middle (lib/year-rail.ts).
 */
import { focusIndex, focusOffset, swell } from '../lib/year-rail';

/** The reading point, this far below the top of the window: just under the sticky header */
const READ_AT = 160;

export function initYearRail(): void {
  const rail = document.querySelector<HTMLElement>('[data-year-rail]');
  const list = rail?.querySelector<HTMLElement>('[data-year-list]');
  if (!rail || !list) return;
  const links = [...list.querySelectorAll<HTMLAnchorElement>('a[data-year]')];
  const rows = links.map(
    (link) => document.getElementById(`year-${link.dataset.year}`)?.closest('section') ?? null,
  );
  if (rows.some((row) => !row)) return;

  let queued = false;
  const update = () => {
    queued = false;
    // Hidden on narrow screens: nothing to place
    if (getComputedStyle(rail).display === 'none') return;
    const tops = rows.map((row) => row!.getBoundingClientRect().top + scrollY);
    const focus = focusIndex(tops, scrollY + READ_AT);
    const nearest = Math.round(focus);
    links.forEach((link, i) => {
      link.style.setProperty('--swell', swell(i - focus).toFixed(3));
      if (i === nearest) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    const middles = links.map((link) => link.offsetTop + link.offsetHeight / 2);
    list.style.translate = `0 ${(rail.clientHeight / 2 - focusOffset(middles, focus)).toFixed(1)}px`;
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };

  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  queue();
}
