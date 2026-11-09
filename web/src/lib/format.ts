import { LOCALE_TAGS, type Locale } from '../config/site';

/** 'YYYY-MM-DD' as a UTC date, so formatting never shifts it by a time zone. */
export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
}

export function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

/** Whole days from `from` to `to` (both ISO dates or timestamps). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / 86_400_000);
}

export function createFormatters(locale: Locale) {
  const tag = LOCALE_TAGS[locale];
  const euro = new Intl.NumberFormat(tag, { style: 'currency', currency: 'EUR' });
  const euroWhole = new Intl.NumberFormat(tag, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
  const percent = new Intl.NumberFormat(tag, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const integer = new Intl.NumberFormat(tag);
  const day = new Intl.DateTimeFormat(tag, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const monthYear = new Intl.DateTimeFormat(tag, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return {
    /** Euros with cents; whole euros from 100 € on, where cents are noise. */
    price: (value: number | null): string =>
      value == null ? '–' : (value >= 100 ? euroWhole : euro).format(value),
    /** A share given in percent points, e.g. 31.5 -> "31,5 %". */
    percent: (value: number | null): string => (value == null ? '–' : percent.format(value / 100)),
    integer: (value: number): string => integer.format(value),
    date: (iso: string): string => day.format(parseIsoDate(iso)),
    monthYear: (iso: string): string => monthYear.format(parseIsoDate(iso)),
  };
}

export type Formatters = ReturnType<typeof createFormatters>;
