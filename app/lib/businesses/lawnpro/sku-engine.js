// Lawn care SKU resolution

const EVENT_TYPES = require('./cal-event-types.json').eventTypes

const SKU_PRICES = {
  'WEEKLY-MOW':   65.00,
  'BIWEEKLY-MOW': 55.00,
  'EDGE-TRIM':    20.00,
  'FERTILIZE':    85.00,
  'WEED-CTRL':    65.00,
  'AERATION':    120.00,
  'OVERSEEDING': 150.00,
  'LEAF-CLEANUP':150.00,
  'WKD-SURCH':    20.00,
}

const SUBSCRIPTION_SKUS = new Set(['WEEKLY-MOW', 'BIWEEKLY-MOW'])

const TITLE_TO_SLUG = {
  'Weekly Lawn Mowing':    'weekly-mowing',
  'Bi-Weekly Lawn Mowing': 'biweekly-mowing',
  'Fertilization Treatment': 'fertilization',
  'Weed Control Treatment':  'weed-control',
  'Core Aeration':           'core-aeration',
  'Free Lawn Assessment':    'lawn-assessment',
}

function resolveSKU({ visitType, isWeekend = false }) {
  const skus = []
  if (visitType === 'assessment') return []
  if (visitType === 'service') skus.push('WEEKLY-MOW')
  if (visitType === 'treatment') skus.push('FERTILIZE')
  if (isWeekend) skus.push('WKD-SURCH')
  return skus
}

function resolveServiceDuration({ visitType }) {
  if (visitType === 'assessment') return 30
  if (visitType === 'treatment') return 30
  return 45
}

function calculateRevenue(skus) {
  return skus.reduce((sum, sku) => sum + (SKU_PRICES[sku] ?? 0), 0)
}

function isSubscriptionSKU(sku) {
  return SUBSCRIPTION_SKUS.has(sku)
}

function resolveByTitle(title) {
  if (!title) return null
  const match = EVENT_TYPES.find((et) => et.title.toLowerCase() === title.trim().toLowerCase())
  if (!match) return null
  return { skus: match.skus, visitType: match.visitType, systemType: null, durationMin: match.durationMin, price: match.price }
}

function normalizeEventTitle(rawTitle) {
  if (!rawTitle) return ''
  return rawTitle.replace(/^[^:]+:\s*/, '').replace(/\s*\(LawnPro Services\)\s*$/, '').trim()
}

function slugFromTitle(title) {
  if (!title) return null
  const cleaned = normalizeEventTitle(title)
  return TITLE_TO_SLUG[cleaned] || null
}

function prefillFromBooking(booking, contact) {
  const slug = (booking?.slug || '').trim()
  if (!slug) return []

  const props = contact?.properties || {}
  const recurringAddons = String(props.recurring_addons || '').split(',').map((s) => s.trim()).filter(Boolean)

  const noChargeSlugs = ['lawn-assessment']
  if (noChargeSlugs.includes(slug)) return []

  let baseLines = null
  if (slug === 'weekly-mowing')   baseLines = [{ sku: 'WEEKLY-MOW', qty: 1 }]
  if (slug === 'biweekly-mowing') baseLines = [{ sku: 'BIWEEKLY-MOW', qty: 1 }]
  if (slug === 'fertilization')   baseLines = [{ sku: 'FERTILIZE', qty: 1 }]
  if (slug === 'weed-control')    baseLines = [{ sku: 'WEED-CTRL', qty: 1 }]
  if (slug === 'core-aeration')   baseLines = [{ sku: 'AERATION', qty: 1 }]

  if (baseLines === null) return []

  const haveSku = new Set(baseLines.map((l) => l.sku))
  for (const sku of recurringAddons) {
    if (!haveSku.has(sku)) baseLines.push({ sku, qty: 1 })
  }
  return baseLines
}

module.exports = {
  resolveSKU,
  resolveServiceDuration,
  calculateRevenue,
  isSubscriptionSKU,
  resolveByTitle,
  normalizeEventTitle,
  prefillFromBooking,
  slugFromTitle,
  TITLE_TO_SLUG,
  SKU_PRICES,
  EVENT_TYPES,
}
