// Starter service plan definitions — same schema as businesses/greenguard/service-plans.js

const PLANS = [
  {
    id: 'visit',
    label: 'Recurring Service Visit',
    description: 'Recurring visit on your chosen cadence.',
    monthly: 99.00,
    items: [{ sku: 'VISIT' }],
  },
]

function getPlan(id) {
  return PLANS.find((p) => p.id === id) || null
}

module.exports = { PLANS, getPlan }
