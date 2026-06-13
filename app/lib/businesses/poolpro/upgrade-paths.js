// Pool service upgrade paths — same schema as greenguard/upgrade-paths.js

const PATHS = {
  'biweekly-service': {
    label: 'Bi-Weekly Pool Service',
    monthly: 80.00,
    features: ['Every-other-week visit', 'Chemical check + balance', 'Skimming + brushing', 'Filter inspection'],
    upgrades: [
      {
        id: 'biweekly-to-weekly', kind: 'tier', targetPlan: 'weekly-service',
        title: 'Upgrade to Weekly Service',
        target: { label: 'Weekly Pool Service', monthly: 120.00 },
        features: ['Weekly visits', 'Better water chemistry stability', 'Faster algae response', 'Ideal for high-bather pools'],
        why: 'Weekly visits keep pH and sanitizer levels tighter, which reduces chemical costs and algae risk over time.',
        installRequired: false,
      },
      {
        id: 'biweekly-add-chem', kind: 'addon', addonSku: 'CHEM-BAL',
        title: 'Add Chemical Balance Service',
        target: { label: '+ Chemical Balance (add-on)', monthly: 35.00 },
        features: ['pH, alkalinity, and sanitizer adjustment at every visit', 'Keeps water safer between bi-weekly visits'],
        why: 'For pools that drift in chemistry between visits due to heavy use or sun exposure.',
        installRequired: false,
      },
    ],
  },

  'weekly-service': {
    label: 'Weekly Pool Service',
    monthly: 120.00,
    features: ['Weekly visits', 'Chemical check + balance', 'Skimming + brushing', 'Filter inspection'],
    upgrades: [
      {
        id: 'weekly-add-filter', kind: 'addon', addonSku: 'FILTER-SVC',
        title: 'Add Filter Service',
        target: { label: '+ Filter Service', monthly: 45.00 },
        features: ['Deep filter element cleaning', 'Extends filter lifespan', 'Improves flow and clarity'],
        why: 'Regular filter cleaning prevents pressure buildup and keeps water crystal clear.',
        installRequired: false,
      },
      {
        id: 'weekly-add-chem', kind: 'addon', addonSku: 'CHEM-BAL',
        title: 'Add Chemical Balance Add-On',
        target: { label: '+ Chemical Balance (add-on)', monthly: 35.00 },
        features: ['pH, alkalinity, and sanitizer adjustment at every visit'],
        why: 'For pools with high bather load or shading that shifts water chemistry faster than normal.',
        installRequired: false,
      },
    ],
  },
}

function detectCurrentPath({ planType }) {
  if (planType === 'weekly-service') return 'weekly-service'
  if (planType === 'biweekly-service') return 'biweekly-service'
  return 'biweekly-service'
}

module.exports = { PATHS, detectCurrentPath }
