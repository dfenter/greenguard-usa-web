// SKU resolution logic — ported from greenguardintegraton_system.md

const SKU_PRICES = {
  BG1: 159.99,
  BG2: 266.99,
  BG3: 399.99,
  'MQ-RENT': 299.99,
  'MQ-SVC': 129.99,
  'MQ-INST': 199.99,
  'MQ-TSHOOT': 79.99,
  'OWN-BG': 10.00,  // per trap
  'OWN-MQ': 30.00,  // per trap
  'OWN-NONCO2': 10.00,
  TANK1: 89.99,
  TANK2: 159.99,
  TANK3: 249.99,
  TANK4: 319.99,
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

const TANK_MAP = { 1: 'TANK1', 2: 'TANK2', 3: 'TANK3', 4: 'TANK4', 10: 'TANK10' }

// Service duration map in minutes
const DURATION_MAP = {
  assessment: { default: 30 },
  check: { default: 20 },
  installation: {
    'Biogents-CO2': 45,
    'Biogents-NonCO2': 45,
    Mosqitter: 90,
    'Tank-Only': 30,
    default: 45,
  },
  exchange: {
    'Tank-Only': null, // computed from tankCount below
    'Biogents-CO2': 30,
    default: 30,
  },
  troubleshoot: { Mosqitter: 60, default: 45 },
  barrier: { default: 30 },
  service: {
    'Biogents-CO2': null, // computed from trapCount below
    Mosqitter: 45,
    default: 30,
  },
}

/**
 * @param {object} visit
 * @param {string} visit.visitType - installation | exchange | assessment | troubleshoot | check | barrier | service
 * @param {string} visit.systemType - Biogents-CO2 | Biogents-NonCO2 | Mosqitter | Tank-Only
 * @param {number} [visit.trapCount]
 * @param {number} [visit.tankCount]
 * @param {string[]} [visit.addons]
 * @param {boolean} [visit.isWeekend]
 * @param {string} [visit.customerType] - rental | owned
 * @returns {string[]} array of SKU strings
 */
function resolveSKU(visit) {
  const { visitType, systemType, trapCount = 1, tankCount = 1, addons = [], isWeekend = false, customerType } = visit

  if (visitType === 'assessment') return ['ASSESS']
  if (visitType === 'check') return ['CHK']

  const skus = []

  if (systemType === 'Tank-Only') {
    skus.push(TANK_MAP[tankCount] || 'TANK1')
  } else if (systemType === 'Biogents-CO2') {
    if (trapCount <= 1) skus.push('BG1')
    else if (trapCount === 2) skus.push('BG2')
    else skus.push('BG3')
  } else if (systemType === 'Biogents-NonCO2') {
    skus.push('OWN-NONCO2')
  } else if (systemType === 'Mosqitter') {
    if (visitType === 'installation') skus.push('MQ-INST')
    else if (visitType === 'troubleshoot') skus.push('MQ-TSHOOT')
    else if (customerType === 'rental') skus.push('MQ-RENT')
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
  } else if (visitType === 'exchange' && systemType === 'Tank-Only') {
    if (tankCount <= 2) base = 30 + (tankCount - 1) * 15
    else if (tankCount <= 4) base = 60
    else base = 90
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

module.exports = { resolveSKU, resolveServiceDuration, calculateRevenue, isSubscriptionSKU, SKU_PRICES }
