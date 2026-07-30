// Single source of truth for products the admin can sell, add to a service,
// or track in inventory. Each entry declares the labels, prices, and which
// downstream surfaces (rounds / quote / inventory) should display it.
//
// Before this file existed, rounds.js, quote.js and inventory.js each
// maintained their own arrays and drifted (different labels, missing items,
// inconsistent prices). Add a new catalog entry here and it propagates.

const ADDONS = [
  {
    sku: 'CO2-ADDON',
    label: 'CO₂ Tank & Timer Rental',
    price: 124.99,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'Recurring Add-Ons',
  },
  {
    sku: 'BG-NONCO2-RENT',
    label: 'Biogents Non-CO₂ Trap Rental',
    price: 40.00,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'Recurring Add-Ons',
  },
  {
    sku: 'OWN-BG',
    label: 'Tank Hookup & Maintenance',
    price: 10.00,
    surfaces: { quote: true },
    quoteCategory: 'Recurring Add-Ons',
  },
  {
    sku: 'BARRIER',
    label: 'GreenGuard Barrier Treatment',
    price: 49.99,
    surfaces: { quote: true },
    quoteCategory: 'Recurring Add-Ons',
  },
  {
    sku: 'BG-SWEETSCENT',
    label: 'BG Sweetscent Bait Pack',
    price: 18.99,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'bgSweetscent',
    quoteCategory: 'Recurring Add-Ons',
  },
  {
    sku: 'BAIT',
    label: 'Generic Bait Pack',
    price: 10.00,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'genericBaits',
    quoteCategory: 'Recurring Add-Ons',
  },
  {
    sku: 'BUCKET-OF-DOOM',
    label: 'Bucket of Doom',
    price: 24.99,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'bucketOfDoom',
    quoteCategory: 'One-Time Add-Ons',
    oneTime: true,
  },
  {
    sku: 'INNER-TRAP',
    label: 'Inner Trap',
    price: 5.00,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'innerTraps',
    quoteCategory: 'One-Time Add-Ons',
    oneTime: true,
  },
  {
    sku: 'BG-EXT-30',
    label: 'Biogents 30ft Extension',
    price: 18.99,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'bgExt30',
    quoteCategory: 'One-Time Add-Ons',
    oneTime: true,
  },
  {
    sku: 'TRAP-MESH-WHITE',
    label: 'White Trap Mesh',
    price: 7.00,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'whiteTrapMesh',
    quoteCategory: 'One-Time Add-Ons',
    oneTime: true,
  },
  {
    sku: 'TANK-STRAPS',
    label: 'Tank Straps',
    price: 12.99,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'tankStraps',
    quoteCategory: 'One-Time Add-Ons',
    oneTime: true,
  },
  {
    // Larvicide is intentionally SKU-less — we don't yet have a Stripe price.
    // Show in the picker so the admin can track usage, but won't auto-bill
    // until a STRIPE_PRICE_LARVICIDE env var + lib/stripe.js entry are added.
    sku: null,
    label: 'Larvicide Tablet',
    price: 4.00,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'One-Time Add-Ons',
    oneTime: true,
  },
  {
    sku: 'WKD-SURCH',
    label: 'Weekend Surcharge',
    price: 25.00,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'One-Time Services',
  },
  {
    sku: 'RUSH-FEE',
    label: 'Rush Service Fee (Next-Day)',
    price: 99.99,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'One-Time Services',
    oneTime: true,
  },
  {
    // Flat fee on top of the standard tank exchange price for weekend and
    // after-hours commercial CO2 deliveries (restaurants, bars, pools).
    sku: 'CO2-RUSH',
    label: 'CO2 Emergency Delivery (Wknd/After-Hrs)',
    price: 99.00,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'One-Time Services',
    oneTime: true,
  },
]

// Equipment sold during visit — one-time purchases of physical hardware.
// Inventory-tracked items also include an inventoryKey for the stock form.
const PRODUCTS = [
  {
    sku: null, label: 'Biogents BG-Mosquitaire', price: 299.99,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'bgTraps', quoteCategory: 'Trap Purchase',
    shipping: 10.00,  // per unit
  },
  {
    sku: 'BG-NONCO2-UNIT', label: 'Biogents Non-CO₂ Trap', price: 199.99,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'bgNonCo2', quoteCategory: 'Trap Purchase',
    shipping: 10.00,  // per unit
  },
  {
    sku: null, label: 'Mosqitter Grand', price: 1849.99,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'mqTraps', quoteCategory: 'Trap Purchase',
    shipping: 170.00, // per unit
  },
  {
    sku: 'BG-TIMER', label: 'Biogents Timer', price: 109.99,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'bgTimers', quoteCategory: 'Trap Purchase',
  },
  {
    sku: 'TANK-20-EMPTY', label: 'CO₂ Tank — 20lb (empty)', price: 239.99,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'Tank Purchase',
    shipping: 50.00,  // per unit (hazmat/freight)
  },
  {
    sku: null, label: 'CO₂ Regulator', price: 119.99,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'regulators', quoteCategory: 'Accessories',
  },
  {
    sku: null, label: 'CO₂ Tank Washer', price: 5.00,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'tankWashers', quoteCategory: 'Accessories',
  },
  {
    sku: null, label: 'Biogents Power Supply', price: 36.99,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'bgPowerSupply', quoteCategory: 'Accessories',
  },
  {
    sku: null, label: 'Biogents Power Supply 30ft Extension', price: 18.99,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'Accessories',
  },
  {
    sku: null, label: 'Biogents Trap Net', price: 6.99,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'bgNets', quoteCategory: 'Accessories',
  },
  {
    sku: null, label: 'Biogents Funnel', price: 10.50,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'bgFunnels', quoteCategory: 'Accessories',
  },
  {
    sku: null, label: '9V Battery', price: 6.00,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'batteries9v', quoteCategory: 'Accessories',
  },
  {
    sku: null, label: 'Splitter', price: 8.99,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'splitters', quoteCategory: 'Accessories',
  },
  {
    sku: null, label: '50ft Extension Cord', price: 20.00,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'extensions50', quoteCategory: 'Accessories',
  },
  {
    sku: null, label: '100ft Extension Cord', price: 40.00,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'extensions100', quoteCategory: 'Accessories',
  },
]

// Helpers for each consumer page to filter to just what it needs.
function addonsForRounds() {
  return ADDONS.filter((a) => a.surfaces.rounds).map((a) => ({ label: a.label, sku: a.sku, price: a.price }))
}

function productsForRounds() {
  return PRODUCTS.filter((p) => p.surfaces.rounds).map((p) => ({ label: p.label, sku: p.sku, price: p.price }))
}

function addonsForQuote() {
  return ADDONS.filter((a) => a.surfaces.quote).map((a) => ({ label: a.label, price: a.price, category: a.quoteCategory || 'Recurring Add-Ons', oneTime: !!a.oneTime }))
}

function productsForQuote() {
  return PRODUCTS.filter((p) => p.surfaces.quote).map((p) => ({ label: p.label, price: p.price, category: p.quoteCategory || 'Accessories', oneTime: true }))
}

function inventoryItems() {
  const items = []
  for (const a of ADDONS) if (a.surfaces.inventory) items.push({ key: a.inventoryKey, label: a.label })
  for (const p of PRODUCTS) if (p.surfaces.inventory) items.push({ key: p.inventoryKey, label: p.label })
  return items
}

module.exports = {
  ADDONS, PRODUCTS,
  addonsForRounds, productsForRounds,
  addonsForQuote, productsForQuote,
  inventoryItems,
}
