/**
 * Data contract with the pipeline: tests/contract holds files written by the pipeline's own
 * writer (pipeline/tests/test_contract.py keeps them current). If the pipeline changes what
 * it writes, that test fails until the files are regenerated; then this one shows whether
 * the website still understands them.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CardFileSchema, SnapshotSchema } from '../src/lib/data/schema';

const contract = new URL('./contract/', import.meta.url);

function read(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, contract), 'utf8'));
}

describe('data contract with the pipeline', () => {
  it('accepts the snapshot the pipeline writes', () => {
    const snapshot = SnapshotSchema.parse(read('snapshot.json'));

    expect(snapshot.sets.map((set) => set.code)).toEqual(['zzz', 'dsk', 'tsb']);
    expect(snapshot.sets[1]?.products[0]?.contents).toEqual([{ count: 30, kind: 'play' }]);
  });

  it('accepts every card file', () => {
    const files = readdirSync(new URL('cards/', contract));

    expect(files).toEqual(['dsk.json', 'tsb.json', 'zzz.json']);
    for (const file of files) {
      expect(() => CardFileSchema.parse(read(`cards/${file}`)), file).not.toThrow();
    }
    const cards = CardFileSchema.parse(read('cards/dsk.json')).cards;
    expect(cards.map((card) => card.de?.name ?? null)).toEqual(['Übersetzte Kreatur', null]);
  });
});
