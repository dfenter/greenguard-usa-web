// Pool service product catalog — same schema as greenguard/catalog.js
// Each entry needs a matching STRIPE_PRICE_* env var once configured.

const ADDONS = [
  {
    sku: 'WEEKLY-SVC',
    label: 'Weekly Pool Service',
    price: 120.00,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'Recurring Services',
  },
  {
    sku: 'BIWEEKLY-SVC',
    label: 'Bi-Weekly Pool Service',
    price: 80.00,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'Recurring Services',
  },
  {
    sku: 'CHEM-BAL',
    label: 'Chemical Balance (add-on)',
    price: 35.00,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'Recurring Services',
  },
  {
    sku: 'FILTER-SVC',
    label: 'Filter Service',
    price: 45.00,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'Recurring Services',
  },
  {
    sku: 'ALGAE-TREAT',
    label: 'Algae Treatment',
    price: 80.00,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'One-Time Services',
  },
  {
    sku: 'POOL-SHOCK',
    label: 'Pool Shock Treatment',
    price: 50.00,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'One-Time Services',
  },
  {
    sku: 'WKD-SURCH',
    label: 'Weekend Surcharge',
    price: 25.00,
    surfaces: { rounds: true, quote: true },
    quoteCategory: 'One-Time Services',
  },
]

const PRODUCTS = [
  {
    sku: null, label: 'Chlorine Tabs (5 lb)', price: 32.00,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'chlorineTabs', quoteCategory: 'Chemicals',
  },
  {
    sku: null, label: 'Pool Shock (1 lb bag)', price: 8.00,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'shock', quoteCategory: 'Chemicals',
  },
  {
    sku: null, label: 'Algaecide (32 oz)', price: 18.00,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'algaecide', quoteCategory: 'Chemicals',
  },
  {
    sku: null, label: 'pH Increaser (5 lb)', price: 14.00,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'phUp', quoteCategory: 'Chemicals',
  },
  {
    sku: null, label: 'pH Decreaser (5 lb)', price: 14.00,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'phDown', quoteCategory: 'Chemicals',
  },
  {
    sku: null, label: 'Cartridge Filter Element', price: 65.00,
    surfaces: { rounds: true, quote: true, inventory: true },
    inventoryKey: 'filterCartridge', quoteCategory: 'Equipment',
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
  return PRODUCTS.filter((p) => p.surfaces.quote).map((p) => ({ label: p.label, price: p.price, category: p.quoteCategory || 'Chemicals', oneTime: true }))
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
