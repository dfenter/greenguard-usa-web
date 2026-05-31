import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://www.greenguard-usa.com',
  integrations: [tailwind(), sitemap()],
  output: 'static',
  adapter: vercel(),
  build: {
    inlineStylesheets: 'auto',
  },
  redirects: {
    // Old static site product URLs → new Astro shop pages
    '/product-biogents-co2':    { status: 301, destination: '/shop/biogents-co2-trap' },
    '/product-biogents-no-co2': { status: 301, destination: '/shop/biogents-non-co2-trap' },
    '/product-all-in-one':      { status: 301, destination: '/shop/all-in-one-bundle' },
    '/product-co2-tank':        { status: 301, destination: '/shop/co2-tank-20lb' },
    '/product-co2-timer':       { status: 301, destination: '/shop/biogents-co2-timer' },
    '/product-mosqitter-grand': { status: 301, destination: '/shop/mosqitter-grand' },
    // Old shop root
    '/shop.html': { status: 301, destination: '/shop' },
  },
});
