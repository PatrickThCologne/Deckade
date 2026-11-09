/** Site-wide settings. The site name lives here and nowhere else. */

/** The logo shows the second part in gold: a deck that is also a decade. */
export const SITE_NAME_PARTS = ['Deck', 'ade'] as const;
export const SITE_NAME = SITE_NAME_PARTS.join('');

export const LOCALES = ['de', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'de';

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
