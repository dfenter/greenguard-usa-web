// Pool service SKU resolution — simpler than GreenGuard (no tank/trap count logic)

const EVENT_TYPES = require('./cal-event-types.json').eventTypes

const SKU_PRICES = {
  'WEEKLY-SVC':   120.00,
  'BIWEEKLY-SVC':  80.00,
  'CHEM-BAL':      35.00,
  'FILTER-SVC':    45.00,
  'ALGAE-TREAT':   80.00,
  'POOL-SHOCK':    50.00,
  'WKD-SURCH':     25.00,
}

const SUBSCRIPTION_SKUS = new Set(['WEEKLY-SVC', 'BIWEEKLY-SVC'])

const TITLE_TO_SLUG = {
  'Weekly Pool Service':   'weekly-service',
  'Bi-Weekly Pool Service': 'biweekly-service',
  'Algae Treatment':       'algae-treatment',
  'Filter Service':        'filter-service',
  'Free Water Analysis':   'free-water-analysis',
}

function resolveSKU({ visitType, isWeekend = false }) {
  const skus = []
  if (visitType === 'assessment') return []
  if (visitType === 'service') skus.push('WEEKLY-SVC')
  if (visitType === 'treatment') skus.push('ALGAE-TREAT')
  if (isWeekend) skus.push('WKD-SURCH')
  return skus
}

function resolveServiceDuration({ visitType }) {
  if (visitType === 'assessment') return 30
  if (visitType === 'treatment') return 60
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
  return rawTitle.replace(/^[^:]+:\s*/, '').replace(/\s*\(PoolPro Services\)\s*$/, '').trim()
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

  const noChargeSlugs = ['free-water-analysis']
  if (noChargeSlugs.includes(slug)) return []

  let baseLines = null
  if (slug === 'weekly-service') baseLines = [{ sku: 'WEEKLY-SVC', qty: 1 }]
  if (slug === 'biweekly-service') baseLines = [{ sku: 'BIWEEKLY-SVC', qty: 1 }]
  if (slug === 'algae-treatment') baseLines = [{ sku: 'ALGAE-TREAT', qty: 1 }]
  if (slug === 'filter-service') baseLines = [{ sku: 'FILTER-SVC', qty: 1 }]

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
