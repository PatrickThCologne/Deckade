import { LOCALE_TAGS, type Locale } from '../../config/site';
import { de, type UiKey } from './de';
import { en } from './en';

export type { UiKey };
export type Params = Readonly<Record<string, string | number>>;

const dictionaries: Record<Locale, Record<UiKey, string>> = { de, en };

/** Keys that come as a '.one' / '.other' pair, e.g. 'count.cards'. */
export type PluralKey = {
  [K in UiKey]: K extends `${infer Base}.one` ? Base : never;
}[UiKey];

export function translate(locale: Locale, key: UiKey, params?: Params): string {
  const template = dictionaries[locale][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in params ? String(params[name]) : placeholder,
  );
}

export function useTranslations(locale: Locale) {
  const pluralRules = new Intl.PluralRules(LOCALE_TAGS[locale]);
  const numbers = new Intl.NumberFormat(LOCALE_TAGS[locale]);
  return {
    t: (key: UiKey, params?: Params) => translate(locale, key, params),
    plural: (key: PluralKey, count: number) => {
      const form = pluralRules.select(count) === 'one' ? 'one' : 'other';
      return translate(locale, `${key}.${form}`, { count: numbers.format(count) });
    },
  };
}

export type Translator = ReturnType<typeof useTranslations>;
