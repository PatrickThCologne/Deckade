import { defineConfig, devices } from '@playwright/test';

// Smoke tests in a real browser against the built site (`npm run build` first). CI builds it
// from the small contract snapshot (npm run fixture), so the tests know which cards exist.
// Locally Edge is used, so no browser has to be downloaded; CI installs Chromium.
const PORT = 4329;

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Desktop Chrome'],
    channel: process.env.CI ? undefined : 'msedge',
  },
  webServer: {
    command: `npx astro preview --port ${PORT}`,
    url: `http://localhost:${PORT}/en/`,
    reuseExistingServer: false,
  },
});
