// SKU resolution logic — ported from greenguardintegraton_system.md

const SKU_PRICES = {
  BG1: 159.99,
  BG2: 266.99,
  BG3: 399.99,
  'MQ-RENT': 299.99,
  'MQ-SVC': 199.99,   // confirmed from live calendar data
  'MQ-INST': 199.99,
  'MQ-TSHOOT': 79.99,
  'OWN-BG': 10.00,  // per trap
  'OWN-MQ': 30.00,  // per trap
  'OWN-NONCO2': 10.00,
  // Tank pricing: $39 flat delivery + $49 per tank (qty-based).
  // Legacy TANK1-10 retained for historical invoices; new bookings use these two.
  'TANK-DELIVERY-FEE': 39.00,
  'TANK-REFILL': 49.00,
  TANK1: 89.99,
  TANK2: 159.99,
  TANK3: 249.99,
  TANK4: 279.99,   // confirmed from live calendar data
  TANK6: 399.99,   // confirmed from live calendar data
  TANK10: 889.98,
  ASSESS: 0,
  CHK: 0,
  'WKD-SURCH': 25.00,
  BAIT: 10.00,
  'BG-SWEETSCENT': 10.00,
  'CO2-ADDON': 49.99,
  BARRIER: 49.99,
  'TRAP-INSTALL': 80.00,
  'TRAP-MAINT-1': 29.99,
  'TRAP-MAINT-2': 49.99,
  'TIMER-INSTALL': 29.99,
  'NONCO2-UNIT': 79.99,
}

// Subscription SKUs (monthly recurring in Stripe)
const SUBSCRIPTION_SKUS = new Set([
  'BG1', 'BG2', 'BG3', 'MQ-RENT', 'MQ-SVC', 'OWN-BG', 'OWN-MQ',
])

const TANK_MAP = { 1: 'TANK1', 2: 'TANK2', 3: 'TANK3', 4: 'TANK4', 6: 'TANK6', 10: 'TANK10' }

// Service duration map in minutes
const DURATION_MAP = {
  assessment: { default: 30 },
  check: { default: 20 },
  installation: {
    'Biogents-CO2': 45,
    'Biogents-NonCO2': 45,
    'Mosqitter-Grand': 90,
    Mosqitter: 90, // legacy
    default: 45,
  },
  exchange: {
    'Biogents-CO2': 30,
    default: 30,
  },
  troubleshoot: { 'Mosqitter-Grand': 60, Mosqitter: 60, default: 45 },
  barrier: { default: 30 },
  service: {
    'Biogents-CO2': null, // computed from trapCount below
    'Mosqitter-Grand': 45,
    Mosqitter: 45, // legacy
    default: 30,
  },
}

/**
 * @param {object} visit
 * @param {string} visit.visitType - installation | exchange | assessment | troubleshoot | check | barrier | service
 * @param {string} visit.systemType - Biogents-CO2 | Biogents-NonCO2 | Mosqitter-Grand
 * @param {string} visit.planType - rent | own
 * @param {number} [visit.trapCount]
 * @param {number} [visit.tankCount]
 * @param {string[]} [visit.addons]
 * @param {boolean} [visit.isWeekend]
 * @returns {string[]} array of SKU strings
 */
function resolveSKU(visit) {
  const { visitType, systemType, planType, trapCount = 1, tankCount = 1, addons = [], isWeekend = false, customerType } = visit
  // Support legacy customerType='rental' as planType='rent'
  const isRental = planType === 'rent' || customerType === 'rental'

  if (visitType === 'assessment') return ['ASSESS']
  if (visitType === 'check') return ['CHK']

  const skus = []
  const mqType = systemType === 'Mosqitter-Grand' || systemType === 'Mosqitter'

  if (systemType === 'Biogents-CO2') {
    if (trapCount <= 1) skus.push('BG1')
    else if (trapCount === 2) skus.push('BG2')
    else skus.push('BG3')
  } else if (systemType === 'Tank-Only') {
    skus.push(TANK_MAP[tankCount] || 'TANK1')
  } else if (systemType === 'Biogents-NonCO2') {
    skus.push('OWN-NONCO2')
  } else if (mqType) {
    if (visitType === 'installation') skus.push('MQ-INST')
    else if (visitType === 'troubleshoot') skus.push('MQ-TSHOOT')
    else if (isRental) skus.push('MQ-RENT')
    else skus.push('MQ-SVC')
  }

  // Add-ons
  for (const addon of addons) {
    if (SKU_PRICES[addon] !== undefined) skus.push(addon)
  }

  if (isWeekend) skus.push('WKD-SURCH')

  return skus
}

