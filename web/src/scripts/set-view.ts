/**
 * Behaviour of a set view, both as its own page and inside the overlay:
 * card table enhancements, and "leave" -- the back link, the close button or a click
 * on the empty space around the columns returns to the overview.
 */
import { initCardTables } from './card-table';

/** Fired on the view when it should be left; the overlay listens for it. */
export const LEAVE_EVENT = 'set-view:leave';

export function initSetView(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-set-view]').forEach((view) => {
    if (view.dataset.ready) return;
    view.dataset.ready = 'true';
    initCardTables(view);
    view.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const leaveControl = target.closest('[data-leave]');
      const onEmptySpace = target === view || target.hasAttribute('data-leave-area');
      if (!leaveControl && !onEmptySpace) return;
      event.preventDefault();
      leave(view);
    });
  });
}

function leave(view: HTMLElement): void {
  if (view.closest('dialog')) {
    view.dispatchEvent(new CustomEvent(LEAVE_EVENT, { bubbles: true }));
  } else {
    window.location.assign(view.dataset.overview ?? '/');
  }
}
