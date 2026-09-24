// Shared line-item helpers for /admin/rounds plus the "Common Items" stepper
// block. The common items are NOT a separate catalog: each one resolves to an
// existing rounds catalog row (Services or Add-Ons) and its stepper writes the
// same qty map the dropdown writes, so totals, invoice line items and the
// saved visit log treat them exactly like a dropdown pick.

// Order = display order. Larvicide has no SKU in the catalog yet, so it is
// matched by label.
const COMMON_ITEM_KEYS = [
  { sku: 'BAIT' },
  { sku: 'BARRIER' },
  { sku: 'BG-NONCO2-RENT' },
  { label: 'Larvicide Tablet' },
]

function sectionTotal(catalog, qtys) {
  return catalog.reduce((sum, item) => {
    const q = (qtys || {})[item.label] || 0
    return sum + (item.price && q > 0 ? item.price * q : 0)
  }, 0)
}

function buildLineItems(catalog, qtys) {
  return catalog
    .filter((item) => ((qtys || {})[item.label] || 0) > 0)
    .map((item) => ({ label: item.label, sku: item.sku, price: item.price, qty: qtys[item.label] }))
}

/**
 * Resolve the common items against the page's catalogs.
 * @param {{field: string, catalog: {label: string, sku: string|null, price: number|null}[]}[]} sections
 * @returns {{label: string, sku: string|null, price: number|null, field: string}[]}
 */
function resolveCommonItems(sections) {
  const out = []
  for (const key of COMMON_ITEM_KEYS) {
    for (const { field, catalog } of sections) {
      const hit = catalog.find((item) => (key.sku ? item.sku === key.sku : item.label === key.label))
      if (hit) { out.push({ label: hit.label, sku: hit.sku, price: hit.price, field }); break }
    }
  }
  return out
}

// State updater for a stepper click: writes into the item's own qty map.
function commonItemPatch(item, n) {
  return (s) => ({ [item.field]: { ...s[item.field], [item.label]: Math.max(0, n) } })
}

module.exports = { COMMON_ITEM_KEYS, sectionTotal, buildLineItems, resolveCommonItems, commonItemPatch }
