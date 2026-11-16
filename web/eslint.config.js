// ESLint finds mistakes the type check lets through (unused values, unsafe patterns);
// Prettier keeps the formatting. Accessibility is checked on the built pages by Lighthouse in
// CI (lighthouserc.json): eslint-plugin-jsx-a11y does not support ESLint 10 yet.
import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      '.astro/',
      'node_modules/',
      'src/data/generated/',
      'public/',
      '.lighthouseci/',
      'lighthouse/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
);