/**
 * @param {object} visit - same shape as resolveSKU
 * @returns {number} service duration in minutes
 */
function resolveServiceDuration(visit) {
  const { visitType, systemType, trapCount = 1, tankCount = 1, addons = [] } = visit

  let base = 30

  const typeMap = DURATION_MAP[visitType] || {}
  const specific = typeMap[systemType]
  const fallback = typeMap.default ?? 30

  if (specific !== null && specific !== undefined) {
    base = specific
  } else if (visitType === 'service' && systemType === 'Biogents-CO2') {
    base = trapCount >= 2 ? 45 : 30
  } else {
    base = fallback
  }

  const addonTime = addons.includes('BARRIER') ? 30 : 0
  const timerTime = addons.includes('TIMER-INSTALL') ? 15 : 0

  return base + addonTime + timerTime
}

/**
 * Total revenue for a visit (not including per-trap owned pricing adjustments).
 * @param {string[]} skus
 * @returns {number}
 */
function calculateRevenue(skus) {
  return skus.reduce((sum, sku) => sum + (SKU_PRICES[sku] ?? 0), 0)
}

/**
 * True if SKU should be billed as a monthly Stripe subscription.
 */
function isSubscriptionSKU(sku) {
  return SUBSCRIPTION_SKUS.has(sku)
}

// ─── Title-based resolution (Cal.com event type titles) ───────────────────────

const EVENT_TYPES = require('./cal-event-types.json').eventTypes

/**
 * Resolve SKUs and visit metadata directly from a Cal.com event type title.
 * This is the primary resolution path for the webhook handler — more reliable
 * than parsing custom form fields.
 *
 * @param {string} title - Cal.com event type title (e.g. "Two -20 pound CO2 Tank Exchange Delivery Service")
 * @returns {{ skus: string[], visitType: string, systemType: string, trapCount: number, tankCount: number, durationMin: number } | null}
 */
function resolveByTitle(title) {
  if (!title) return null
  const normalized = title.trim().replace(/\s+/g, ' ')
  const match = EVENT_TYPES.find(
    (et) => et.title.toLowerCase() === normalized.toLowerCase()
  )
  if (!match) return null
  return {
    skus: match.skus,
    visitType: match.visitType,
    systemType: match.systemType,
    trapCount: match.trapCount || 0,
    tankCount: match.tankCount || 0,
    addons: match.addons || [],
    durationMin: match.durationMin,
    price: match.price,
  }
}

/**
 * Extract the service title from a Cal.com booking event title.
 * Cal.com event titles are just the event type name (no "CustomerName: " prefix).
 * Legacy event titles have a "FirstName LastName: " prefix — strip it if present.
 *
 * @param {string} rawTitle
 * @returns {string}
 */
function normalizeEventTitle(rawTitle) {
  if (!rawTitle) return ''
  // Strip "Name: " prefix (legacy format) and "(GreenGuard USA)" suffix
  return rawTitle
    .replace(/^[^:]+:\s*/, '')
    .replace(/\s*\(GreenGuard USA\)\s*$/, '')
    .trim()
}

// ─── Slug-based prefill (current Cal.com event-type slugs) ────────────────────
// Returns line items [{sku, qty}] for an invoice given a Cal.com booking and
// the customer's HubSpot contact. Designed to prefill /admin/rounds; admin
// can override any qty before generating the invoice.
//
// Rules (confirmed with owner 2026-05-23):
//  · biogents-co2-N           → BG{N} × 1; if system_type=Biogents-Owned add BAIT × trap_count
//  · tank-exchange-N          → TANK-DELIVERY-FEE × 1 + TANK-REFILL × N
//  · tank-rental              → TANK-DELIVERY-FEE × 1 + TANK-REFILL × 1
//  · mosqitter-rental         → MQ-RENT × trap_count
//  · mosqitter-installation   → MQ-INST × trap_count, only if system_type=Mosqitter-Owned
//  · mosqitter-service        → MQ-SVC  × trap_count, only if system_type=Mosqitter-Owned
//  · mosqitter-troubleshoot   → MQ-TSHOOT × 1, only if system_type=Mosqitter-Owned
//  · barrier-treatment        → BARRIER × 1
//  · tank-refill-check / equipment-pickup / property-assessment → [] (no charge)

