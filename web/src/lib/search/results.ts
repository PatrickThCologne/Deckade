/**
 * What the search tab finds for a request, and in which order: the request read as filters
 * (lib/search/query.ts) or as a card name, the card of an exact name pinned on top, and the
 * order. Pure, so the tests can run it on a card list of their own; the search tab
 * (scripts/card-search.ts) only loads the list and shows the result.
 */
import {
  compareCards,
  normalizeForSearch,
  searchWords,
  type SortableCard,
  type SortKey,
} from '../cards/sort';
import {
  exactNameMatch,
  nameQuery,
  nameRank,
  nameWins,
  parseQuery,
  queryMatcher,
  type SearchableCard,
  type SearchSet,
  understood,
} from './query';

/** A card of the search: what the filters look at and what the orders compare. */
export interface ResultCard extends SearchableCard, SortableCard {
  /** The names of the card, normalized: shown and other language, and each face of "A // B". */
  readonly names: readonly string[];
}

/**
 * The loaded card list, with the sets ("aus Reality Fracture") and creature types ("Elfen") a
 * request may name.
 */
export interface SearchCatalog<Card extends ResultCard> {
  readonly cards: readonly Card[];
  /** Every name of every card (ResultCard.names): a request that is one may be a name search. */
  readonly names: ReadonlySet<string>;
  readonly sets: readonly SearchSet[];
  /** The creature types of the cards, lower case. */
  readonly creatureTypes: readonly string[];
}

/**
 * The cards for `request`, in the order they are shown; nothing for an empty request.
 *
 * A card name is searched as a name where words are left that no filter reads ("Control
 * Magic", "Wall of Omens"); a name search puts the card of that name first, then names that
 * start with it, and the face of a card with two counts as its name ("Fire" for "Fire // Ice").
 * Where all of a full card name reads as filters ("Flash", "Wrath of God" with the creature
 * type God) the filters are searched and every card of that name comes first, whether the
 * filters find it or not. So does a face of more than one word, such as the back of a
 * double-faced card ("Green Goblin" of Norman Osborn // Green Goblin). A face of one word is a
 * single filter word here and no full name: "Burn" is burn, not Turn // Burn.
 *
 * `chosen` is the order picked on the page; it replaces the name ranking. Without it the
 * results follow the order the request names ("günstig"), otherwise the play rate.
 */
export function searchResults<Card extends ResultCard>(
  request: string,
  catalog: SearchCatalog<Card>,
  chosen: SortKey | null = null,
): Card[] {
  if (!request.trim()) return [];
  const parsed = parseQuery(request, catalog.sets, catalog.creatureTypes);
  const asName = nameWins(parsed, request, catalog.names);
  const query = asName ? nameQuery(request) : parsed;
  const key = chosen ?? query.sort ?? 'played';
  const rank =
    chosen || understood(query)
      ? () => 0
      : (card: Card) => nameRank(card.names.join('\n'), query.unknown);
  const order = (a: Card, b: Card) => rank(a) - rank(b) || compareCards(a, b, key);
  const matches = catalog.cards.filter(queryMatcher(query)).sort(order);
  if (asName || !exactNameMatch(request, catalog.names)) return matches;

  // `search` holds the full names, one per line, without the faces; `names` has the faces too
  const name = normalizeForSearch(request);
  const face = searchWords(request).length > 1;
  const own = catalog.cards
    .filter((card) => card.search.split('\n').includes(name) || (face && card.names.includes(name)))
    .sort(order);
  return [...own, ...matches.filter((card) => !own.includes(card))];
}
