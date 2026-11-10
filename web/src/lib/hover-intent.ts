/**
 * Runs `action` once the pointer has rested on `target` for `delay` milliseconds. Passing over
 * it on the way somewhere else does nothing, so sweeping across the set timeline does not
 * load every set page it touches.
 */
export function onHoverIntent(target: EventTarget, delay: number, action: () => void): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  target.addEventListener('pointerenter', () => {
    clearTimeout(timer);
    timer = setTimeout(action, delay);
  });
  target.addEventListener('pointerleave', () => clearTimeout(timer));
}
