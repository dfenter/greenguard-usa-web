// Lawn care product catalog — same schema as greenguard/catalog.js

const ADDONS = [
  {
    sku: 'WEEKLY-MOW',
    label: 'Weekly Lawn Mowing',
    price: 65.00,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'Recurring Services',
  },
  {
    sku: 'BIWEEKLY-MOW',
    label: 'Bi-Weekly Lawn Mowing',
    price: 55.00,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'Recurring Services',
  },
  {
    sku: 'EDGE-TRIM',
    label: 'Edge & Trim (add-on)',
    price: 20.00,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'Recurring Services',
  },
  {
    sku: 'FERTILIZE',
    label: 'Fertilization Treatment',
    price: 85.00,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'One-Time Services',
  },
  {
    sku: 'WEED-CTRL',
    label: 'Weed Control Treatment',
    price: 65.00,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'One-Time Services',
  },
  {
    sku: 'AERATION',
    label: 'Core Aeration',
    price: 120.00,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'One-Time Services',
  },
  {
    sku: 'OVERSEEDING',
    label: 'Overseeding',
    price: 150.00,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'One-Time Services',
  },
  {
    sku: 'LEAF-CLEANUP',
    label: 'Leaf Cleanup',
    price: 150.00,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'One-Time Services',
  },
  {
    sku: 'WKD-SURCH',
    label: 'Weekend Surcharge',
    price: 20.00,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'One-Time Services',
  },
]

const PRODUCTS = [
  {
    sku: null, label: 'Slow-Release Fertilizer (50 lb)', price: 45.00,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'fertilizer', quoteCategory: 'Supplies',
  },
  {
    sku: null, label: 'Pre-Emergent Weed Control (10 lb)', price: 28.00,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'preEmergent', quoteCategory: 'Supplies',
  },
  {
    sku: null, label: 'Grass Seed Mix (5 lb)', price: 22.00,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'grassSeed', quoteCategory: 'Supplies',
  },
  {
    sku: null, label: 'Lawn Soil Amendment (40 lb)', price: 18.00,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'soilAmendment', quoteCategory: 'Supplies',
  },
]

function addonsForRounds() {
  return ADDONS.filter((a) => a.surfaces.rounds).map((a) => ({ label: a.label, sku: a.sku, price: a.price }))
}

function productsForRounds() {
  return PRODUCTS.filter((p) => p.surfaces.rounds).map((p) => ({ label: p.label, sku: p.sku, price: p.price }))
}

function addonsForQuote() {
  return ADDONS.filter((a) => a.surfaces.quote).map((a) => ({ label: a.label, price: a.price, category: a.quoteCategory || 'Recurring Services' }))
}

function productsForQuote() {
  return PRODUCTS.filter((p) => p.surfaces.quote).map((p) => ({ label: p.label, price: p.price, category: p.quoteCategory || 'Supplies', oneTime: true }))
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
