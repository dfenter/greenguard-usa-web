// Google Merchant Center product feed — served at /products-feed.xml
// Mirrors the product data in shop/[product].astro so the feed stays
// in sync with the shop pages automatically.

export const prerender = true;

const BASE = 'https://www.greenguard-usa.com';

const products = [
  {
    id:          'product-biogents-co2',
    shopSlug:    'biogents-co2-trap',
    name:        'Biogents BG-Mosquitaire CO2 Outdoor Mosquito Trap',
    price:       '279.99',
    image:       `${BASE}/images/prod-biogents-co2.jpg`,
    mpn:         'BG-MOSQUITAIRE-CO2',
    description: 'The Biogents BG-Mosquitaire CO2 trap uses CO2 to mimic human breath, attracting and capturing host-seeking mosquitoes 24 hours a day without pesticides. Covers up to 6,500 sq ft. Regulator included. IP68 weatherproof.',
  },
  {
    id:          'product-biogents-no-co2',
    shopSlug:    'biogents-non-co2-trap',
    name:        'Biogents BG-Mosquitaire Indoor/Outdoor Mosquito Trap (No CO2)',
    price:       '179.99',
    image:       `${BASE}/images/mosquitairenoco2.webp`,
    mpn:         'BG-MOSQUITAIRE-NCO2',
    description: 'The Biogents BG-Mosquitaire without CO2 uses heat, water vapor, and scent attractants to capture mosquitoes indoors and in sheltered outdoor areas. No CO2 tank required. Compatible with BG-Sweetscent bait.',
  },
  {
    id:          'product-all-in-one',
    shopSlug:    'all-in-one-bundle',
    name:        'Biogents Mosquito Trap All-in-One Starter Bundle — Trap + Timer + Tank + Bait',
    price:       '549.99',
    salePrice:   null,
    originalPrice: '619.97',
    image:       `${BASE}/images/prod-all-in-one-bundle.jpg`,
    mpn:         'BG-BUNDLE-ALL-IN-ONE',
    description: 'Complete mosquito control starter kit. Includes Biogents BG-Mosquitaire CO2 trap, CO2 tank timer, empty 20 lb CO2 tank, and BG-Sweetscent bait pack. Save $69.98 vs buying individually. Everything to start trapping mosquitoes the same day.',
  },
  {
    id:          'product-co2-tank',
    shopSlug:    'co2-tank-20lb',
    name:        'CO2 Tank 20 lb Empty Cylinder for Mosquito Traps',
    price:       '199.99',
    image:       `${BASE}/images/tank.jpeg`,
    mpn:         'CO2-TANK-20LB',
    description: 'DOT-certified 20-pound CO2 aluminum cylinder compatible with all Biogents BG-Mosquitaire traps. Sold empty for local refill. CGA-320 valve fitting. Lasts approximately 20-27 days per trap.',
  },
  {
    id:          'product-co2-timer',
    shopSlug:    'biogents-co2-timer',
    name:        'Biogents CO2 Tank Timer for Mosquito Traps',
    price:       '89.99',
    availability: 'out of stock',
    image:       `${BASE}/images/prod-co2-timer.png`,
    mpn:         'BG-CO2-TIMER',
    description: 'Programmable CO2 tank timer for Biogents BG-Mosquitaire traps. Reduces CO2 consumption by up to 75% by running the trap only during peak mosquito activity hours. Controls up to 5 traps. 9V battery powered.',
  },
  {
    id:          'product-mosqitter-grand',
    shopSlug:    'mosqitter-grand',
    name:        'Mosqitter Grand CO2 Mosquito Trap',
    price:       '1849.99',
    image:       `${BASE}/images/prod-mosqitter-grand.jpg`,
    mpn:         'MOSQITTER-GRAND',
    description: 'Premium 304 stainless steel CO2 mosquito trap with Bluetooth app monitoring. Covers up to 2 acres per unit. Professional-grade materials, remote monitoring via smartphone app.',
  },
];

function escXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function GET() {
  const items = products.map(p => `    <item>
      <g:id>${p.id}</g:id>
      <title><![CDATA[${p.name}]]></title>
      <link>${BASE}/shop/${p.shopSlug}</link>
      <description><![CDATA[${p.description}]]></description>
      <g:image_link>${p.image}</g:image_link>
      <g:price>${p.price} USD</g:price>
      ${p.originalPrice ? `<g:sale_price>${p.price} USD</g:sale_price>` : ''}
      <g:availability>${p.availability || 'in stock'}</g:availability>
      <g:condition>new</g:condition>
      <g:brand>Biogents</g:brand>
      <g:google_product_category>2870</g:google_product_category>
      <g:product_type>Pest Control &gt; Mosquito Traps &gt; CO2 Mosquito Traps</g:product_type>
      <g:mpn>${p.mpn}</g:mpn>
      <g:identifier_exists>no</g:identifier_exists>
      <g:shipping>
        <g:country>US</g:country>
        <g:service>Standard Shipping</g:service>
        <g:price>0 USD</g:price>
      </g:shipping>
      <g:tax>
        <g:country>US</g:country>
        <g:rate>8.25</g:rate>
        <g:tax_ship>no</g:tax_ship>
      </g:tax>
    </item>`).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>GreenGuard USA Products</title>
    <link>${BASE}</link>
    <description>Mosquito control equipment from GreenGuard USA, Austin TX</description>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=UTF-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
