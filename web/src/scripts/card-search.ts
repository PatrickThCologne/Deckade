/**
 * The search tab (pages/[lang]/search.astro): reads the request (lib/search/query.ts), shows
 * how it was understood and lists the matching cards of the "All cards" list as images. The
 * list is large, so it is loaded with the first search, not with the page.
 */
import { isLocale } from '../config/site';
import { type CatalogCard, type CatalogFile, decodeCatalog } from '../lib/cards/catalog';
import { compareCards, normalizeForSearch } from '../lib/cards/sort';
import { createFormatters } from '../lib/format';
import { type ChipLabels, queryChips } from '../lib/search/chips';
import {
  nameRank,
  parseQuery,
  queryMatcher,
  understood as namesFilters,
} from '../lib/search/query';

/** Cards added per step */
const STEP = 48;
/** Typing pauses this long before the search runs */
const TYPING_DELAY_MS = 350;

interface Labels extends ChipLabels {
  readonly understood: string;
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

export async function initCardSearch(): Promise<void> {
  const root = document.querySelector<HTMLElement>('[data-card-search]');
  const form = root?.querySelector<HTMLFormElement>('[data-search-form]');
  const input = form?.querySelector<HTMLInputElement>('input[name="q"]');
  const understood = root?.querySelector<HTMLElement>('[data-understood]');
  const status = root?.querySelector<HTMLElement>('[data-status]');
  const list = root?.querySelector<HTMLElement>('[data-results]');
  const more = root?.querySelector<HTMLButtonElement>('[data-more]');
  const src = root?.dataset.src;
  if (!root || !form || !input || !understood || !status || !list || !more || !src) return;

  const labels = JSON.parse(root.dataset.labels ?? '{}') as Labels;
  const format = createFormatters(isLocale(root.dataset.locale) ? root.dataset.locale : 'de');
  const numbers = new Intl.NumberFormat(document.documentElement.lang || undefined);

  let cards: Promise<Result[] | null> | undefined;
  const load = () =>
    (cards ??= fetch(src)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<CatalogFile>;
      })
      .then((file) =>
        decodeCatalog(file).map((card) => ({
          ...card,
          search: normalizeForSearch(`${card.name}\n${card.altName}`),
        })),
      )
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
    const query = parseQuery(request);
    const chips = request.trim() ? queryChips(query, labels, format.price) : [];
    understood.replaceChildren(
      element('span', 'caption', labels.understood),
      ...chips.map((chip) =>
        element('span', chip.ignored ? 'chip chip--ignored' : 'chip', chip.text),
      ),
    );
    understood.hidden = chips.length === 0;
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
    const all = await load();
    if (request !== latest) return; // a newer search has started meanwhile
    if (!all) {
      status.textContent = labels.error;
      return;
    }
    const key = query.sort ?? 'played';
    // A name search puts the card of that name first, then names that start with it
    const rank = namesFilters(query)
      ? () => 0
      : (card: Result) => nameRank(card.search, query.unknown);
    matches = all
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
    history.replaceState(null, '', url);
    void run(request);
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => search(input.value), TYPING_DELAY_MS);
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

  const initial = new URL(window.location.href).searchParams.get('q');
  if (initial) {
    input.value = initial;
    await run(initial);
  }
}
