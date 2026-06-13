// Pool service subscription plan definitions — same schema as greenguard/service-plans.js

const PLANS = [
  {
    id: 'weekly-service',
    label: 'Weekly Pool Service',
    description: 'Full-service weekly visit: skimming, brushing, vacuuming, chemical check, and filter inspection.',
    monthly: 120.00,
    items: [{ sku: 'WEEKLY-SVC' }],
  },
  {
    id: 'biweekly-service',
    label: 'Bi-Weekly Pool Service',
    description: 'Every-other-week full service visit. Best for pools with lower bather load or heavy shade.',
    monthly: 80.00,
    items: [{ sku: 'BIWEEKLY-SVC' }],
  },
]

function getPlan(id) {
  return PLANS.find((p) => p.id === id) || null
}

module.exports = { PLANS, getPlan }
