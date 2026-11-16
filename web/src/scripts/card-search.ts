/**
 * The search tab (pages/[lang]/search.astro): lists the cards of the "All cards" list that a
 * request finds (lib/search/results.ts) as images. This script does only the page's part:
 * loading the list, showing the results step by step and keeping the request in the address.
 * The list is large, so it is loaded with the first search, not with the page.
 */
import { isLocale } from '../config/site';
import { type CatalogCard, type CatalogFile, decodeCatalog } from '../lib/cards/catalog';
import { isSortKey, normalizeForSearch } from '../lib/cards/sort';
import { createFormatters } from '../lib/format';
import { type ResultCard, type SearchCatalog, searchResults } from '../lib/search/results';

/** Cards added per step */
const STEP = 48;
/** Typing pauses this long before the search runs */
const TYPING_DELAY_MS = 350;

interface Labels {
  readonly count: string;
  readonly none: string;
  readonly loading: string;
  readonly error: string;
  readonly more: string;
  readonly scryfall: string;
}

/** A card of the list with what the search needs, and its item once it was shown. */
interface Result extends CatalogCard, ResultCard {
  element?: HTMLLIElement;
}

const cardNames = (card: CatalogCard) => [
  ...new Set(
    [card.name, card.altName]
      .filter(Boolean)
      .flatMap((name) => [name, ...(name.includes(' // ') ? name.split(' // ') : [])])
      .map((name) => normalizeForSearch(name)),
  ),
];

export async function initCardSearch(): Promise<void> {
  const root = document.querySelector<HTMLElement>('[data-card-search]');
  const form = root?.querySelector<HTMLFormElement>('[data-search-form]');
  const input = form?.querySelector<HTMLInputElement>('input[name="q"]');
  const sort = form?.querySelector<HTMLSelectElement>('[data-search-sort]');
  const status = root?.querySelector<HTMLElement>('[data-status]');
  const list = root?.querySelector<HTMLElement>('[data-results]');
  const more = root?.querySelector<HTMLButtonElement>('[data-more]');
  const src = root?.dataset.src;
  if (!root || !form || !input || !sort || !status || !list || !more || !src) return;

  const labels = JSON.parse(root.dataset.labels ?? '{}') as Labels;
  const format = createFormatters(isLocale(root.dataset.locale) ? root.dataset.locale : 'de');
  const numbers = new Intl.NumberFormat(document.documentElement.lang || undefined);

  let catalog: Promise<SearchCatalog<Result> | null> | undefined;
  const load = () =>
    (catalog ??= fetch(src)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<CatalogFile>;
      })
      .then((file) => {
        const cards = decodeCatalog(file).map((card) => ({
          ...card,
          search: normalizeForSearch(`${card.name}\n${card.altName}`),
          names: cardNames(card),
        }));
        return {
          cards,
          sets: Object.entries(file.sets).map(([code, name]) => ({ code, name })),
          // Older card list files have no creature types
          creatureTypes: file.creatureTypes ?? [],
          names: new Set(cards.flatMap((card) => card.names)),
        };
      })
      .catch(() => {
        // Not kept, so the next search tries to load the list again
        catalog = undefined;
        return null;
      }));

  const element = (tag: string, className: string, text = '') => {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  };

  const createItem = (card: Result): HTMLLIElement => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = card.scryfallUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.title = labels.scryfall;
    if (card.imageNormal) {
      const image = document.createElement('img');
      image.src = card.imageNormal;
      image.alt = '';
      image.width = 488;
      image.height = 680;
      image.loading = 'lazy';
      image.decoding = 'async';
      link.append(image);
    } else {
      link.append(element('span', 'no-image'));
    }
    link.append(
      element('span', 'name', card.name),
      element('span', 'price', format.price(card.price)),
    );
    item.append(link);
    return item;
  };

  let matches: Result[] = [];
  let shown = 0;
  const showMore = () => {
    const next = matches.slice(shown, shown + STEP);
    list.append(...next.map((card) => (card.element ??= createItem(card))));
    shown += next.length;
    const left = matches.length - shown;
    more.hidden = left <= 0;
    more.textContent = labels.more.replace('{count}', numbers.format(Math.min(STEP, left)));
  };
  more.addEventListener('click', showMore);

  // Counts the runs, so only the newest one shows its results: comparing the request would let
  // two runs of the same request (typed, then submitted while the list loads) both render
  let runs = 0;
  const run = async (request: string) => {
    const current = ++runs;
    list.replaceChildren();
    more.hidden = true;
    shown = 0;
    matches = [];
    if (!request.trim()) {
      status.hidden = true;
      return;
    }

    status.textContent = labels.loading;
    status.hidden = false;
    const loaded = await load();
    if (current !== runs) return; // a newer search has started meanwhile
    if (!loaded) {
      status.textContent = labels.error;
      return;
    }
    // Searched only now: the set names and creature types a request may use come with the
    // card list
    matches = searchResults(request, loaded, isSortKey(sort.value) ? sort.value : null);
    status.textContent =
      matches.length > 0
        ? labels.count.replace('{count}', numbers.format(matches.length))
        : labels.none;
    showMore();
  };

  // The request stays in the address, so the search can be shared and survives a reload
  const search = (request: string) => {
    const url = new URL(window.location.href);
    if (request.trim()) url.searchParams.set('q', request.trim());
    else url.searchParams.delete('q');
    if (sort.value) url.searchParams.set('sort', sort.value);
    else url.searchParams.delete('sort');
    history.replaceState(null, '', url);
    void run(request);
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => search(input.value), TYPING_DELAY_MS);
  });
  sort.addEventListener('change', () => {
    clearTimeout(timer);
    search(input.value);
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearTimeout(timer);
    search(input.value);
  });
  for (const example of form.querySelectorAll<HTMLButtonElement>('[data-example]')) {
    example.addEventListener('click', () => {
      input.value = example.textContent?.trim() ?? '';
      clearTimeout(timer);
      search(input.value);
    });
  }

  const params = new URL(window.location.href).searchParams;
  const initialSort = params.get('sort') ?? '';
  if (isSortKey(initialSort)) sort.value = initialSort;
  const initial = params.get('q');
  if (initial) {
    input.value = initial;
    await run(initial);
  }
}
