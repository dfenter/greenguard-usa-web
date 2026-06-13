// Lawn care upgrade paths — same schema as greenguard/upgrade-paths.js

const PATHS = {
  'biweekly-mowing': {
    label: 'Bi-Weekly Lawn Mowing',
    monthly: 55.00,
    features: ['Every-other-week mow', 'Edge & blow included', 'Scheduled visit'],
    upgrades: [
      {
        id: 'biweekly-to-weekly', kind: 'tier', targetPlan: 'weekly-mowing',
        title: 'Upgrade to Weekly Mowing',
        target: { label: 'Weekly Lawn Mowing', monthly: 65.00 },
        features: ['Weekly mow, edge, and blow', 'Consistently shorter grass', 'Looks great all season'],
        why: 'Austin summers push Bermuda and St. Augustine into overdrive. Weekly cuts keep height in check and reduce weed pressure.',
        installRequired: false,
      },
      {
        id: 'biweekly-add-fertilize', kind: 'addon', addonSku: 'FERTILIZE',
        title: 'Add Fertilization Treatment',
        target: { label: '+ Fertilization Treatment', monthly: 85.00 },
        features: ['Seasonal slow-release fertilizer', 'Thicker, greener turf', 'Reduces bare spots'],
        why: 'Fertilization every 6-8 weeks fills in thin areas and keeps color vibrant through heat stress.',
        installRequired: false,
      },
      {
        id: 'biweekly-add-weed', kind: 'addon', addonSku: 'WEED-CTRL',
        title: 'Add Weed Control',
        target: { label: '+ Weed Control Treatment', monthly: 65.00 },
        features: ['Pre- and post-emergent application', 'Targets crabgrass, clover, and broadleaf weeds'],
        why: 'Weed pressure in Austin is year-round. Pre-emergent in spring and fall cuts out most of the problem before it starts.',
        installRequired: false,
      },
    ],
  },

  'weekly-mowing': {
    label: 'Weekly Lawn Mowing',
    monthly: 65.00,
    features: ['Weekly mow, edge, and blow', 'Consistent height control'],
    upgrades: [
      {
        id: 'weekly-add-fertilize', kind: 'addon', addonSku: 'FERTILIZE',
        title: 'Add Fertilization Treatment',
        target: { label: '+ Fertilization Treatment', monthly: 85.00 },
        features: ['Slow-release fertilizer every 6-8 weeks', 'Deeper green color', 'Stronger root system'],
        why: 'Pairs perfectly with weekly mowing — a fed lawn recovers faster from cuts and heat.',
        installRequired: false,
      },
      {
        id: 'weekly-add-weed', kind: 'addon', addonSku: 'WEED-CTRL',
        title: 'Add Weed Control',
        target: { label: '+ Weed Control Treatment', monthly: 65.00 },
        features: ['Pre- and post-emergent applications', 'Keeps turf dense and weed-free'],
        why: 'Dense weekly-mowed turf plus weed control is the most effective combination for a clean lawn.',
        installRequired: false,
      },
      {
        id: 'weekly-add-aeration', kind: 'addon', addonSku: 'AERATION',
        title: 'Add Core Aeration',
        target: { label: '+ Core Aeration (annual)', monthly: 120.00 },
        features: ['Breaks up compacted soil', 'Improves water and nutrient absorption', 'Best done in fall'],
        why: "Austin's clay soil compacts hard. Annual aeration is the single highest-ROI treatment for long-term lawn health.",
        installRequired: false,
      },
    ],
  },
}

function detectCurrentPath({ planType }) {
  if (planType === 'weekly-mowing') return 'weekly-mowing'
  if (planType === 'biweekly-mowing') return 'biweekly-mowing'
  return 'biweekly-mowing'
}

module.exports = { PATHS, detectCurrentPath }
