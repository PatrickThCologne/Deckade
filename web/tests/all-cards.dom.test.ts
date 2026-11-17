// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARD_TYPES, SORT_KEYS } from '../src/lib/cards/sort';
import { createFormatters } from '../src/lib/format';
import { setPath } from '../src/lib/links';
import { initAllCards } from '../src/scripts/all-cards';
import { astroMarkup, catalogCard, catalogFile, jsonResponse, serveCatalog } from './catalog-file';

const SRC = '/en/cards.json';
const LABELS = {
  types: Object.fromEntries(CARD_TYPES.map((type) => [type, `T:${type}`])),
  banned: 'Banned',
  scryfall: 'Open on Scryfall',
  loading: 'Loading cards …',
  error: 'The card list could not be loaded.',
  more: 'Show {count} more cards',
};
const price = createFormatters('en').price;

const creature = { type: 'creature', types: ['creature'] } as const;
const WRATH = catalogCard('Wrath of God', {
  colors: 'W',
  manaCost: '{2}{W}{W}',
  cmc: 4,
  type: 'sorcery',
  types: ['sorcery'],
  price: 8,
  imageNormal: 'https://cards.scryfall.io/normal/front/a/a/aa11-22.jpg?1',
});
const ANGEL = catalogCard('Serra Angel', {
  ...creature,
  colors: 'W',
  cmc: 5,
  price: 3,
  imageNormal: 'https://cards.scryfall.io/normal/front/b/b/bb11-22.jpg?1',
});
const BOLT = catalogCard('Lightning Bolt', {
  price: 1.5,
  setCode: 'm10',
  printedIn: ['m10', 'fdn'],
});
const BEAST = catalogCard('Banned Beast', { ...creature, colors: 'G', cmc: 3, banned: true });
const ISLAND = catalogCard('Island', {
  colors: '',
  manaCost: '',
  cmc: 0,
  type: 'land',
  types: ['land'],
  isLand: true,
  price: null,
});
// Cheap colourless fillers, so the list has more than one step of 100 rows
const FILLERS = Array.from({ length: 120 }, (_, i) =>
  catalogCard(`Filler ${String(i + 1).padStart(3, '0')}`, {
    colors: '',
    manaCost: '{2}',
    cmc: 2,
    type: 'artifact',
    types: ['artifact'],
    price: 0.05,
  }),
);
const CARDS = [ISLAND, ...FILLERS, BEAST, BOLT, ANGEL, WRATH];
const TOTAL = CARDS.length;
const FILE = catalogFile(CARDS, { fdn: 'Foundations', m10: 'Magic 2010' });

/** The "All cards" markup (pages/[lang]/cards.astro with components/set/CardControls.astro). */
function renderPage(): void {
  document.documentElement.lang = 'en';
  const chip = (attribute: string, value: string, name: string) =>
    `<button type="button" aria-pressed="false" ${attribute}="${value}"><span class="name">${name}</span></button>`;
  document.body.innerHTML = `
    <section data-all-cards data-locale="en" data-src="${SRC}">
      <output data-count data-template="{shown} of ${TOTAL} cards" hidden></output>
      <select data-sort>
        ${SORT_KEYS.map((key) => `<option value="${key}"${key === 'value-desc' ? ' selected' : ''}>${key}</option>`).join('')}
      </select>
      <input type="search" data-search />
      <details data-type-menu>
        <summary><span data-type-label data-all="All types" data-many="{count} types">All types</span></summary>
        <button type="button" aria-pressed="true" data-type-all><span class="name">All types</span></button>
        ${chip('data-type-option', 'creature', 'Creature')}
        ${chip('data-type-option', 'sorcery', 'Sorcery')}
      </details>
      <details data-set-menu>
        <summary><span data-set-label data-all="All sets" data-many="{count} sets">All sets</span></summary>
        <button type="button" aria-pressed="true" data-set-all><span class="name">All sets</span></button>
        ${chip('data-set-option', 'fdn', 'Foundations')}
        ${chip('data-set-option', 'm10', 'Magic 2010')}
      </details>
      ${['W', 'U', 'B', 'R', 'G'].map((c) => `<button type="button" aria-pressed="false" data-color="${c}"></button>`).join('')}
      ${['0', '1', '2', '3', '4', '5', '6', '7+'].map((v) => `<button type="button" aria-pressed="false" data-mana="${v}">${v}</button>`).join('')}
      <div data-result hidden><button type="button" data-reset>Reset</button></div>
      <table><tbody></tbody></table>
      <div role="status" aria-live="polite"><p data-status hidden></p></div>
      <p data-empty hidden>No card matches.</p>
      <button type="button" data-more hidden></button>
    </section>
    <aside>
      <img data-preview-image alt="" hidden />
      <figcaption data-preview-caption></figcaption>
    </aside>`;
  document.querySelector<HTMLElement>('[data-all-cards]')!.dataset.labels = JSON.stringify(LABELS);
}

