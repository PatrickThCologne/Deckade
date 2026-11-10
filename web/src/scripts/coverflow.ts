/**
 * On phones each year's packs stand as a fan (components/overview/SetTimeline.astro): swiping
 * turns the pack in the middle to face the viewer. Tapping a pack at the side brings it to the
 * middle; tapping the one in the middle opens it. Wider screens and reduced motion keep the
 * plain row.
 */
import { fanPose, middleIndex } from '../lib/coverflow';

const PHONE = '(max-width: 560px) and (prefers-reduced-motion: no-preference)';

export function initCoverflow(): void {
  const phone = window.matchMedia(PHONE);
  const rows = [...document.querySelectorAll<HTMLElement>('[data-fan-row]')].map(fanRow);
  const apply = () => rows.forEach((row) => row.toggle(phone.matches));
  phone.addEventListener('change', apply);
  window.addEventListener('resize', () => rows.forEach((row) => row.update()), { passive: true });
  apply();
}

function fanRow(row: HTMLElement) {
  const packs = [...row.children] as HTMLElement[];
  let on = false;
  let front = -1;
  let frame = 0;

  const centreOf = (pack: HTMLElement) => pack.offsetLeft + pack.offsetWidth / 2;
  const middleTo = (pack: HTMLElement, behavior: ScrollBehavior) =>
    row.scrollTo({ left: centreOf(pack) - row.clientWidth / 2, behavior });

  const update = () => {
    frame = 0;
    if (!on || packs.length === 0) return;
    // One step is the distance from one pack's middle to the next one's
    const step = packs.length > 1 ? centreOf(packs[1]!) - centreOf(packs[0]!) : 1;
    const middle = row.scrollLeft + row.clientWidth / 2;
    const distances = packs.map((pack) => (centreOf(pack) - middle) / step);
    packs.forEach((pack, index) => {
      const pose = fanPose(distances[index]!);
      pack.style.transform = pose.transform;
      pack.style.zIndex = String(pose.zIndex);
    });
    const next = middleIndex(distances);
    if (next !== front) {
      packs[front]?.removeAttribute('data-front');
      packs[next]!.setAttribute('data-front', '');
      front = next;
    }
  };

  row.addEventListener(
    'scroll',
    () => {
      if (on && !frame) frame = requestAnimationFrame(update);
    },
    { passive: true },
  );
  // Before the set overlay sees the click, which leaves clicks alone that are taken care of
  row.addEventListener(
    'click',
    (event) => {
      const pack = (event.target as Element).closest<HTMLElement>('[data-fan-row] > *');
      if (!on || !pack || pack.hasAttribute('data-front')) return;
      event.preventDefault();
      middleTo(pack, 'smooth');
    },
    { capture: true },
  );

  return {
    update,
    toggle(phone: boolean) {
      if (phone === on) return;
      on = phone;
      row.toggleAttribute('data-fan', on);
      if (on) {
        // Start in the middle of the year, so the fan opens to both sides
        const start = packs[Math.floor((packs.length - 1) / 2)];
        if (start) middleTo(start, 'instant');
        update();
        return;
      }
      for (const pack of packs) {
        pack.style.removeProperty('transform');
        pack.style.removeProperty('z-index');
        pack.removeAttribute('data-front');
      }
      front = -1;
    },
  };
}
