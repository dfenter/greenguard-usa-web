// Authoritative shop catalog — the server-side source of truth for checkout.
//
// The public POST /api/checkout endpoint validates every cart line against this
// map: it REJECTS unknown or out-of-stock SKUs and charges THESE prices and
// shipping amounts, never the values the browser sends. The cart lives in the
// visitor's localStorage and the endpoint is publicly callable, so the UI's
// "Out of Stock" button state and displayed prices can never be the only gate —
// this file is.
//
// The shop display pages (shop.astro, shop/[product].astro) mirror these prices
// and stock flags for presentation. Keep them in sync, but if they ever drift,
// THIS file wins for what a customer can actually buy and pay.
//
// Austin-local orders deliver FREE (we drive it). 787xx = Austin proper, 786xx
// = the metro suburbs we already serve (Cedar Park, Round Rock, Pflugerville,
// Kyle, Leander, Buda…) ≈ the 40-mile service area. Adjust this rule to widen or
// tighten the free-delivery zone. The checkout enforces it server-side.
export function isAustinLocal(zip) {
  return /^78[67]\d\d$/.test(String(zip || '').trim());
}

// shipping: flat per-unit amount in USD (0 = free shipping). Waived entirely for
// Austin-local delivery (see isAustinLocal).
export const CATALOG = {
  'biogents-co2-trap':     { name: 'Biogents BG-Mosquitaire CO₂ Trap',  price: 299.99,  shipping: 9.99, inStock: true  },
  'all-in-one-bundle':     { name: 'All-in-One Starter Bundle',         price: 619.99,  shipping: 30,   inStock: true  },
  'mosqitter-grand':       { name: 'Mosqitter Grand CO₂ Trap',          price: 1849.99, shipping: 170,  inStock: true  },
  'biogents-non-co2-trap': { name: 'BG-Mosquitaire (No CO₂)',           price: 199.99,  shipping: 9.99, inStock: true  },
  'biogents-co2-timer':    { name: 'Biogents CO₂ Tank Timer',           price: 109.99,   shipping: 9.99, inStock: false },
  'co2-tank-20lb':         { name: 'CO₂ Tank (20 lb Empty Cylinder)',   price: 239.99,  shipping: 30,   inStock: true  },
};
