import sitemap from '@astrojs/sitemap';
import { defineConfig, envField, fontProviders } from 'astro/config';

import { DEFAULT_LOCALE, LOCALE_TAGS, LOCALES } from './src/config/site';

// SITE_URL and BASE_PATH are set by the deployment (e.g. GitHub Pages under /rotation-radar/).
export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  base: process.env.BASE_PATH ?? '/',
  trailingSlash: 'always',
  // Who runs the site, for the imprint and the privacy notice. Set by the deployment, so
  // personal data stays out of the repository; locally a web/.env file works.
  env: {
    schema: {
      OPERATOR_NAME: envField.string({ context: 'server', access: 'public', optional: true }),
      OPERATOR_ADDRESS: envField.string({ context: 'server', access: 'public', optional: true }),
      OPERATOR_EMAIL: envField.string({ context: 'server', access: 'public', optional: true }),
    },
  },
  i18n: {
    locales: [...LOCALES],
    defaultLocale: DEFAULT_LOCALE,
    // The root page (src/pages/index.astro) forwards to the default language itself.
    routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
  },
  fonts: [
    { provider: fontProviders.fontsource(), name: 'IBM Plex Sans', cssVariable: '--font-sans' },
    { provider: fontProviders.fontsource(), name: 'Marcellus', cssVariable: '--font-display' },
    { provider: fontProviders.fontsource(), name: 'IBM Plex Mono', cssVariable: '--font-mono' },
  ],
  integrations: [sitemap({ i18n: { defaultLocale: DEFAULT_LOCALE, locales: { ...LOCALE_TAGS } } })],
});
