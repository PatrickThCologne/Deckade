import { expect, test } from '@playwright/test';

// The built site from the contract snapshot (tests/contract): sets zzz, dsk and tsb; dsk has
// the cards "Translated Creature" (green, German "Übersetzte Kreatur") and "Plain Land".

const errorsOf = (page: import('@playwright/test').Page) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
};

for (const path of [
  '/en/',
  '/de/',
  '/en/cards/',
  '/en/rotation/',
  '/en/search/',
  '/en/sets/dsk/',
]) {
  test(`${path} loads without script errors`, async ({ page }) => {
    const errors = errorsOf(page);
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1').first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('a search finds the card and keeps the request in the address', async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto('/en/search/');
  await page.getByRole('searchbox').fill('green creatures');
  await page.getByRole('searchbox').press('Enter');

  await expect(page.locator('[data-results] li')).toHaveCount(1);
  await expect(page.locator('[data-results]')).toContainText('Translated Creature');
  await expect(page.getByRole('status')).not.toBeEmpty();
  expect(new URL(page.url()).searchParams.get('q')).toBe('green creatures');
  expect(errors).toEqual([]);
});

test('a shared search link shows its results', async ({ page }) => {
  await page.goto('/de/search/?q=Kreaturen');
  await expect(page.locator('[data-results]')).toContainText('Übersetzte Kreatur');
});

for (const [locale, target] of [
  ['de-DE', '/de/'],
  ['en-US', '/en/'],
  ['fr-FR', '/en/'],
] as const) {
  test.describe(`a browser in ${locale}`, () => {
    test.use({ locale });
    test(`is forwarded from the root page to ${target}`, async ({ page }) => {
      await page.goto('/');
      await expect(page).toHaveURL(new RegExp(`${target}$`));
    });
  });
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });
  test('a set opens with its facts and cards, without the pack', async ({ page }) => {
    await page.goto('/en/');
    await page.locator('a[data-set-link="dsk"]').click();
    const overlay = page.locator('dialog.set-overlay');
    await expect(overlay.locator('h1')).toBeVisible();
    await expect(overlay.locator('[data-pack-image]')).toBeHidden();
    await expect(page).toHaveURL(/\/en\/sets\/dsk\/$/);
  });
});
