/**
 * The "All cards" tab: loads the card list (pages/[lang]/cards.json.ts), filters and sorts it
 * with the same controls as the set tables and shows the matches a hundred at a time.
 */
import { isLocale } from '../config/site';
import { type CatalogCard, type CatalogFile, decodeCatalog } from '../lib/cards/catalog';
import { type CardType, compareCards, normalizeForSearch, type SortKey } from '../lib/cards/sort';
import { createFormatters } from '../lib/format';
import { setPath } from '../lib/links';
import { colorPips, manaSymbols, symbolUrl } from '../lib/mana';
import { cardFilter, connectControls, connectPreview, type Controls } from './card-controls';

/** Rows added per step; the next step loads when the end of the list comes near. */
const STEP = 100;

/** Texts from the page, so the script needs no dictionary of its own. */
interface Labels {
  readonly types: Readonly<Record<CardType, string>>;
  readonly banned: string;
  readonly scryfall: string;
  readonly loading: string;
  readonly error: string;
  readonly more: string;
}

interface Row extends CatalogCard {
  readonly search: string;
  element?: HTMLTableRowElement;
}

export async function initAllCards(): Promise<void> {
  const root = document.querySelector<HTMLElement>('[data-all-cards]');
  const body = root?.querySelector('tbody');
  const status = root?.querySelector<HTMLElement>('[data-status]');
  const empty = root?.querySelector<HTMLElement>('[data-empty]');
  const more = root?.querySelector<HTMLButtonElement>('[data-more]');
  if (!root || !body || !status || !empty || !more || !root.dataset.src) return;

  const locale = isLocale(root.dataset.locale) ? root.dataset.locale : 'de';
  const labels = JSON.parse(root.dataset.labels ?? '{}') as Labels;
  const format = createFormatters(locale);
  const numbers = new Intl.NumberFormat(document.documentElement.lang || undefined);

  status.textContent = labels.loading;
  status.hidden = false;
  let file: CatalogFile;
  try {
    const response = await fetch(root.dataset.src);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    file = (await response.json()) as CatalogFile;
  } catch {
    status.textContent = labels.error;
    return;
  }
  status.hidden = true;

  const rows: Row[] = decodeCatalog(file).map((card) => ({
    ...card,
    search: normalizeForSearch(`${card.name}\n${card.altName}`),
  }));
  // Sorting 30,000 cards takes a moment, filtering hardly any: each order is sorted once.
  const orders = new Map<SortKey, Row[]>();
  const sortedBy = (key: SortKey) => {
    let order = orders.get(key);
    if (!order) {
      order = rows.toSorted((a, b) => compareCards(a, b, key));
      orders.set(key, order);
    }
    return order;
  };

  const createRow = (card: Row): HTMLTableRowElement => {
    const row = document.createElement('tr');
    row.dataset.name = card.name;
    row.dataset.image = card.imageNormal ?? '';
    row.dataset.label = `${card.name} · ${format.price(card.price)}`;

    const head = element('th');
    head.scope = 'row';
    const link = element('a', '', card.name);
    link.href = card.scryfallUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.title = labels.scryfall;
    head.append(pips(card.colors), link);
    if (card.banned) head.append(element('span', 'pill pill--hot banned', labels.banned));

    const set = element('a', 'mono', card.setCode.toUpperCase());
    set.href = setPath(locale, card.setCode);
    set.title = file.sets[card.setCode] ?? '';

    row.append(
      head,
      element('td', 'type', labels.types[card.type]),
      element('td', 'mana', manaCost(card.manaCost)),
      element('td', 'set', set),
      element('td', 'num mono', format.price(card.price)),
    );
    return row;
  };

  let visible: Row[] = [];
  let shown = 0;
  const showMore = () => {
    const next = visible.slice(shown, shown + STEP);
    body.append(...next.map((row) => (row.element ??= createRow(row))));
    shown += next.length;
    const left = visible.length - shown;
    more.hidden = left <= 0;
    more.textContent = labels.more.replace('{count}', numbers.format(Math.min(STEP, left)));
  };

  let controls: Controls | null = null;
  const render = () => {
    if (!controls) return;
    visible = sortedBy(controls.state.sort).filter(cardFilter(controls.state));
    shown = 0;
    body.replaceChildren();
    showMore();
    empty.hidden = visible.length > 0;
    controls.update(visible.length);
  };
  controls = connectControls(root, render);
  if (!controls) return;
  render();

  connectPreview(body, document);
  more.addEventListener('click', showMore);
  new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) showMore();
    },
    { rootMargin: '0px 0px 800px' },
  ).observe(more);
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  content: string | Node = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(content);
  return node;
}

/** Same markup as components/ui/ColorPips.astro. */
function pips(colors: string): HTMLElement {
  const span = element('span', 'pips');
  span.setAttribute('aria-hidden', 'true');
  span.append(...colorPips(colors).map((color) => symbol(color, 13)));
  return span;
}

/** Same markup as components/ui/ManaCost.astro. */
function manaCost(cost: string): Node {
  const symbols = manaSymbols(cost);
  if (symbols.length === 0) return document.createTextNode('');
  const span = element('span', 'mana-cost');
  span.setAttribute('role', 'img');
  span.setAttribute('aria-label', cost.split(' // ')[0] ?? cost);
  span.append(...symbols.map((name) => symbol(name, 15)));
  return span;
}

function symbol(name: string, size: number): HTMLImageElement {
  const image = document.createElement('img');
  image.src = symbolUrl(name);
  image.alt = '';
  image.width = size;
  image.height = size;
  image.loading = 'lazy';
  image.decoding = 'async';
  return image;
}
