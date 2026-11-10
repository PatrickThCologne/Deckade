/**
 * Phones have no hover and no room for the preview next to the table: holding a finger on a
 * row shows that card large above the finger. Sliding the finger over other rows switches the
 * card; lifting it hides the preview without opening the row's link.
 */
import { onLongPress, previewPlacement, type Point } from '../lib/long-press';

const PRESS_MS = 350;
const SLOP_PX = 10;
// Card images are 488 x 680
const CARD_RATIO = 680 / 488;

export function connectPressPreview(body: HTMLTableSectionElement): void {
  let preview: HTMLImageElement | null = null;
  let shown: HTMLTableRowElement | null = null;
  let endedAt = 0;

  const rowAt = (point: Point) => {
    const element = document.elementFromPoint(point.x, point.y);
    const row = element?.closest<HTMLTableRowElement>('tr');
    return row && body.contains(row) && row.dataset.image ? row : null;
  };

  const place = (point: Point) => {
    if (!preview) return;
    const width = Math.min(260, window.innerWidth * 0.7);
    const height = width * CARD_RATIO;
    const box = previewPlacement(
      point,
      { width: window.innerWidth, height: window.innerHeight },
      { width, height },
    );
    Object.assign(preview.style, {
      width: `${width}px`,
      height: `${height}px`,
      left: `${box.left}px`,
      top: `${box.top}px`,
    });
  };

  const show = (row: HTMLTableRowElement | null) => {
    if (!preview || !row || row === shown) return;
    shown?.classList.remove('is-pressed');
    row.classList.add('is-pressed');
    shown = row;
    preview.src = row.dataset.image ?? '';
    preview.alt = row.dataset.name ?? '';
  };

  const press = onLongPress(
    body,
    { delay: PRESS_MS, slop: SLOP_PX },
    {
      start(point) {
        const row = rowAt(point);
        if (!row) return;
        preview = document.createElement('img');
        preview.className = 'press-preview';
        preview.decoding = 'async';
        // Inside the set overlay the preview has to share its top layer to be seen
        (body.closest('dialog') ?? document.body).append(preview);
        show(row);
        place(point);
      },
      move(point) {
        show(rowAt(point));
        place(point);
      },
      end() {
        preview?.remove();
        preview = null;
        shown?.classList.remove('is-pressed');
        shown = null;
        endedAt = performance.now();
      },
    },
  );

  // While a press runs the finger moves the preview, not the page
  body.addEventListener(
    'touchmove',
    (event) => {
      if (press.active) event.preventDefault();
    },
    { passive: false },
  );
  // No long-press menu of the browser, and no link opened when the finger lifts
  body.addEventListener('contextmenu', (event) => {
    if (press.active || performance.now() - endedAt < 400) event.preventDefault();
  });
  body.addEventListener(
    'click',
    (event) => {
      if (performance.now() - endedAt < 400) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    { capture: true },
  );
}
