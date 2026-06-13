// Lawn care service plan definitions — same schema as greenguard/service-plans.js

const PLANS = [
  {
    id: 'weekly-mowing',
    label: 'Weekly Lawn Mowing',
    description: 'Weekly mow, edge, and blow. Keeps your lawn looking sharp year-round.',
    monthly: 65.00,
    items: [{ sku: 'WEEKLY-MOW' }],
  },
  {
    id: 'biweekly-mowing',
    label: 'Bi-Weekly Lawn Mowing',
    description: 'Every-other-week mow, edge, and blow. Great for slower-growing or drought-tolerant lawns.',
    monthly: 55.00,
    items: [{ sku: 'BIWEEKLY-MOW' }],
  },
]

function getPlan(id) {
  return PLANS.find((p) => p.id === id) || null
}

module.exports = { PLANS, getPlan }
