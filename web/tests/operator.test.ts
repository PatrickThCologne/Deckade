/**
 * Who runs the site (imprint, privacy notice) comes from the deployment: OPERATOR_NAME,
 * OPERATOR_EMAIL and OPERATOR_ADDRESS. A production build without them must fail instead of
 * publishing a site without an imprint; locally the pages show a placeholder.
 */
import { describe, expect, it } from 'vitest';
import { operatorOrThrow } from '../src/lib/operator';

const COMPLETE = {
  OPERATOR_NAME: 'Erika Mustermann',
  OPERATOR_EMAIL: 'kontakt@example.com',
  OPERATOR_ADDRESS: 'Musterstraße 1, 12345 Musterstadt',
};

describe('operatorOrThrow', () => {
  it('returns the operator when everything is set', () => {
    expect(operatorOrThrow(COMPLETE, true)).toEqual({
      known: true,
      name: 'Erika Mustermann',
      email: 'kontakt@example.com',
      address: 'Musterstraße 1, 12345 Musterstadt',
    });
    expect(operatorOrThrow(COMPLETE, false).known).toBe(true);
  });

  it('fails a production build that misses a value and names every missing one', () => {
    const build = () => operatorOrThrow({ OPERATOR_EMAIL: COMPLETE.OPERATOR_EMAIL }, true);

    expect(build).toThrow(/OPERATOR_NAME/);
    expect(build).toThrow(/OPERATOR_ADDRESS/);
    expect(build).not.toThrow(/OPERATOR_EMAIL/);
  });

  it('fails a production build without any value', () => {
    const build = () => operatorOrThrow({}, true);

    for (const name of ['OPERATOR_NAME', 'OPERATOR_EMAIL', 'OPERATOR_ADDRESS']) {
      expect(build).toThrow(name);
    }
  });

  it('counts an empty or blank value as missing', () => {
    expect(() => operatorOrThrow({ ...COMPLETE, OPERATOR_NAME: '' }, true)).toThrow(
      /OPERATOR_NAME/,
    );
    expect(() => operatorOrThrow({ ...COMPLETE, OPERATOR_ADDRESS: '   ' }, true)).toThrow(
      /OPERATOR_ADDRESS/,
    );
  });

  it('trims the values', () => {
    const operator = operatorOrThrow({ ...COMPLETE, OPERATOR_NAME: '  Erika Mustermann \n' }, true);
    expect(operator.name).toBe('Erika Mustermann');
  });

  it('lets a local build without values show the placeholder', () => {
    expect(() => operatorOrThrow({}, false)).not.toThrow();
    expect(operatorOrThrow({}, false).known).toBe(false);
  });

  it('keeps the given values in a local build that misses some', () => {
    const operator = operatorOrThrow({ OPERATOR_EMAIL: COMPLETE.OPERATOR_EMAIL }, false);

    expect(operator.known).toBe(false);
    expect(operator.email).toBe('kontakt@example.com');
  });
});