// Title → slug for current Cal.com event types (as of 2026-05). Used to derive
// the slug when only the event title is available (e.g. from Google Calendar).
const TITLE_TO_SLUG = {
  'GreenGuard Barrier Treatment': 'barrier-treatment',
  'Biogents CO2 Service - 1 Trap': 'biogents-co2-1',
  'Biogents CO2 Service - 2 Traps': 'biogents-co2-2',
  'Biogents CO2 Service - 3 Traps': 'biogents-co2-3',
  'Equipment Pickup': 'equipment-pickup',
  'Mosqitter Grand Installation': 'mosqitter-installation',
  'Mosqitter Grand Rental': 'mosqitter-rental',
  'Mosqitter Grand Service': 'mosqitter-service',
  'Mosqitter Grand Troubleshooting': 'mosqitter-troubleshoot',
  'Free Property Assessment': 'property-assessment',
  'CO2 Tank Exchange - 1 Tank': 'tank-exchange-1',
  'CO2 Tank Exchange - 2 Tanks': 'tank-exchange-2',
  'CO2 Tank Exchange - 3 Tanks': 'tank-exchange-3',
  'CO2 Tank Exchange - 4 Tanks': 'tank-exchange-4',
  'CO2 Tank Exchange - 5 Tanks': 'tank-exchange-5',
  'CO2 Tank Exchange - 6 Tanks': 'tank-exchange-6',
  'CO2 Tank Exchange - 10 Tanks': 'tank-exchange-10',
  'Tank Refill Check': 'tank-refill-check',
  '20 Pound CO2 Tank Rental': 'tank-rental',
}

function slugFromTitle(title) {
  if (!title) return null
  const cleaned = normalizeEventTitle(title)
  return TITLE_TO_SLUG[cleaned] || null
}

function parseTrailingNumber(slug, prefix) {
  if (!slug?.startsWith(prefix)) return null
  const n = parseInt(slug.slice(prefix.length), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * @param {object} booking
 * @param {string} booking.slug - Cal.com event-type slug
 * @param {object} [contact] - HubSpot contact with .properties
 * @returns {{sku: string, qty: number}[]}
 */
function prefillFromBooking(booking, contact) {
  const slug = (booking?.slug || '').trim()
  if (!slug) return []

  const props = contact?.properties || {}
  const systemType = props.system_type || ''
  const trapCount = Math.max(1, parseInt(props.trap_count || '1', 10) || 1)
  // Treat unknown system_type as owner for Mosqitter (renters book the
  // 'mosqitter-rental' event, not installation/service/troubleshoot).
  // Only an explicit 'Mosqitter-Rental' label suppresses owner-side fees.
  const isMqOwned = systemType !== 'Mosqitter-Rental'
  const isBgOwned = systemType === 'Biogents-Owned'
  // Installation is a one-time event. Once a customer's mq_installed flag is
  // true, treat any future "mosqitter-installation" booking as a service visit.
  const mqInstalled = props.mq_installed === 'true' || props.mq_installed === true

  // biogents-co2-{1,2,3}
  const bgN = parseTrailingNumber(slug, 'biogents-co2-')
  if (bgN) {
    const lines = [{ sku: `BG${bgN}`, qty: 1 }]
    if (isBgOwned) lines.push({ sku: 'BAIT', qty: trapCount })
    return lines
  }

  // tank-exchange-{N}
  const tankN = parseTrailingNumber(slug, 'tank-exchange-')
  if (tankN) {
    return [
      { sku: 'TANK-DELIVERY-FEE', qty: 1 },
      { sku: 'TANK-REFILL', qty: tankN },
    ]
  }

  if (slug === 'tank-rental') {
    return [
      { sku: 'TANK-DELIVERY-FEE', qty: 1 },
      { sku: 'TANK-REFILL', qty: 1 },
    ]
  }

  if (slug === 'mosqitter-rental') return [{ sku: 'MQ-RENT', qty: trapCount }]
  if (slug === 'mosqitter-installation') {
    if (!isMqOwned) return []
    return mqInstalled
      ? [{ sku: 'MQ-SVC', qty: trapCount }]
      : [{ sku: 'MQ-INST', qty: trapCount }]
  }
  if (slug === 'mosqitter-service') return isMqOwned ? [{ sku: 'MQ-SVC', qty: trapCount }] : []
  if (slug === 'mosqitter-troubleshoot') return isMqOwned ? [{ sku: 'MQ-TSHOOT', qty: 1 }] : []

  if (slug === 'barrier-treatment') return [{ sku: 'BARRIER', qty: 1 }]

  // No-charge events
  if (['tank-refill-check', 'equipment-pickup', 'property-assessment'].includes(slug)) return []

  return []
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
