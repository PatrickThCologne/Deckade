/** Packs tilt slightly towards the pointer, as if held in the hand. */
const MAX_TILT_X = 10; // degrees
const MAX_TILT_Y = 16;

export function initTilt(): void {
  const canHover = window.matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)');
  if (!canHover.matches) return;

  document.querySelectorAll<HTMLElement>('[data-tilt]').forEach((tile) => {
    if (tile.dataset.tiltReady) return;
    tile.dataset.tiltReady = 'true';
    tile.addEventListener('pointermove', (event) => {
      const box = tile.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - 0.5;
      const y = (event.clientY - box.top) / box.height - 0.5;
      tile.style.setProperty('--ry', `${(x * MAX_TILT_Y).toFixed(1)}deg`);
      tile.style.setProperty('--rx', `${(-y * MAX_TILT_X).toFixed(1)}deg`);
    });
    tile.addEventListener('pointerleave', () => {
      tile.style.removeProperty('--rx');
      tile.style.removeProperty('--ry');
    });
  });
}
