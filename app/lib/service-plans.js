// Service plan templates. Each plan ties a friendly name to one or more
// recurring Stripe price IDs. Starting a plan creates a Stripe subscription
// on the customer for those prices, which then auto-charges monthly (or
// emails the hosted invoice link if no card is on file).
//
// quantity is per-line, not per-plan. For multi-trap customers, the API
// caller scales quantity at subscription time (e.g. Mosqitter Rental × 2
// for a customer with two units).

const PLANS = [
  {
    id: 'bg1-rental',
    label: 'Biogents CO₂ Rental — 1 Trap',
    description: 'Full Biogents trap + CO₂ supply, monthly service visits included.',
    monthly: 159.99,
    items: [{ sku: 'BG1' }],
  },
  {
    id: 'bg2-rental',
    label: 'Biogents CO₂ Rental — 2 Traps',
    description: 'Two-trap Biogents rental at volume discount.',
    monthly: 266.99,
    items: [{ sku: 'BG2' }],
  },
  {
    id: 'bg3-rental',
    label: 'Biogents CO₂ Rental — 3 Traps',
    description: 'Three-trap Biogents rental at deeper volume discount.',
    monthly: 399.99,
    items: [{ sku: 'BG3' }],
  },
  {
    id: 'mq-rental',
    label: 'Mosqitter Grand Rental',
    description: 'Mosqitter Grand all-in-one rental — trap, hookup, bait, maintenance.',
    monthly: 299.99,
    items: [{ sku: 'MQ-RENT' }],
    // Quantity scales: a 2-Mosqitter customer pays 2× this plan.
    perUnit: true,
    unitLabel: 'Mosqitters',
  },
  {
    id: 'co2-tank-rental',
    label: 'CO₂ Tank & Timer Rental',
    description: 'Monthly tank + timer rental on top of an owned-trap setup.',
    monthly: 124.99,
    items: [{ sku: 'CO2-ADDON' }],
  },
]

function getPlan(id) {
  return PLANS.find((p) => p.id === id) || null
}

module.exports = { PLANS, getPlan }
