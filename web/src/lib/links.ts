import { LOCALES, type Locale } from '../config/site';

/** Prefixes a site-relative path with the deployment base (e.g. '/rotation-radar/'). */
export function withBase(path: string, base: string = import.meta.env.BASE_URL): string {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return prefix + path.replace(/^\/+/, '');
}

/** Cardmarket's search for a product; its prices may only be shown there (docs/adr/0003). */
export function cardmarketSearch(locale: Locale, query: string): string {
  const search = encodeURIComponent(query.split(' // ')[0] ?? query);
  return `https://www.cardmarket.com/${locale}/Magic/Products/Search?searchString=${search}`;
}

export function localePath(locale: Locale, path = ''): string {
  const inner = path.replace(/^\/+|\/+$/g, '');
  return withBase(inner ? `${locale}/${inner}/` : `${locale}/`);
}

export function setPath(locale: Locale, setCode: string): string {
  return localePath(locale, `sets/${setCode}`);
}

/**
 * The same page in another language: swaps the locale segment after the base. Pages outside
 * the locale folders (the 404 page) exist only once, so they lead to the language's home page.
 */
export function switchLocale(
  pathname: string,
  target: Locale,
  base: string = import.meta.env.BASE_URL,
): string {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const path = decodeURI(pathname);
  const rest = path.startsWith(prefix) ? path.slice(prefix.length) : path.replace(/^\//, '');
  const [first, ...tail] = rest.split('/');
  const inner = (LOCALES as readonly string[]).includes(first ?? '') ? tail.join('/') : '';
  return prefix + `${target}/` + inner;
}

/** E-mail link with a prefilled subject and, if given, a prefilled text. */
export function mailto(address: string, subject: string, body?: string): string {
  const fields = [`subject=${encodeURIComponent(subject)}`];
  // RFC 6068: line breaks in the text are written as CRLF
  if (body) fields.push(`body=${encodeURIComponent(body.replace(/\r?\n/g, '\r\n'))}`);
  return `mailto:${address}?${fields.join('&')}`;
}
