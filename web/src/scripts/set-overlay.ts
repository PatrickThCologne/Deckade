/**
 * Opens set pages as an overlay above the overview, so the overview stays visible
 * (dimmed) behind it and one click next to the columns leads back.
 *
 * Every set still has its own URL and page: the overlay loads that page, shows its
 * [data-set-view] and pushes the URL into the history. Back closes the overlay,
 * forward opens it again, and a reload or a shared link shows the standalone page.
 * Without JavaScript the tiles are plain links.
 */
import { LEAVE_EVENT, initSetView } from './set-view';

const FLIGHT_MS = 520;
const FADE_MS = 220;

interface OverlayEntry {
  readonly href: string;
  readonly tileImage: HTMLImageElement | null;
}

interface HistoryState {
  setOverlay?: string;
}

export function initSetOverlay(): void {
  const links = [...document.querySelectorAll<HTMLAnchorElement>('a[data-set-link]')];
  if (links.length === 0) return;
  const overlay = new SetOverlay();

  for (const link of links) {
    const prefetch = () => void overlay.load(link.href).catch(() => undefined);
    link.addEventListener('pointerenter', prefetch, { once: true });
    link.addEventListener('focus', prefetch, { once: true });
    link.addEventListener('click', (event) => {
      const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
      if (event.defaultPrevented || event.button !== 0 || modified) return;
      event.preventDefault();
      void overlay.open(link.href, { push: true });
    });
  }
  window.addEventListener('popstate', (event) => overlay.followHistory(event.state));
}

class SetOverlay {
  private readonly dialog: HTMLDialogElement;
  private readonly pages = new Map<string, Promise<Document>>();
  private readonly overviewTitle = document.title;
  private current: OverlayEntry | null = null;
  private closing: Promise<void> | null = null;

  constructor() {
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'set-overlay';
    document.body.append(this.dialog);
    this.dialog.addEventListener('cancel', (event) => {
      event.preventDefault(); // Escape: go through the history like every other way out
      this.requestClose();
    });
    this.dialog.addEventListener('click', (event) => {
      if (event.target === this.dialog) this.requestClose();
    });
    this.dialog.addEventListener(LEAVE_EVENT, () => this.requestClose());
  }

  load(href: string): Promise<Document> {
    let page = this.pages.get(href);
    if (!page) {
      page = fetch(href)
        .then((response) => {
          if (!response.ok) throw new Error(`${href}: HTTP ${response.status}`);
          return response.text();
        })
        .then((html) => new DOMParser().parseFromString(html, 'text/html'));
      this.pages.set(href, page);
      page.catch(() => this.pages.delete(href));
    }
    return page;
  }

  async open(href: string, { push }: { push: boolean }): Promise<void> {
    if (this.closing) await this.closing;
    if (this.current) return;
    let page: Document;
    try {
      page = await this.load(href);
    } catch {
      window.location.assign(href); // fall back to the standalone page
      return;
    }
    const view = page.querySelector('[data-set-view]');
    if (!view) {
      window.location.assign(href);
      return;
    }

    adoptStylesheets(page);
    const content = document.importNode(view, true);
    this.dialog.replaceChildren(content);
    document.documentElement.classList.add('has-overlay');
    this.dialog.showModal();
    this.dialog.scrollTop = 0;
    if (push) history.pushState({ setOverlay: href } satisfies HistoryState, '', href);
    document.title = page.title;

    const tileImage = tileImageFor(href);
    this.current = { href, tileImage };
    initSetView(this.dialog);

    const packImage = content.querySelector<HTMLImageElement>('[data-pack-image]');
    if (tileImage && packImage) {
      tileImage.style.visibility = 'hidden';
      await fly(tileImage, packImage, this.dialog);
    }
  }

  /** Closing always goes back in the history, so the URL matches what is shown. */
  requestClose(): void {
    const state = history.state as HistoryState | null;
    if (state?.setOverlay) history.back();
    else void this.close();
  }

  followHistory(state: HistoryState | null): void {
    if (state?.setOverlay && !this.current) void this.open(state.setOverlay, { push: false });
    else if (!state?.setOverlay && this.current) void this.close();
  }

  private close(): Promise<void> {
    this.closing ??= this.runClose().finally(() => {
      this.closing = null;
    });
    return this.closing;
  }

  private async runClose(): Promise<void> {
    const entry = this.current;
    if (!entry) return;
    this.current = null;
    this.dialog.classList.add('is-closing');
    const packImage = this.dialog.querySelector<HTMLImageElement>('[data-pack-image]');
    if (entry.tileImage && packImage) await fly(packImage, entry.tileImage, this.dialog);
    else await wait(FADE_MS);

    this.dialog.close();
    this.dialog.classList.remove('is-closing');
    this.dialog.replaceChildren();
    document.documentElement.classList.remove('has-overlay');
    document.title = this.overviewTitle;
    if (entry.tileImage) entry.tileImage.style.visibility = '';
  }
}

function tileImageFor(href: string): HTMLImageElement | null {
  const path = new URL(href, window.location.href).pathname;
  const link = [...document.querySelectorAll<HTMLAnchorElement>('a[data-set-link]')].find(
    (candidate) => new URL(candidate.href).pathname === path,
  );
  return link?.querySelector('img') ?? null;
}

/** The set page brings its own (scoped) styles; load the ones this page does not have yet. */
function adoptStylesheets(page: Document): void {
  const present = new Set(
    [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) => l.href),
  );
  const inline = new Set([...document.querySelectorAll('style')].map((s) => s.textContent));
  for (const link of page.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
    if (!present.has(link.href)) document.head.append(document.importNode(link, true));
  }
  for (const style of page.querySelectorAll('head style')) {
    if (!inline.has(style.textContent)) document.head.append(document.importNode(style, true));
  }
}

/** A copy of the pack image flies from one place to the other (tile <-> overlay). */
async function fly(from: HTMLImageElement, to: HTMLImageElement, layer: HTMLElement) {
  const start = from.getBoundingClientRect();
  const end = to.getBoundingClientRect();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !start.width || !end.width) {
    await wait(FADE_MS);
    return;
  }
  const ghost = from.cloneNode() as HTMLImageElement;
  ghost.removeAttribute('loading');
  ghost.className = 'pack-ghost';
  Object.assign(ghost.style, {
    left: `${start.left}px`,
    top: `${start.top}px`,
    width: `${start.width}px`,
    height: `${start.height}px`,
    visibility: 'visible',
    transform: '',
  });
  layer.append(ghost);
  from.style.visibility = 'hidden';
  to.style.visibility = 'hidden';
  const animation = ghost.animate(
    [
      { transform: 'translate(0, 0) scale(1)' },
      {
        transform: `translate(${end.left - start.left}px, ${end.top - start.top}px) scale(${end.width / start.width})`,
      },
    ],
    { duration: FLIGHT_MS, easing: 'cubic-bezier(.22,.9,.24,1)', fill: 'forwards' },
  );
  // Browsers pause animations in background tabs; never let the overlay wait for that.
  await Promise.race([animation.finished.catch(() => undefined), wait(FLIGHT_MS + 150)]);
  to.style.visibility = '';
  ghost.remove();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
