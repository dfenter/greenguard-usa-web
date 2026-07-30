import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://www.greenguard-usa.com',
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
  adapter: vercel(),
  build: {
    inlineStylesheets: 'auto',
  },
  redirects: {
    '/sitemap.xml': { status: 301, destination: '/sitemap-index.xml' },
    // Old static site product URLs → new Astro shop pages (existing)
    '/product-biogents-co2':    { status: 301, destination: '/shop/biogents-co2-trap' },
    '/product-biogents-no-co2': { status: 301, destination: '/shop/biogents-non-co2-trap' },
    '/product-all-in-one':      { status: 301, destination: '/shop/all-in-one-bundle' },
    '/product-co2-tank':        { status: 301, destination: '/shop/co2-tank-20lb' },
    '/product-co2-timer':       { status: 301, destination: '/shop/biogents-co2-timer' },
    '/product-mosqitter-grand': { status: 301, destination: '/shop/mosqitter-grand' },
    '/shop.html':               { status: 301, destination: '/shop' },

    // Old /shop/p/* product URLs → new Astro shop pages (high-traffic GSC pages)
    '/shop/p/biogents-mosquitaire-co2':   { status: 301, destination: '/shop/biogents-co2-trap' },
    '/shop/p/full-package-single-system': { status: 301, destination: '/shop/all-in-one-bundle' },
    '/shop/p/mosqitter-grand':            { status: 301, destination: '/shop/mosqitter-grand' },
    '/shop/p/mosquito-bucket-of-doom':    { status: 301, destination: '/blog/mosquito-bucket-of-doom' },
    // Old product IDs with no direct equivalent → shop root
    '/shop/p/1edcarfhjhwycw95z9innrjm6hq1lk': { status: 301, destination: '/shop' },
    '/shop/p/product-4-9e76d-pr6ls-5tznn-9jrm7': { status: 301, destination: '/shop' },
    '/shop/p/product-2-5c6mb-j8mng-zyt72-5jksn': { status: 301, destination: '/shop' },

    // Old service/location pages
    '/co2-trap-rental-austin':  { status: 301, destination: '/traprental' },
    '/co2-tank-delivery-austin':{ status: 301, destination: '/co2delivery' },
    '/co2-mosquito-trap-placement': { status: 301, destination: '/faq' },
    '/trapplacement':           { status: 301, destination: '/faq' },
    '/greenguard-barrier-treatment': { status: 301, destination: '/barrier' },
    '/mosquito-bucket-of-doom-instructions': { status: 301, destination: '/blog/mosquito-bucket-of-doom' },
    '/franchise-opportunities': { status: 301, destination: '/contact' },
    '/reviews':                 { status: 301, destination: '/results' },
    '/free-trial':              { status: 301, destination: '/book' },
    '/thank-you':               { status: 301, destination: '/' },
    '/terms-of-service':        { status: 301, destination: '/' },

    // Old blog posts → most relevant current pages
    '/blog/introducing-the-greenguardusa-mosquito-bucket-of-doom-kit': { status: 301, destination: '/blog/mosquito-bucket-of-doom' },
    '/blog/plants-that-attract-mosquitoes-to-your-yard-and-what-to-plant-instead': { status: 301, destination: '/blog/worst-mosquito-breeding-spots-austin' },
    '/blog/troubleshooting-your-biogents-mosquitaire-co-trap': { status: 301, destination: '/shop/biogents-co2-trap' },
    '/blog/-how-the-biogents-mosquitaire-co-trap-works-and-why-its-better-than-sprays': { status: 301, destination: '/results' },
    '/blog/attracting-mosquito-predators-to-your-lawn-natural-mosquito-control': { status: 301, destination: '/results' },
    '/blog/reliable-co-delivery-in-austin-texas-powered-by-greenguard-usa': { status: 301, destination: '/co2delivery' },
    '/blog/-why-its-so-hard-to-find-co-tank-delivery-in-austin': { status: 301, destination: '/co2delivery' },
    '/blog/benefits-of-pesticide-free-mosquito-control-in-austin': { status: 301, destination: '/services' },
    '/blog/greenguard-usa-co2-trap-and-tank-rentals-are-available-now-in-the-austin-tx-metro-area': { status: 301, destination: '/traprental' },
    '/blog/greenguard-usa-electrifies-its-fleet-with-allelectric-chevy-silverado-ev-work-trucks': { status: 301, destination: '/about' },
    '/blog/pesticide-free-mosquito-defense-what-the-science-says': { status: 301, destination: '/results' },
    '/blog/west-nile-virus-in-austin-what-you-need-to-know-and-how-greenguard-usa-can-help': { status: 301, destination: '/results' },
    '/blog/greenguard-usa-co2-trap-and-tank-rentals-are-available-now-in-the-austin-tx-metro-area': { status: 301, destination: '/traprental' },
  },
});
