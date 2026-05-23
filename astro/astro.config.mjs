import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://new.greenguard-usa.com',
  integrations: [tailwind(), sitemap()],
  output: 'static',
  build: {
    inlineStylesheets: 'auto',
  },
});