/** jsdom has no IntersectionObserver; this one lets a test say the "more" button came near. */
class FakeObserver {
  static last: FakeObserver | undefined;
  readonly observed: Element[] = [];
  constructor(readonly callback: (entries: Partial<IntersectionObserverEntry>[]) => void) {
    FakeObserver.last = this;
  }
  observe(target: Element) {
    this.observed.push(target);
  }
  disconnect() {}
  unobserve() {}
}

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const rows = () => [...document.querySelectorAll<HTMLTableRowElement>('tbody tr')];
const names = () => rows().map((row) => row.dataset.name);
const status = () => $('[data-status]');
const count = () => $('[data-count]');
const more = () => $<HTMLButtonElement>('[data-more]');
const empty = () => $('[data-empty]');
const click = (selector: string) => $<HTMLButtonElement>(selector).click();
const search = (text: string) => {
  const input = $<HTMLInputElement>('[data-search]');
  input.value = text;
  input.dispatchEvent(new Event('input'));
};
const sortBy = (key: string) => {
  const select = $<HTMLSelectElement>('[data-sort]');
  select.value = key;
  select.dispatchEvent(new Event('change'));
};

beforeEach(() => {
  FakeObserver.last = undefined;
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  renderPage();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('initAllCards: loading', () => {
  it('shows the loading text until the list is there', async () => {
    const response = Promise.withResolvers<Response>();
    const fetch = vi.fn(() => response.promise);
    vi.stubGlobal('fetch', fetch);
    const done = initAllCards();
    expect(fetch).toHaveBeenCalledWith(SRC);
    expect(status().hidden).toBe(false);
    expect(status().textContent).toBe(LABELS.loading);

    response.resolve(jsonResponse(FILE));
    await done;
    expect(status().hidden).toBe(true);
    expect(names()).toHaveLength(100);
  });

  it('shows the error when the server answers with an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(null, 404)),
    );
    await initAllCards();
    expect(status().hidden).toBe(false);
    expect(status().textContent).toBe(LABELS.error);
    expect(names()).toEqual([]);
    expect(more().hidden).toBe(true);
  });

  it('shows the error when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    await initAllCards();
    expect(status().textContent).toBe(LABELS.error);
  });

  it('does nothing on a page without the list', async () => {
    const fetch = serveCatalog(FILE);
    document.body.innerHTML = '<main></main>';
    await expect(initAllCards()).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('initAllCards: rows', () => {
  beforeEach(async () => {
    serveCatalog(FILE);
    await initAllCards();
  });

  const row = (name: string) => rows().find((tr) => tr.dataset.name === name)!;

  it('starts in the order the page selected, unknown prices last', () => {
    expect(names().slice(0, 4)).toEqual([
      'Wrath of God',
      'Serra Angel',
      'Lightning Bolt',
      'Banned Beast',
    ]);
  });

  it('links the card name to Scryfall in a row header', () => {
    const head = row('Lightning Bolt').querySelector('th')!;
    expect(head.scope).toBe('row');
    const link = head.querySelector('a')!;
    expect(link.textContent).toBe('Lightning Bolt');
    expect(link.href).toBe(BOLT.scryfallUrl);
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener');
    expect(link.title).toBe(LABELS.scryfall);
  });

  it('marks banned cards', () => {
    expect(row('Banned Beast').querySelector('.banned')?.textContent).toBe(LABELS.banned);
    expect(row('Lightning Bolt').querySelector('.banned')).toBeNull();
  });

  it('shows type, mana cost, set and price', () => {
    const bolt = row('Lightning Bolt');
    expect(bolt.querySelector('.type')?.textContent).toBe('T:instant');
    expect(bolt.querySelector('.mana .mana-cost')?.getAttribute('aria-label')).toBe('{R}');
    const set = bolt.querySelector<HTMLAnchorElement>('.set a')!;
    expect(set.textContent).toBe('M10');
    expect(set.getAttribute('href')).toBe(setPath('en', 'm10'));
    expect(set.title).toBe('Magic 2010');
    expect(bolt.querySelector('.num')?.textContent).toBe(price(1.5));
  });

  it('leaves the mana cell empty for a card without cost', () => {
    more().click(); // the Island has no price, so it comes last
    expect(row('Island').querySelector('.mana')?.textContent).toBe('');
    expect(row('Island').querySelector('.mana-cost')).toBeNull();
  });

  it('shows the first card in the preview, and the card under the pointer after', () => {
    const image = $<HTMLImageElement>('[data-preview-image]');
    expect(image.hidden).toBe(false);
    expect(image.src).toBe(WRATH.imageNormal);
    expect($('[data-preview-caption]').textContent).toBe(`Wrath of God · ${price(8)}`);

    row('Serra Angel')
      .querySelector('a')!
      .dispatchEvent(new Event('pointerover', { bubbles: true }));
    expect(image.src).toBe(ANGEL.imageNormal);
    expect(image.alt).toBe('Serra Angel');
  });
});

describe('initAllCards: paging', () => {
  beforeEach(async () => {
    serveCatalog(FILE);
    await initAllCards();
  });

  it('shows 100 rows at first and says how many come next', () => {
    expect(names()).toHaveLength(100);
    expect(more().hidden).toBe(false);
    expect(more().textContent).toBe(`Show ${TOTAL - 100} more cards`);
  });

  it('adds the rest on a click and hides the button at the end', () => {
    more().click();
    expect(names()).toHaveLength(TOTAL);
    expect(new Set(names()).size).toBe(TOTAL);
    expect(more().hidden).toBe(true);
  });

  it('adds the next step when the button comes near the viewport', () => {
    const observer = FakeObserver.last!;
    expect(observer.observed).toEqual([more()]);
    observer.callback([{ isIntersecting: false }]);
    expect(names()).toHaveLength(100);
    observer.callback([{ isIntersecting: true }]);
    expect(names()).toHaveLength(TOTAL);
  });

  it('starts again at the first step when the filters change', () => {
    more().click();
    search('filler');
    expect(names()).toHaveLength(100);
    expect(more().textContent).toBe('Show 20 more cards');
  });
});

describe('initAllCards: filters and count', () => {
  beforeEach(async () => {
    serveCatalog(FILE);
    await initAllCards();
  });

  it('shows no count while nothing is filtered', () => {
    expect(count().hidden).toBe(true);
    expect($('[data-result]').hidden).toBe(true);
  });

  it('finds cards by the words of their name and counts them', () => {
    search('BOLT light');
    expect(names()).toEqual(['Lightning Bolt']);
    expect(count().hidden).toBe(false);
    expect(count().textContent).toBe(`1 of ${TOTAL} cards`);
    expect($('[data-result]').hidden).toBe(false);
  });

  it('shows the empty message when nothing matches, and hides it again', () => {
    search('qqqxxx');
    expect(names()).toEqual([]);
    expect(empty().hidden).toBe(false);
    expect(count().textContent).toBe(`0 of ${TOTAL} cards`);
    expect(more().hidden).toBe(true);

    search('bolt');
    expect(empty().hidden).toBe(true);
  });

  it('filters by colour: every colour of the card has to be selected', () => {
    click('[data-color="W"]');
    expect(names()).toEqual(['Wrath of God', 'Serra Angel']);
    expect($('[data-color="W"]').getAttribute('aria-pressed')).toBe('true');

    click('[data-color="W"]');
    expect(names()).toHaveLength(100);
    expect($('[data-color="W"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('filters by mana value, without lands', () => {
    click('[data-mana="0"]');
    expect(names()).toEqual([]);
    click('[data-mana="5"]');
    expect(names()).toEqual(['Serra Angel']);
    expect($('[data-mana="5"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('filters by type in the type menu and names the choice', () => {
    click('[data-type-option="creature"]');
    expect(names()).toEqual(['Serra Angel', 'Banned Beast']);
    expect($('[data-type-label]').textContent).toBe('Creature');
    expect($('[data-type-menu]').hasAttribute('data-active')).toBe(true);
    expect($('[data-type-all]').getAttribute('aria-pressed')).toBe('false');

    click('[data-type-option="sorcery"]');
    expect(names()).toEqual(['Wrath of God', 'Serra Angel', 'Banned Beast']);
    expect($('[data-type-label]').textContent).toBe('2 types');

    click('[data-type-all]');
    expect(names()).toHaveLength(100);
    expect($('[data-type-label]').textContent).toBe('All types');
    expect($('[data-type-menu]').hasAttribute('data-active')).toBe(false);
  });

  it('filters by set: any set that printed the card counts', () => {
    click('[data-set-option="m10"]');
    expect(names()).toEqual(['Lightning Bolt']);
    expect(count().textContent).toBe(`1 of ${TOTAL} cards`);
    expect($('[data-set-label]').textContent).toBe('Magic 2010');
  });

  it('combines the filters', () => {
    click('[data-color="W"]');
    click('[data-type-option="creature"]');
    expect(names()).toEqual(['Serra Angel']);
  });

  it('clears every filter and the search with the reset button', () => {
    search('serra');
    click('[data-color="W"]');
    click('[data-mana="5"]');
    click('[data-type-option="creature"]');
    click('[data-set-option="fdn"]');
    expect(names()).toEqual(['Serra Angel']);

    click('[data-reset]');
    expect($<HTMLInputElement>('[data-search]').value).toBe('');
    expect(names()).toHaveLength(100);
    expect(count().hidden).toBe(true);
    expect($('[data-result]').hidden).toBe(true);
    expect(document.activeElement).toBe($('[data-search]'));
    for (const pressed of document.querySelectorAll('[data-color], [data-mana]')) {
      expect(pressed.getAttribute('aria-pressed')).toBe('false');
    }
  });
});

describe('initAllCards: sorting', () => {
  beforeEach(async () => {
    serveCatalog(FILE);
    await initAllCards();
  });

  it('sorts by the chosen order', () => {
    sortBy('name');
    expect(names().slice(0, 3)).toEqual(['Banned Beast', 'Filler 001', 'Filler 002']);

    sortBy('mana-desc');
    expect(names().slice(0, 2)).toEqual(['Serra Angel', 'Wrath of God']);
  });

  it('keeps the filters when the order changes', () => {
    click('[data-color="W"]');
    sortBy('value-asc');
    expect(names()).toEqual(['Serra Angel', 'Wrath of God']);
  });

  it('puts lands last when sorting by mana value', () => {
    sortBy('mana-asc');
    more().click();
    expect(names().at(-1)).toBe('Island');
    expect(names()[0]).toBe('Lightning Bolt');
  });
});

describe('cards.astro markup', () => {
  it('puts the status into a polite live region that is always there', () => {
    const status = astroMarkup('pages/[lang]/cards.astro').querySelector('[data-status]');
    const region = status?.closest('[role="status"]');
    expect(region?.getAttribute('aria-live')).toBe('polite');
    expect(region?.hasAttribute('hidden')).toBe(false);
  });

  it('has every element the script looks for', () => {
    const root = astroMarkup('pages/[lang]/cards.astro').querySelector('[data-all-cards]');
    for (const attribute of ['data-src', 'data-labels', 'data-locale']) {
      expect(root?.hasAttribute(attribute), attribute).toBe(true);
    }
    for (const selector of ['tbody', '[data-status]', '[data-empty]', '[data-more]']) {
      expect(root?.querySelector(selector), selector).not.toBeNull();
    }
  });

  it('shows the count of matches in an output element, which screen readers announce', () => {
    const controls = astroMarkup('components/set/CardControls.astro');
    expect(controls.querySelector('[data-count]')?.tagName).toBe('OUTPUT');
    for (const selector of ['[data-search]', '[data-sort]', '[data-result]', '[data-reset]']) {
      expect(controls.querySelector(selector), selector).not.toBeNull();
    }
  });
});
