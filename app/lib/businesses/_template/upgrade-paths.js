// Starter upgrade paths — same schema as businesses/greenguard/upgrade-paths.js

const PATHS = {
  'visit': {
    label: 'Recurring Service Visit',
    monthly: 99.00,
    features: ['Recurring scheduled visit', 'Standard service included'],
    upgrades: [
      {
        id: 'visit-add-addon', kind: 'addon', addonSku: 'ADDON',
        title: 'Add Add-On Service',
        target: { label: '+ Add-On Service', monthly: 25.00 },
        features: ['Extra service performed at each visit'],
        why: 'Bundles a common upsell into every recurring visit.',
        installRequired: false,
      },
    ],
  },
}

function detectCurrentPath({ planType }) {
  if (planType === 'visit') return 'visit'
  return 'visit'
}

module.exports = { PATHS, detectCurrentPath }
