// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogFile } from '../src/lib/cards/catalog';
import { SORT_KEYS } from '../src/lib/cards/sort';
import { createFormatters } from '../src/lib/format';
import { initCardSearch } from '../src/scripts/card-search';
import {
  astroMarkup,
  catalogCard,
  catalogFile,
  jsonResponse,
  serveCatalog,
  settle,
} from './catalog-file';

const SRC = '/en/cards.json';
const LABELS = {
  count: '{count} cards',
  none: 'No card matches.',
  loading: 'Loading cards …',
  error: 'The card list could not be loaded.',
  more: 'Show {count} more cards',
  scryfall: 'Open on Scryfall',
};

// 100 cards found by "zork", in name order since none is played; two more found by name
const ZORKS = Array.from({ length: 100 }, (_, i) =>
  catalogCard(`Zork ${String(i + 1).padStart(3, '0')}`),
);
const BOLT = catalogCard('Lightning Bolt', {
  price: 1.5,
  imageNormal: 'https://cards.scryfall.io/normal/front/a/b/ab12-34.jpg?1',
});
const SHOCK = catalogCard('Shock', { price: 0.1 });
const FILE = catalogFile([...ZORKS, BOLT, SHOCK]);

/** The search tab's markup (pages/[lang]/search.astro) with the attributes the script reads. */
function renderPage(): void {
  document.documentElement.lang = 'en';
  document.body.innerHTML = `
    <div data-card-search data-src="${SRC}" data-locale="en">
      <form role="search" data-search-form>
        <input name="q" type="search" />
        <button type="submit">Search</button>
        <select name="sort" data-search-sort>
          <option value="">Automatic</option>
          ${SORT_KEYS.map((key) => `<option value="${key}">${key}</option>`).join('')}
        </select>
        <button type="button" data-example> lightning bolt </button>
      </form>
      <div role="status" aria-live="polite">
        <p class="status" data-status hidden></p>
      </div>
      <ul data-results></ul>
      <button type="button" data-more hidden></button>
    </div>`;
  document.querySelector<HTMLElement>('[data-card-search]')!.dataset.labels =
    JSON.stringify(LABELS);
}

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const input = () => $<HTMLInputElement>('input[name="q"]');
const form = () => $<HTMLFormElement>('[data-search-form]');
const status = () => $('[data-status]');
const more = () => $<HTMLButtonElement>('[data-more]');
const names = () =>
  [...document.querySelectorAll('[data-results] .name')].map((n) => n.textContent);
const query = () => new URL(window.location.href).searchParams.get('q');

const submit = (request: string) => {
  input().value = request;
  form().dispatchEvent(new Event('submit', { cancelable: true }));
};

const visit = (search: string) => history.replaceState(null, '', `/en/search/${search}`);

