// Starter SKU resolution — same schema as businesses/greenguard/sku-engine.js.

const EVENT_TYPES = require('./cal-event-types.json').eventTypes

const SKU_PRICES = {
  'VISIT':   99.00,
  'INSTALL': 149.00,
  'ADDON':    25.00,
}

const SUBSCRIPTION_SKUS = new Set(['VISIT'])

const TITLE_TO_SLUG = {
  'Recurring Service Visit':   'visit',
  'New Customer Installation': 'install',
  'Free Assessment':           'free-assessment',
}

function resolveSKU({ visitType, isWeekend = false }) {
  const skus = []
  if (visitType === 'assessment') return []
  if (visitType === 'install') skus.push('INSTALL')
  if (visitType === 'service') skus.push('VISIT')
  if (isWeekend) skus.push('WKD-SURCH')
  return skus
}

function resolveServiceDuration({ visitType }) {
  if (visitType === 'assessment') return 30
  if (visitType === 'install') return 60
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
  return rawTitle.replace(/^[^:]+:\s*/, '').replace(/\s*\(.*\)\s*$/, '').trim()
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

  const noChargeSlugs = ['free-assessment']
  if (noChargeSlugs.includes(slug)) return []

  let baseLines = null
  if (slug === 'visit')   baseLines = [{ sku: 'VISIT', qty: 1 }]
  if (slug === 'install') baseLines = [{ sku: 'INSTALL', qty: 1 }]

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
