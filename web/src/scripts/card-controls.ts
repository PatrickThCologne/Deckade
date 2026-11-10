/**
 * The controls above a card list (components/set/CardControls.astro): search, sort order,
 * colour, mana value, type and (on the "All cards" tab) set filters. They keep the selection; the list itself decides how
 * to show the matching cards (scripts/card-table.ts, scripts/all-cards.ts).
 */
import {
  type CardType,
  isCardType,
  isManaValue,
  isSortKey,
  type ManaValue,
  matchesColors,
  matchesManaValue,
  matchesSets,
  matchesType,
  matchesWords,
  searchWords,
  type SortableCard,
  type SortKey,
} from '../lib/cards/sort';
import { connectPressPreview } from './press-preview';

const COLOR_ORDER = 'WUBRG';

export interface FilterState {
  query: string;
  colors: Set<string>;
  types: Set<CardType>;
  mana: Set<ManaValue>;
  /** Set codes; only the "All cards" tab has the set filter. */
  sets: Set<string>;
  sort: SortKey;
}

/** What the filters look at. */
export interface FilterableCard extends Pick<SortableCard, 'colors' | 'cmc' | 'isLand'> {
  /** All main types on the card, for the type filter. */
  readonly types: readonly CardType[];
  /** Names (and on set pages rules text), already normalized. */
  readonly search: string;
  /** Every set that printed the card; only cards of the "All cards" tab know it. */
  readonly printedIn?: readonly string[];
}

export interface Controls {
  readonly state: FilterState;
  /** Shows the selection on the buttons and how many cards match. */
  update(shown: number): void;
}

/** The test for the current selection, prepared once per change rather than once per card. */
export function cardFilter(state: FilterState): (card: FilterableCard) => boolean {
  const colors = [...COLOR_ORDER].filter((c) => state.colors.has(c)).join('');
  const words = searchWords(state.query);
  return (card) =>
    matchesColors(card.colors, colors) &&
    matchesType(card.types, state.types) &&
    matchesSets(card.printedIn, state.sets) &&
    matchesManaValue(card, state.mana) &&
    matchesWords(card.search, words);
}

/** Connects the controls inside `root`; `onChange` runs after every change of the selection. */
export function connectControls(root: HTMLElement, onChange: () => void): Controls | null {
  const search = root.querySelector<HTMLInputElement>('[data-search]');
  const sort = root.querySelector<HTMLSelectElement>('[data-sort]');
  const result = root.querySelector<HTMLElement>('[data-result]');
  const count = root.querySelector<HTMLOutputElement>('[data-count]');
  const reset = root.querySelector<HTMLButtonElement>('[data-reset]');
  if (!search || !sort || !result || !count || !reset) return null;

  // The page decides the first sort (sets without play data start with market value).
  const state: FilterState = {
    query: '',
    colors: new Set(),
    types: new Set(),
    mana: new Set(),
    sets: new Set(),
    sort: isSortKey(sort.value) ? sort.value : 'played',
  };
  const colorButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-color]')];
  const manaButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-mana]')];
  const syncTypeMenu = connectChipMenu(root, 'type', state.types, isCardType, onChange);
  const syncSetMenu = connectChipMenu(root, 'set', state.sets, isPresent, onChange);
  const numbers = new Intl.NumberFormat(document.documentElement.lang || undefined);

  search.addEventListener('input', () => {
    state.query = search.value;
    onChange();
  });
  sort.addEventListener('change', () => {
    if (isSortKey(sort.value)) state.sort = sort.value;
    onChange();
  });
  for (const button of colorButtons) {
    button.addEventListener('click', () => {
      toggle(state.colors, button.dataset.color ?? '');
      onChange();
    });
  }
  for (const button of manaButtons) {
    button.addEventListener('click', () => {
      const value = button.dataset.mana;
      if (isManaValue(value)) toggle(state.mana, value);
      onChange();
    });
  }
  reset.addEventListener('click', () => {
    search.value = '';
    state.query = '';
    state.colors.clear();
    state.types.clear();
    state.mana.clear();
    state.sets.clear();
    onChange();
    search.focus(); // the reset button hides itself, so focus goes back to the start
  });

  return {
    state,
    update(shown) {
      for (const button of colorButtons) {
        press(button, state.colors.has(button.dataset.color ?? ''));
      }
      for (const button of manaButtons) {
        const value = button.dataset.mana;
        press(button, isManaValue(value) && state.mana.has(value));
      }
      syncTypeMenu();
      syncSetMenu();

      const selected = state.colors.size + state.types.size + state.mana.size + state.sets.size;
      const filtering = state.query.trim() !== '' || selected > 0;
      result.hidden = !filtering;
      count.textContent = (count.dataset.template ?? '').replace('{shown}', numbers.format(shown));
    },
  };
}