beforeEach(() => {
  visit('');
  renderPage();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('initCardSearch', () => {
  it('does not load the card list before the first search', async () => {
    const fetch = serveCatalog(FILE);
    await initCardSearch();
    expect(fetch).not.toHaveBeenCalled();
    expect(status().hidden).toBe(true);
  });

  it('runs the request of the address on load and shows the cards with their count', async () => {
    const fetch = serveCatalog(FILE);
    visit('?q=lightning+bolt');
    await initCardSearch();

    expect(fetch).toHaveBeenCalledWith(SRC);
    expect(input().value).toBe('lightning bolt');
    expect(names()[0]).toBe('Lightning Bolt');
    expect(status().hidden).toBe(false);
    expect(status().textContent).toBe(`${names().length} cards`);
  });

  it('shows each card as a Scryfall link with image, name and price', async () => {
    serveCatalog(FILE);
    visit('?q=lightning+bolt');
    await initCardSearch();

    const link = $<HTMLAnchorElement>('[data-results] li a');
    expect(link.href).toBe(BOLT.scryfallUrl);
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener');
    expect(link.title).toBe(LABELS.scryfall);
    expect(link.querySelector('img')?.src).toBe(BOLT.imageNormal);
    expect(link.querySelector('.price')?.textContent).toBe(createFormatters('en').price(1.5));
  });

  it('shows a placeholder for a card without image', async () => {
    serveCatalog(FILE);
    visit('?q=shock');
    await initCardSearch();

    const link = $<HTMLAnchorElement>('[data-results] li a');
    expect(link.querySelector('img')).toBeNull();
    expect(link.querySelector('.no-image')).not.toBeNull();
  });

  it('says so when no card matches', async () => {
    serveCatalog(FILE);
    visit('?q=qqqxxx');
    await initCardSearch();

    expect(status().textContent).toBe(LABELS.none);
    expect(names()).toEqual([]);
    expect(more().hidden).toBe(true);
  });

  it('hides the status and clears the results for an empty request', async () => {
    serveCatalog(FILE);
    visit('?q=shock');
    await initCardSearch();
    expect(names()).toEqual(['Shock']);

    submit('   ');
    await settle();
    expect(status().hidden).toBe(true);
    expect(names()).toEqual([]);
    expect(query()).toBeNull();
  });

  it('waits for a pause in typing, then searches and keeps the request in the address', async () => {
    vi.useFakeTimers();
    const fetch = serveCatalog(FILE);
    const replaceState = vi.spyOn(history, 'replaceState');
    await initCardSearch();

    input().value = 'sh';
    input().dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(200);
    input().value = 'shock';
    input().dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(349);
    expect(fetch).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(query()).toBe('shock');
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(names()).toEqual(['Shock']);
  });

  it('searches at once on submit, without waiting for the typing pause', async () => {
    vi.useFakeTimers();
    const fetch = serveCatalog(FILE);
    const replaceState = vi.spyOn(history, 'replaceState');
    await initCardSearch();

    input().value = 'zork';
    input().dispatchEvent(new Event('input'));
    submit('shock');
    expect(query()).toBe('shock');
    expect(fetch).toHaveBeenCalledTimes(1);

    // The typing timer was cleared: it does not search a second time later
    await vi.runAllTimersAsync();
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(names()).toEqual(['Shock']);
  });

  it('trims the request it keeps in the address', async () => {
    serveCatalog(FILE);
    await initCardSearch();
    submit('  shock  ');
    expect(query()).toBe('shock');
  });

  it('fills the field with an example and searches it', async () => {
    serveCatalog(FILE);
    await initCardSearch();

    $<HTMLButtonElement>('[data-example]').click();
    expect(input().value).toBe('lightning bolt');
    expect(query()).toBe('lightning bolt');
    await settle();
    expect(names()[0]).toBe('Lightning Bolt');
  });

  it('shows the results 48 at a time and hides the button at the end', async () => {
    serveCatalog(FILE);
    visit('?q=zork');
    await initCardSearch();

    expect(status().textContent).toBe('100 cards');
    expect(names()).toHaveLength(48);
    expect(more().hidden).toBe(false);
    expect(more().textContent).toBe('Show 48 more cards');

    more().click();
    expect(names()).toHaveLength(96);
    expect(more().textContent).toBe('Show 4 more cards');

    more().click();
    expect(names()).toHaveLength(100);
    expect(more().hidden).toBe(true);
    expect(new Set(names()).size).toBe(100);
  });

  it('starts again at the first step for a new request', async () => {
    serveCatalog(FILE);
    visit('?q=zork');
    await initCardSearch();
    more().click();

    submit('zork');
    await settle();
    expect(names()).toHaveLength(48);
  });

  it('shows the error when the list cannot be loaded, and loads it again with the next search', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>(async () => jsonResponse(FILE))
      .mockResolvedValueOnce(jsonResponse(null, 500));
    vi.stubGlobal('fetch', fetch);
    visit('?q=shock');
    await initCardSearch();
    expect(status().textContent).toBe(LABELS.error);
    expect(names()).toEqual([]);

    submit('shock');
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(names()).toEqual(['Shock']);
    expect(status().textContent).toBe('1 cards');
  });

  it('shows the error when the request for the list fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    visit('?q=shock');
    await initCardSearch();
    expect(status().textContent).toBe(LABELS.error);
  });

  it('loads the list only once for many searches', async () => {
    const fetch = serveCatalog(FILE);
    visit('?q=shock');
    await initCardSearch();
    submit('zork');
    await settle();
    submit('lightning bolt');
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shows the loading text while the list loads', async () => {
    const response = Promise.withResolvers<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => response.promise),
    );
    await initCardSearch();
    submit('shock');
    expect(status().hidden).toBe(false);
    expect(status().textContent).toBe(LABELS.loading);

    response.resolve(jsonResponse(FILE));
    await settle();
    expect(status().textContent).toBe('1 cards');
  });

  it('shows only the newest search when an older one finishes later', async () => {
    const response = Promise.withResolvers<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => response.promise),
    );
    await initCardSearch();
    submit('zork');
    submit('shock');

    response.resolve(jsonResponse(FILE));
    await settle();
    expect(names()).toEqual(['Shock']);
    expect(status().textContent).toBe('1 cards');
    expect(more().hidden).toBe(true);
  });

  it('shows a request submitted twice while the list loads only once', async () => {
    const response = Promise.withResolvers<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => response.promise),
    );
    await initCardSearch();
    submit('zork');
    submit('zork');

    response.resolve(jsonResponse(FILE));
    await settle();
    // Both runs rendering would show the first two steps at once
    expect(names()).toHaveLength(48);
    expect(more().textContent).toBe('Show 48 more cards');
  });

  it('takes the sort order from the address and keeps a changed one there', async () => {
    serveCatalog(FILE);
    visit('?q=zork&sort=name');
    await initCardSearch();
    const sort = $<HTMLSelectElement>('[data-search-sort]');
    expect(sort.value).toBe('name');

    sort.value = '';
    sort.dispatchEvent(new Event('change'));
    expect(new URL(window.location.href).searchParams.has('sort')).toBe(false);

    sort.value = 'value-desc';
    sort.dispatchEvent(new Event('change'));
    expect(new URL(window.location.href).searchParams.get('sort')).toBe('value-desc');
    expect(query()).toBe('zork');
  });

  it('ignores an unknown sort order in the address', async () => {
    serveCatalog(FILE);
    visit('?sort=nonsense');
    await initCardSearch();
    expect($<HTMLSelectElement>('[data-search-sort]').value).toBe('');
  });

  it('orders the results by the chosen sort', async () => {
    const file = catalogFile([
      catalogCard('Zork Cheap', { price: 0.1 }),
      catalogCard('Zork Dear', { price: 9 }),
      catalogCard('Zork Middle', { price: 2 }),
    ]);
    serveCatalog(file);
    visit('?q=zork&sort=value-asc');
    await initCardSearch();
    expect(names()).toEqual(['Zork Cheap', 'Zork Middle', 'Zork Dear']);

    const sort = $<HTMLSelectElement>('[data-search-sort]');
    sort.value = 'value-desc';
    sort.dispatchEvent(new Event('change'));
    await settle();
    expect(names()).toEqual(['Zork Dear', 'Zork Middle', 'Zork Cheap']);
  });

  it('does nothing on a page without the search', async () => {
    const fetch = serveCatalog(FILE);
    document.body.innerHTML = '<main></main>';
    visit('?q=shock');
    await expect(initCardSearch()).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads a list file without creature types', async () => {
    const older = { sets: FILE.sets, cards: FILE.cards } as unknown as CatalogFile;
    serveCatalog(older);
    visit('?q=shock');
    await initCardSearch();
    expect(names()).toEqual(['Shock']);
  });
});

describe('search.astro markup', () => {
  const page = () => astroMarkup('pages/[lang]/search.astro');

  it('puts the status into a polite live region that is always there', () => {
    const status = page().querySelector('[data-status]');
    const region = status?.closest('[role="status"]');
    expect(region?.getAttribute('aria-live')).toBe('polite');
    expect(region?.hasAttribute('hidden')).toBe(false);
  });

  it('has every element the script looks for', () => {
    const root = page().querySelector('[data-card-search]');
    expect(root).not.toBeNull();
    for (const attribute of ['data-src', 'data-labels', 'data-locale']) {
      expect(root?.hasAttribute(attribute), attribute).toBe(true);
    }
    const form = root?.querySelector('[data-search-form]');
    for (const selector of ['input[name="q"]', '[data-search-sort]', '[data-example]']) {
      expect(form?.querySelector(selector), selector).not.toBeNull();
    }
    for (const selector of ['[data-status]', '[data-results]', '[data-more]']) {
      expect(root?.querySelector(selector), selector).not.toBeNull();
    }
  });
});
