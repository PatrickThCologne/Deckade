/**
 * Progressive enhancement for the card table of a set: the server-rendered table is complete
 * and usable without JavaScript; this adds search, colour, type and mana value filters,
 * sorting and the large card preview next to the table.
 */
import { type CardType, compareCards, isCardType, type SortableCard } from '../lib/cards/sort';
import {
  cardFilter,
  connectControls,
  connectPreview,
  type Controls,
  type FilterableCard,
} from './card-controls';

interface Row extends SortableCard, FilterableCard {
  readonly element: HTMLTableRowElement;
  readonly types: readonly CardType[];
}

export function initCardTables(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-card-table]').forEach(enhance);
}

function enhance(root: HTMLElement): void {
  if (root.dataset.enhanced) return;
  root.dataset.enhanced = 'true';

  const body = root.querySelector('tbody');
  const empty = root.querySelector<HTMLElement>('[data-empty]');
  if (!body || !empty) return;

  const rows = [...body.rows].map(readRow);
  let controls: Controls | null = null;
  // Every change goes through here: the buttons show the state, then the table follows it.
  const render = () => {
    if (!controls) return;
    const { state } = controls;
    const visible = rows
      .filter(cardFilter(state))
      .toSorted((a, b) => compareCards(a, b, state.sort));
    body.replaceChildren(...visible.map((row) => row.element));
    empty.hidden = visible.length > 0;
    controls.update(visible.length);
  };
  controls = connectControls(root, render);
  if (!controls) return;

  connectPreview(body, root.closest('[data-set-view]') ?? document);
}

function readRow(element: HTMLTableRowElement): Row {
  const data = element.dataset;
  const number = (value: string | undefined) => (value ? Number(value) : null);
  return {
    element,
    name: data.name ?? '',
    colors: data.colors ?? '',
    cmc: Number(data.cmc ?? 0),
    price: number(data.price),
    playShare: number(data.share),
    isLand: data.land === '1',
    type: isCardType(data.type) ? data.type : 'other',
    types: (data.types ?? '').split(' ').filter(isCardType),
    search: data.search ?? '',
  };
}
