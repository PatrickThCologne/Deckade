import { describe, expect, it } from 'vitest';
import { LOCALES } from '../src/config/site';
import { SEARCH_EXAMPLES } from '../src/lib/search/examples';
import { parseQuery, understood } from '../src/lib/search/query';
import OVERVIEW_SETS from './fixtures/overview-sets.json';

describe('search examples', () => {
  it('has the same number of examples in every language', () => {
    const counts = LOCALES.map((locale) => SEARCH_EXAMPLES[locale].length);
    expect(new Set(counts).size).toBe(1);
  });

  it.each(LOCALES.flatMap((locale) => SEARCH_EXAMPLES[locale].map((example) => [locale, example])))(
    'understands the %s example "%s" without leftover words',
    (_locale, example) => {
      const query = parseQuery(example, OVERVIEW_SETS);
      expect(understood(query)).toBe(true);
      expect(query.unknown).toEqual([]);
    },
  );

  it('reads the set example as a set', () => {
    expect(parseQuery(SEARCH_EXAMPLES.de[2]!, OVERVIEW_SETS).sets).toEqual(['blb']);
    expect(parseQuery(SEARCH_EXAMPLES.en[2]!, OVERVIEW_SETS).sets).toEqual(['blb']);
  });
});
