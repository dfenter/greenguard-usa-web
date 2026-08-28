// Starter product/add-on catalog — same schema as businesses/greenguard/catalog.js.
// Replace these three example SKUs with your real recurring service, one-time
// install, and recurring add-on. Keep the exported function/const names as-is;
// the rest of the app depends on this exact shape.

const ADDONS = [
  {
    sku: 'VISIT',
    label: 'Recurring Service Visit',
    price: 99.00,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'Recurring Services',
  },
  {
    sku: 'ADDON',
    label: 'Add-On Service',
    price: 25.00,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'Recurring Add-Ons',
  },
]

const PRODUCTS = [
  {
    sku: null, label: 'Installation Kit', price: 149.00,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'installKit', quoteCategory: 'Supplies',
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