function press(button: HTMLButtonElement, pressed: boolean): void {
  button.setAttribute('aria-pressed', String(pressed));
}

function toggle<T>(selection: Set<T>, value: T): void {
  if (!selection.delete(value)) selection.add(value);
}

function isPresent(value: string | undefined): value is string {
  return Boolean(value);
}

/**
 * A drop-down menu of chips (types, sets): several can be picked, 'all' clears them. The markup
 * uses data-{kind}-menu, -label, -all and -option. Returns the function that shows the selection
 * (pressed chips, summary text); the menu closes on a click outside or Escape.
 */
function connectChipMenu<T extends string>(
  root: HTMLElement,
  kind: 'type' | 'set',
  selected: Set<T>,
  isValue: (value: string | undefined) => value is T,
  onChange: () => void,
): () => void {
  const menu = root.querySelector<HTMLDetailsElement>(`[data-${kind}-menu]`);
  const label = root.querySelector<HTMLElement>(`[data-${kind}-label]`);
  const all = root.querySelector<HTMLButtonElement>(`[data-${kind}-all]`);
  const options = [...root.querySelectorAll<HTMLButtonElement>(`[data-${kind}-option]`)];
  if (!menu || !label || !all) return () => {};
  const valueOf = (option: HTMLButtonElement) => option.getAttribute(`data-${kind}-option`) ?? '';

  for (const option of options) {
    option.addEventListener('click', () => {
      const value = valueOf(option);
      if (isValue(value)) toggle(selected, value);
      onChange();
    });
  }
  all.addEventListener('click', () => {
    selected.clear();
    onChange();
  });

  const closeOutside = (event: PointerEvent) => {
    if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
  };
  menu.addEventListener('toggle', () => {
    if (menu.open) document.addEventListener('pointerdown', closeOutside);
    else document.removeEventListener('pointerdown', closeOutside);
  });
  menu.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !menu.open) return;
    event.preventDefault(); // the first Escape only closes the menu, not the set overlay
    menu.open = false;
    menu.querySelector('summary')?.focus();
  });

  return () => {
    const pressed = options.filter((option) => {
      const value = valueOf(option);
      return isValue(value) && selected.has(value);
    });
    for (const option of options) press(option, pressed.includes(option));
    press(all, selected.size === 0);
    menu.toggleAttribute('data-active', selected.size > 0);
    label.textContent =
      pressed.length === 0
        ? (label.dataset.all ?? '')
        : pressed.length === 1
          ? (pressed[0]?.querySelector('.name')?.textContent ?? '')
          : (label.dataset.many ?? '').replace('{count}', String(pressed.length));
  };
}

/** The last hovered or focused card stays in the preview panel of the same view. */
export function connectPreview(body: HTMLTableSectionElement, scope: ParentNode): void {
  const image = scope.querySelector<HTMLImageElement>('[data-preview-image]');
  const caption = scope.querySelector<HTMLElement>('[data-preview-caption]');
  if (!image || !caption) return;
  let current: HTMLTableRowElement | null = null;

  const show = (row: HTMLTableRowElement | null) => {
    if (!row || row === current || !row.dataset.image) return;
    current?.classList.remove('is-previewed');
    row.classList.add('is-previewed');
    current = row;
    image.src = row.dataset.image;
    image.alt = row.dataset.name ?? '';
    image.hidden = false;
    caption.textContent = row.dataset.label ?? '';
  };

  const rowOf = (target: EventTarget | null) =>
    target instanceof Element ? target.closest<HTMLTableRowElement>('tr') : null;
  body.addEventListener('pointerover', (event) => show(rowOf(event.target)));
  body.addEventListener('focusin', (event) => show(rowOf(event.target)));
  show(body.rows[0] ?? null);
  connectPressPreview(body);
}
