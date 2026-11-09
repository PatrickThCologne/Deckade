/** A card as the page language shows it: German pages use the German printing where one exists. */
import type { Locale } from '../../config/site';
import type { Card } from '../data/schema';

export interface ShownCard {
  readonly name: string;
  readonly imageNormal: string | null;
  readonly scryfallUrl: string;
}

export function shownCard(card: Card, locale: Locale): ShownCard {
  const de = locale === 'de' ? card.de : null;
  return {
    name: de?.name || card.name,
    imageNormal: de?.imageNormal ?? card.imageNormal,
    scryfallUrl: de?.scryfallUrl || card.scryfallUrl,
  };
}

/**
 * Everything the search looks through: name and rules text in English, on German pages
 * also the German ones, so "Flying" and "Fliegend" both work.
 */
export function searchText(card: Card, locale: Locale): string {
  const parts = [card.name, card.text];
  if (locale === 'de' && card.de) parts.push(card.de.name, card.de.text);
  return parts.join('\n');
}
