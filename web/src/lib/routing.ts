import { isLocale, type Locale, LOCALES } from '../config/site';

/** getStaticPaths entries for every language. */
export function localePaths(): { params: { lang: Locale } }[] {
  return LOCALES.map((lang) => ({ params: { lang } }));
}

export function localeFrom(param: string | undefined): Locale {
  if (!isLocale(param)) throw new Error(`Unknown locale "${param}"`);
  return param;
}
