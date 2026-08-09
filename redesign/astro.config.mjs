import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://new.greenguard-usa.com',
  integrations: [
    tailwind(),
    sitemap({
      // /variations/ is an internal design-review scratch page (20 hero designs).
      // It was live AND in the sitemap, i.e. actively submitted to Google. It
      // also carries a noindex meta tag — keep both guards.
      filter: (page) => !/\/variations\/?$/.test(page),
    }),
  ],
  output: 'static',
  build: {
    inlineStylesheets: 'auto',
    format: 'file',
  },
});
