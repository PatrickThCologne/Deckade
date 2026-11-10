/** Site-wide settings. The site name lives here and nowhere else. */

/** The logo shows the second part in gold: a deck that is also a decade. */
export const SITE_NAME_PARTS = ['Deck', 'ade'] as const;
export const SITE_NAME = SITE_NAME_PARTS.join('');

/** The public repository: source code and the issue tracker the feedback form can open. */
export const SOURCE_REPO = 'https://github.com/PatrickThCologne/Deckade';

export const LOCALES = ['de', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
// The root address forwards here, and so does the 404 page's language and the x-default link
export const DEFAULT_LOCALE: Locale = 'en';

/** BCP 47 tags used for number and date formatting and for hreflang. */
export const LOCALE_TAGS: Record<Locale, string> = {
  de: 'de-DE',
  en: 'en-GB',
};

export const LOCALE_NAMES: Record<Locale, string> = {
  de: 'Deutsch',
  en: 'English',
};

export function isLocale(value: string | undefined): value is Locale {
  return (LOCALES as readonly string[]).includes(value ?? '');
}
