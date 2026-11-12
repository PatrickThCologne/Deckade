/**
 * The search tab (pages/[lang]/search.astro): reads the request (lib/search/query.ts) and lists
 * the matching cards of the "All cards" list as images. The list is large, so it is loaded with
 * the first search, not with the page.
 */
import { isLocale } from '../config/site';
import { type CatalogCard, type CatalogFile, decodeCatalog } from '../lib/cards/catalog';
import { compareCards, isSortKey, normalizeForSearch, searchWords } from '../lib/cards/sort';
import { createFormatters } from '../lib/format';
import {
  exactNameMatch,
  nameRank,
  parseQuery,
  queryMatcher,
  type SearchSet,
  understood as namesFilters,
} from '../lib/search/query';

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

interface Result extends CatalogCard {
  readonly search: string;
  element?: HTMLLIElement;
}

/** The loaded card list, with the sets a request may name ("aus Reality Fracture"). */
interface Catalog {
  readonly cards: readonly Result[];
  readonly sets: readonly SearchSet[];
  /** Every card name, shown and other language, normalized: a request that is one wins. */
  readonly names: ReadonlySet<string>;
}

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

  let catalog: Promise<Catalog | null> | undefined;
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
        }));
        return {
          cards,
          sets: Object.entries(file.sets).map(([code, name]) => ({ code, name })),
          names: new Set(
            cards.flatMap((card) =>
              [card.name, card.altName].filter(Boolean).map((name) => normalizeForSearch(name)),
            ),
          ),
        };
      })
      .catch(() => null));

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

  let latest = '';
  const run = async (request: string) => {
    latest = request;
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
    if (request !== latest) return; // a newer search has started meanwhile
    if (!loaded) {
      status.textContent = labels.error;
      return;
    }
    // Parsed only now: the set names a request may use come with the card list. A card name is
    // looked up as a name, even where its words read as filters ("Control Magic", "Dark
    // Ritual"): like a request without filters, which is what parseQuery('') gives.
    const query = exactNameMatch(request, loaded.names)
      ? { ...parseQuery(''), unknown: searchWords(request) }
      : parseQuery(request, loaded.sets);
    // The chosen order, otherwise the one the request names ("günstig"), otherwise play rate
    const chosen = isSortKey(sort.value) ? sort.value : null;
    const key = chosen ?? query.sort ?? 'played';
    // A name search puts the card of that name first, then names that start with it
    const rank =
      chosen || namesFilters(query)
        ? () => 0
        : (card: Result) => nameRank(card.search, query.unknown);
    matches = loaded.cards
      .filter(queryMatcher(query))
      .sort((a, b) => rank(a) - rank(b) || compareCards(a, b, key));
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
