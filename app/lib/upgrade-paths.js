// Upgrade paths from each current setup to viable target setups.
//
// Each entry describes what a customer is on now (matched by current
// system_type + trap_count or by active Stripe subscription SKU) and what
// upgrades make sense to offer them. The comparison UI uses `features` to
// build the side-by-side bullet list, `delta` for the monthly-cost diff,
// and `kind` to drive which server action to run on approval:
//
//   capacity → adjust existing subscription quantity (or swap to a higher BG tier)
//   tier     → cancel current subscription + start a new one (different product line)
//   addon    → append a recurring SKU to the customer's recurring_addons + start a sub line
//
// Pricing is from sku-engine.SKU_PRICES, kept in code intentionally so it
// stays a single source of truth alongside the rounds catalog.

const PATHS = {
  // Currently on 1 Biogents trap rental
  'bg1-rental': {
    label: 'Biogents CO₂ Rental — 1 Trap',
    monthly: 159.99,
    features: ['1 trap rental', 'CO₂ tank + refills', 'Monthly service visit', 'Basic property coverage'],
    upgrades: [
      {
        id: 'bg1-to-bg2', kind: 'capacity', targetPlan: 'bg2-rental',
        title: 'Add a second trap',
        target: { label: 'Biogents CO₂ Rental — 2 Traps', monthly: 266.99 },
        features: ['2 trap rentals', 'CO₂ tank + refills', 'Doubled property coverage', 'Same monthly visit'],
        why: 'Doubles your effective coverage area. Best for ½-acre+ properties or homes with multiple outdoor zones.',
        installRequired: true,
      },
      {
        id: 'bg1-to-mqrental', kind: 'tier', targetPlan: 'mq-rental',
        title: 'Upgrade to Mosqitter Grand',
        target: { label: 'Mosqitter Grand Rental', monthly: 299.99 },
        features: ['Mosqitter Grand trap (higher-capacity)', 'Tank, hookup, bait all included', 'Stronger pest reduction in dense areas', 'Premium tier'],
        why: 'The Mosqitter Grand handles higher mosquito pressure and bigger properties than Biogents. All-in-one rental — no surprise per-visit fees.',
        installRequired: true,
      },
      {
        id: 'bg1-add-barrier', kind: 'addon', addonSku: 'BARRIER',
        title: 'Add Barrier Treatment',
        target: { label: '+ GreenGuard Barrier Treatment', monthly: 49.99 },
        features: ['Monthly barrier spray on shrubs + perimeter', 'Kills resting mosquitoes outside trap range', 'Stacks with trap rental'],
        why: 'For yards with heavy vegetation where traps alone don\'t reach. Adds a second layer of defense.',
        installRequired: false,
      },
    ],
  },

  'bg2-rental': {
    label: 'Biogents CO₂ Rental — 2 Traps',
    monthly: 266.99,
    features: ['2 trap rentals', 'CO₂ tank + refills', 'Monthly service visit'],
    upgrades: [
      {
        id: 'bg2-to-bg3', kind: 'capacity', targetPlan: 'bg3-rental',
        title: 'Add a third trap',
        target: { label: 'Biogents CO₂ Rental — 3 Traps', monthly: 399.99 },
        features: ['3 trap rentals', 'Full property coverage', 'Best volume discount per trap'],
        why: 'For homes with three distinct outdoor zones or larger acreage.',
        installRequired: true,
      },
      {
        id: 'bg2-to-mqrental', kind: 'tier', targetPlan: 'mq-rental',
        title: 'Upgrade to Mosqitter Grand',
        target: { label: 'Mosqitter Grand Rental', monthly: 299.99 },
        features: ['Single high-capacity trap replaces two Biogents', 'Lower monthly cost than current', 'Bait & maintenance included', 'Simpler setup'],
        why: 'If a Mosqitter Grand covers your property, you save vs running two Biogents — and there\'s less equipment.',
        installRequired: true,
      },
      {
        id: 'bg2-add-barrier', kind: 'addon', addonSku: 'BARRIER',
        title: 'Add Barrier Treatment',
        target: { label: '+ GreenGuard Barrier Treatment', monthly: 49.99 },
        features: ['Monthly barrier spray', 'Reaches resting mosquitoes outside trap range'],
        why: 'Adds a second layer for shaded yards.',
        installRequired: false,
      },
    ],
  },

  'mq-rental': {
    label: 'Mosqitter Grand Rental',
    monthly: 299.99,
    features: ['Mosqitter Grand trap', 'CO₂ tank + bait all included', 'Monthly service visit'],
    upgrades: [
      {
        id: 'mq-add-second', kind: 'capacity', targetPlan: 'mq-rental',
        title: 'Add a second Mosqitter',
        target: { label: 'Mosqitter Grand Rental × 2', monthly: 599.98 },
        features: ['Two Mosqitter Grand traps', 'Full property coverage', 'Recommended for 1+ acre'],
        why: 'For larger properties or homes with separated outdoor zones.',
        installRequired: true,
      },
      {
        id: 'mq-add-barrier', kind: 'addon', addonSku: 'BARRIER',
        title: 'Add Barrier Treatment',
        target: { label: '+ GreenGuard Barrier Treatment', monthly: 49.99 },
        features: ['Monthly perimeter spray', 'Catches mosquitoes outside trap zones'],
        why: 'Best for heavily landscaped yards.',
        installRequired: false,
      },
    ],
  },

  // Customer owns their own Biogents trap, rents tank+timer from us
  'biogents-owned': {
    label: 'Biogents-Owned (you own the trap)',
    monthly: 124.99,
    features: ['CO₂ Tank & Timer Rental', 'Monthly refill visit'],
    upgrades: [
      {
        id: 'own-to-rental', kind: 'tier', targetPlan: 'bg1-rental',
        title: 'Switch to full Biogents Rental',
        target: { label: 'Biogents CO₂ Rental — 1 Trap', monthly: 159.99 },
        features: ['We provide the trap (no more repairs on your dime)', 'Trap + CO₂ all-in-one', 'Equipment warranty + replacement'],
        why: 'When your owned trap starts needing repairs, switching to rental shifts the equipment risk to us. ~$35/mo more, no surprise repair bills.',
        installRequired: true,
      },
      {
        id: 'own-add-barrier', kind: 'addon', addonSku: 'BARRIER',
        title: 'Add Barrier Treatment',
        target: { label: '+ GreenGuard Barrier Treatment', monthly: 49.99 },
        features: ['Monthly barrier spray on shrubs + perimeter'],
        why: 'Catches mosquitoes outside your trap\'s active zone.',
        installRequired: false,
      },
    ],
  },
}

// Map current state → path key. Used by both admin tool and customer view.
function detectCurrentPath({ systemType, trapCount = 1, planType }) {
  const tc = parseInt(trapCount, 10) || 1
  if (systemType === 'Biogents-Owned' || planType === 'own') return 'biogents-owned'
  if (systemType === 'Mosqitter-Rental' || systemType === 'Mosqitter-Owned' || systemType === 'Mosqitter') return 'mq-rental'
  if (systemType === 'Biogents-CO2' || systemType === 'Biogents') {
    if (tc >= 3) return 'bg3-rental'
    if (tc === 2) return 'bg2-rental'
    return 'bg1-rental'
  }
  return 'bg1-rental'  // Default fallback
}

module.exports = { PATHS, detectCurrentPath }
