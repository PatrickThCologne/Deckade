/** The card list of the "All cards" tab as a static JSON file, one per language. */
import type { APIRoute } from 'astro';

import { encodeCatalog } from '../../lib/cards/catalog';
import { cardCatalog, overviewSets } from '../../lib/data/load';
import { localeFrom, localePaths } from '../../lib/routing';

export const getStaticPaths = localePaths;

export const GET: APIRoute = ({ params }) => {
  const locale = localeFrom(params.lang);
  const sets = Object.fromEntries(overviewSets().map((set) => [set.code, set.name]));
  return new Response(JSON.stringify(encodeCatalog(cardCatalog(locale), sets)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
