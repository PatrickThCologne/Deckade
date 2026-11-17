/**
 * The example requests on the search page (pages/[lang]/search.astro), one click each. They are
 * kept here instead of in the page so a test can check that the parser understands every one of
 * them (tests/search-examples.test.ts): an example that silently stops working would teach
 * visitors the wrong thing.
 */
import type { Locale } from '../../config/site';

export const SEARCH_EXAMPLES: Readonly<Record<Locale, readonly string[]>> = {
  de: [
    'günstige rote Kreaturen mit Eile',
    'Azorius Flieger bis 3 Mana',
    'Kreaturen aus Bloomburrow',
    'grüne Karten zum Rampen',
    'beliebte grüne Karten unter 2 €',
    'farblose Artefakte',
    'grüne Kreaturen, Synergie mit Countern',
    'blauer Konter gegen Flieger',
    'schwarze Karte, die Fäulnis entfernt',
    'blauer Zauber, der mit Elementarwesen synergiert',
  ],
  en: [
    'cheap red creatures with haste',
    'Azorius flyers up to 3 mana',
    'creatures from Bloomburrow',
    'green ramp cards',
    'popular green cards under 2 €',
    'colourless artifacts',
    'green creatures, synergy with counters',
    'blue answer to flyers',
    'black card that removes blight',
    'blue spell that synergizes with Elementals',
  ],
};
