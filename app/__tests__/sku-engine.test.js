const {
  resolveSKU,
  resolveServiceDuration,
  calculateRevenue,
  isSubscriptionSKU,
  normalizeEventTitle,
  resolveByTitle,
  SKU_PRICES,
} = require('../lib/sku-engine')

// ── isSubscriptionSKU ─────────────────────────────────────────────────────────

describe('isSubscriptionSKU', () => {
  test.each(['BG1', 'BG2', 'BG3', 'MQ-RENT', 'MQ-SVC', 'OWN-BG', 'OWN-MQ'])(
    '%s is a subscription SKU', (sku) => expect(isSubscriptionSKU(sku)).toBe(true)
  )
  test.each(['WKD-SURCH', 'TANK1', 'TANK4', 'ASSESS', 'CHK', 'BARRIER', 'MQ-INST', 'MQ-TSHOOT'])(
    '%s is NOT a subscription SKU', (sku) => expect(isSubscriptionSKU(sku)).toBe(false)
  )
})

// ── normalizeEventTitle ───────────────────────────────────────────────────────

describe('normalizeEventTitle', () => {
  test('strips legacy "Name: " prefix', () => {
    expect(normalizeEventTitle('John Smith: One CO2 Trap Rental')).toBe('One CO2 Trap Rental')
  })
  test('strips "(GreenGuard USA)" suffix', () => {
    expect(normalizeEventTitle('One CO2 Trap Rental (GreenGuard USA)')).toBe('One CO2 Trap Rental')
  })
  test('strips both prefix and suffix', () => {
    expect(normalizeEventTitle('Jane: One CO2 Trap Rental (GreenGuard USA)')).toBe('One CO2 Trap Rental')
  })
  test('leaves clean title unchanged', () => {
    expect(normalizeEventTitle('One CO2 Trap Rental')).toBe('One CO2 Trap Rental')
  })
  test('returns empty string for falsy input', () => {
    expect(normalizeEventTitle('')).toBe('')
    expect(normalizeEventTitle(null)).toBe('')
  })
})

// ── resolveSKU ────────────────────────────────────────────────────────────────

describe('resolveSKU', () => {
  test('assessment → [ASSESS]', () => {
    expect(resolveSKU({ visitType: 'assessment' })).toEqual(['ASSESS'])
  })
  test('check → [CHK]', () => {
    expect(resolveSKU({ visitType: 'check' })).toEqual(['CHK'])
  })
  test('Biogents-CO2, 1 trap → [BG1]', () => {
    expect(resolveSKU({ visitType: 'service', systemType: 'Biogents-CO2', trapCount: 1 })).toEqual(['BG1'])
  })
  test('Biogents-CO2, 2 traps → [BG2]', () => {
    expect(resolveSKU({ visitType: 'service', systemType: 'Biogents-CO2', trapCount: 2 })).toEqual(['BG2'])
  })
  test('Biogents-CO2, 3+ traps → [BG3]', () => {
    expect(resolveSKU({ visitType: 'service', systemType: 'Biogents-CO2', trapCount: 3 })).toEqual(['BG3'])
  })
  test('Tank-Only, 4 tanks → [TANK4]', () => {
    expect(resolveSKU({ visitType: 'exchange', systemType: 'Tank-Only', tankCount: 4 })).toEqual(['TANK4'])
  })
  test('Tank-Only, unknown count → [TANK1]', () => {
    expect(resolveSKU({ visitType: 'exchange', systemType: 'Tank-Only', tankCount: 5 })).toEqual(['TANK1'])
  })
  test('Mosqitter rental → [MQ-RENT]', () => {
    expect(resolveSKU({ visitType: 'service', systemType: 'Mosqitter', customerType: 'rental' })).toEqual(['MQ-RENT'])
  })
  test('Mosqitter installation → [MQ-INST]', () => {
    expect(resolveSKU({ visitType: 'installation', systemType: 'Mosqitter' })).toEqual(['MQ-INST'])
  })
  test('Mosqitter troubleshoot → [MQ-TSHOOT]', () => {
    expect(resolveSKU({ visitType: 'troubleshoot', systemType: 'Mosqitter' })).toEqual(['MQ-TSHOOT'])
  })
  test('weekend surcharge added when isWeekend=true', () => {
    const skus = resolveSKU({ visitType: 'service', systemType: 'Biogents-CO2', trapCount: 1, isWeekend: true })
    expect(skus).toContain('WKD-SURCH')
    expect(skus).toContain('BG1')
  })
  test('known addon included in output', () => {
    const skus = resolveSKU({ visitType: 'service', systemType: 'Biogents-CO2', trapCount: 1, addons: ['BARRIER'] })
    expect(skus).toContain('BARRIER')
  })
  test('unknown addon ignored', () => {
    const skus = resolveSKU({ visitType: 'service', systemType: 'Biogents-CO2', trapCount: 1, addons: ['FAKE-SKU'] })
    expect(skus).not.toContain('FAKE-SKU')
  })
})

// ── resolveServiceDuration ────────────────────────────────────────────────────

describe('resolveServiceDuration', () => {
  test('assessment → 30 min', () => {
    expect(resolveServiceDuration({ visitType: 'assessment' })).toBe(30)
  })
  test('check → 20 min', () => {
    expect(resolveServiceDuration({ visitType: 'check' })).toBe(20)
  })
  test('Mosqitter installation → 90 min', () => {
    expect(resolveServiceDuration({ visitType: 'installation', systemType: 'Mosqitter' })).toBe(90)
  })
  test('Biogents installation → 45 min', () => {
    expect(resolveServiceDuration({ visitType: 'installation', systemType: 'Biogents-CO2' })).toBe(45)
  })
  test('BARRIER addon adds 30 min', () => {
    const base = resolveServiceDuration({ visitType: 'assessment' })
    const withBarrier = resolveServiceDuration({ visitType: 'assessment', addons: ['BARRIER'] })
    expect(withBarrier).toBe(base + 30)
  })
  test('TIMER-INSTALL addon adds 15 min', () => {
    const base = resolveServiceDuration({ visitType: 'assessment' })
    const withTimer = resolveServiceDuration({ visitType: 'assessment', addons: ['TIMER-INSTALL'] })
    expect(withTimer).toBe(base + 15)
  })
})

// ── calculateRevenue ──────────────────────────────────────────────────────────

describe('calculateRevenue', () => {
  test('BG1 = $159.99', () => {
    expect(calculateRevenue(['BG1'])).toBe(SKU_PRICES.BG1)
  })
  test('BG1 + WKD-SURCH = BG1 price + $25', () => {
    expect(calculateRevenue(['BG1', 'WKD-SURCH'])).toBe(SKU_PRICES.BG1 + 25)
  })
  test('empty array = $0', () => {
    expect(calculateRevenue([])).toBe(0)
  })
  test('ASSESS = $0 (free visit)', () => {
    expect(calculateRevenue(['ASSESS'])).toBe(0)
  })
  test('unknown SKU = $0 (not included)', () => {
    expect(calculateRevenue(['FAKE-SKU'])).toBe(0)
  })
})

// ── resolveByTitle ────────────────────────────────────────────────────────────

describe('resolveByTitle', () => {
  test('returns null for empty string', () => {
    expect(resolveByTitle('')).toBeNull()
    expect(resolveByTitle(null)).toBeNull()
  })
  test('returns null for unknown title', () => {
    expect(resolveByTitle('Completely Made Up Event')).toBeNull()
  })
  test('matched title returns object with skus and visitType', () => {
    const { EVENT_TYPES } = require('../lib/sku-engine')
    if (EVENT_TYPES.length === 0) return
    const first = EVENT_TYPES[0]
    const result = resolveByTitle(first.title)
    expect(result).not.toBeNull()
    expect(result.skus).toEqual(first.skus)
    expect(result.visitType).toBe(first.visitType)
  })
  test('title matching is case-insensitive', () => {
    const { EVENT_TYPES } = require('../lib/sku-engine')
    if (EVENT_TYPES.length === 0) return
    const first = EVENT_TYPES[0]
    const result = resolveByTitle(first.title.toUpperCase())
    expect(result).not.toBeNull()
  })
})

// ── prefillFromBooking ────────────────────────────────────────────────────────

const { prefillFromBooking } = require('../lib/sku-engine')

describe('prefillFromBooking', () => {
  const mqOwned = { properties: { system_type: 'Mosqitter-Owned', trap_count: '2' } }
  const mqRental = { properties: { system_type: 'Mosqitter-Rental', trap_count: '2' } }
  const bgOwned = { properties: { system_type: 'Biogents-Owned', trap_count: '2' } }
  const bgRental = { properties: { system_type: 'Biogents-Rental', trap_count: '2' } }

  test('biogents-co2-2 rental → BG2 only', () => {
    expect(prefillFromBooking({ slug: 'biogents-co2-2' }, bgRental)).toEqual([{ sku: 'BG2', qty: 1 }])
  })

  test('biogents-co2-2 owned trap, no recurring_addons → owner tank-swap defaults (no BG2)', () => {
    expect(prefillFromBooking({ slug: 'biogents-co2-2' }, bgOwned)).toEqual([
      { sku: 'TANK-REFILL', qty: 2 },
      { sku: 'TANK-HOOKUP-MAINT', qty: 1 },
      { sku: 'BAIT', qty: 2 },
    ])
  })

  test("biogents-co2-1 via 'Customer Rental' title, plan_type 'tank-exchange' → 1 tank + hookup + 1 bait (Ryan Wayne case)", () => {
    const { slugFromTitle } = require('../lib/sku-engine')
    const ryan = { properties: { system_type: 'biogents-co2', plan_type: 'tank-exchange', trap_count: '1', tank_count: '1' } }
    const slug = slugFromTitle('Biogents CO2 Customer Rental - 1 Trap')
    expect(slug).toBe('biogents-co2-1')
    expect(prefillFromBooking({ slug }, ryan)).toEqual([
      { sku: 'TANK-REFILL', qty: 1 },
      { sku: 'TANK-HOOKUP-MAINT', qty: 1 },
      { sku: 'BAIT', qty: 1 },
    ])
  })

  test('biogents-co2-1 owner with addons_optout BAIT → refill + hookup only', () => {
    const owner = { properties: { system_type: 'Biogents-CO2', plan_type: 'own', trap_count: '1', addons_optout: 'BAIT' } }
    expect(prefillFromBooking({ slug: 'biogents-co2-1' }, owner)).toEqual([
      { sku: 'TANK-REFILL', qty: 1 },
      { sku: 'TANK-HOOKUP-MAINT', qty: 1 },
    ])
  })

  test('biogents-co2-1 owned trap with CO2-ADDON recurring → just CO2-ADDON (Keith case)', () => {
    const keith = { properties: { system_type: 'Biogents-Owned', trap_count: '1', recurring_addons: 'CO2-ADDON' } }
    expect(prefillFromBooking({ slug: 'biogents-co2-1' }, keith)).toEqual([
      { sku: 'CO2-ADDON', qty: 1 },
    ])
  })

  test('tank-exchange-5 → 5 refills (delivery fee auto-bundled in rounds UI)', () => {
    expect(prefillFromBooking({ slug: 'tank-exchange-5' }, null)).toEqual([
      { sku: 'TANK-REFILL', qty: 5 },
    ])
  })

  test('tank-exchange-10 → 10 refills (delivery fee auto-bundled in rounds UI)', () => {
    expect(prefillFromBooking({ slug: 'tank-exchange-10' }, null)).toEqual([
      { sku: 'TANK-REFILL', qty: 10 },
    ])
  })

  // Biogents-owner defaults on a tank-exchange visit: hookup fee ON
  // (TANK-HOOKUP-MAINT present → rounds UI flips tankHookupOptIn) and one
  // generic bait pack PER TRAP.
  test("tank-exchange, Biogents owner (plan_type 'own') → refill + hookup + bait×traps", () => {
    const owner = { properties: { system_type: 'Biogents-CO2', plan_type: 'own', trap_count: '2', tank_count: '2' } }
    expect(prefillFromBooking({ slug: 'tank-exchange-2' }, owner)).toEqual([
      { sku: 'TANK-REFILL', qty: 2 },
      { sku: 'TANK-HOOKUP-MAINT', qty: 1 },
      { sku: 'BAIT', qty: 2 },
    ])
  })

  test("tank-exchange, Biogents owner via legacy plan_type 'tank-exchange' → refill + hookup + bait", () => {
    const owner = { properties: { system_type: 'biogents-co2', plan_type: 'tank-exchange', trap_count: '1', tank_count: '1' } }
    expect(prefillFromBooking({ slug: 'tank-exchange-1' }, owner)).toEqual([
      { sku: 'TANK-REFILL', qty: 1 },
      { sku: 'TANK-HOOKUP-MAINT', qty: 1 },
      { sku: 'BAIT', qty: 1 },
    ])
  })

  test('bait pack tracks TRAP count, not tank count (2 traps, 1 tank)', () => {
    const owner = { properties: { system_type: 'biogents-co2', plan_type: 'tank-exchange', trap_count: '2', tank_count: '1' } }
    expect(prefillFromBooking({ slug: 'tank-exchange-1' }, owner)).toEqual([
      { sku: 'TANK-REFILL', qty: 1 },
      { sku: 'TANK-HOOKUP-MAINT', qty: 1 },
      { sku: 'BAIT', qty: 2 },
    ])
  })

  test('tank-exchange, Biogents RENTER → refill only, no owner hookup/bait defaults', () => {
    const renter = { properties: { system_type: 'Biogents-CO2', plan_type: 'rent', trap_count: '2', tank_count: '2' } }
    expect(prefillFromBooking({ slug: 'tank-exchange-2' }, renter)).toEqual([
      { sku: 'TANK-REFILL', qty: 2 },
    ])
  })

  test('tank-exchange, non-Biogents (Tank-Only) owner → no bait pack default', () => {
    const tankOnly = { properties: { system_type: 'TANK1', plan_type: 'tank-exchange', trap_count: '1', tank_count: '1' } }
    expect(prefillFromBooking({ slug: 'tank-exchange-1' }, tankOnly)).toEqual([
      { sku: 'TANK-REFILL', qty: 1 },
    ])
  })

  test('addons_optout suppresses the Biogents-owner hookup/bait defaults', () => {
    const owner = { properties: { system_type: 'biogents-co2', plan_type: 'tank-exchange', trap_count: '2', tank_count: '2', addons_optout: 'TANK-HOOKUP-MAINT,BAIT' } }
    expect(prefillFromBooking({ slug: 'tank-exchange-2' }, owner)).toEqual([
      { sku: 'TANK-REFILL', qty: 2 },
    ])
  })

  test('mosqitter-installation, rental customer → no line items', () => {
    expect(prefillFromBooking({ slug: 'mosqitter-installation' }, mqRental)).toEqual([])
  })

  test('mosqitter-installation, owner with 2 traps, NOT yet installed → MQ-INST × 2', () => {
    expect(prefillFromBooking({ slug: 'mosqitter-installation' }, mqOwned)).toEqual([
      { sku: 'MQ-INST', qty: 2 },
    ])
  })

  test('mosqitter-installation, owner already installed → MQ-SVC × trap_count (no second install fee)', () => {
    const installed = { properties: { ...mqOwned.properties, mq_installed: 'true' } }
    expect(prefillFromBooking({ slug: 'mosqitter-installation' }, installed)).toEqual([
      { sku: 'MQ-SVC', qty: 2 },
    ])
  })

  test('mosqitter-rental → MQ-RENT × trap_count regardless of system_type', () => {
    expect(prefillFromBooking({ slug: 'mosqitter-rental' }, mqRental)).toEqual([{ sku: 'MQ-RENT', qty: 2 }])
  })

  test('mosqitter-troubleshoot owned → qty 1', () => {
    expect(prefillFromBooking({ slug: 'mosqitter-troubleshoot' }, mqOwned)).toEqual([{ sku: 'MQ-TSHOOT', qty: 1 }])
  })

  test('mosqitter-troubleshoot rental → empty', () => {
    expect(prefillFromBooking({ slug: 'mosqitter-troubleshoot' }, mqRental)).toEqual([])
  })

  test('barrier-treatment → BARRIER × 1', () => {
    expect(prefillFromBooking({ slug: 'barrier-treatment' }, null)).toEqual([{ sku: 'BARRIER', qty: 1 }])
  })

  test('property-assessment → no charge', () => {
    expect(prefillFromBooking({ slug: 'property-assessment' }, mqOwned)).toEqual([])
  })

  test('equipment-pickup → no charge', () => {
    expect(prefillFromBooking({ slug: 'equipment-pickup' }, mqOwned)).toEqual([])
  })

  test('missing trap_count defaults to 1', () => {
    expect(prefillFromBooking({ slug: 'mosqitter-rental' }, { properties: {} })).toEqual([{ sku: 'MQ-RENT', qty: 1 }])
  })

  test('unknown slug → empty', () => {
    expect(prefillFromBooking({ slug: 'gibberish-event' }, mqOwned)).toEqual([])
  })

  test('recurring_addons appended to billable visit (Keith case)', () => {
    const keith = { properties: { system_type: 'Biogents-CO2', trap_count: '1', recurring_addons: 'CO2-ADDON' } }
    expect(prefillFromBooking({ slug: 'biogents-co2-1' }, keith)).toEqual([
      { sku: 'BG1', qty: 1 },
      { sku: 'CO2-ADDON', qty: 1 },
    ])
  })

  test('recurring_addons NOT appended to no-charge events', () => {
    const c = { properties: { recurring_addons: 'CO2-ADDON,BARRIER' } }
    expect(prefillFromBooking({ slug: 'property-assessment' }, c)).toEqual([])
    expect(prefillFromBooking({ slug: 'equipment-pickup' }, c)).toEqual([])
  })

  test('recurring_addons skips SKUs already present in base', () => {
    const c = { properties: { recurring_addons: 'BARRIER' } }
    expect(prefillFromBooking({ slug: 'barrier-treatment' }, c)).toEqual([
      { sku: 'BARRIER', qty: 1 },
    ])
  })
})

describe('slugFromTitle count-agnostic GCal titles', () => {
  const { slugFromTitle, prefillFromBooking } = require('../lib/sku-engine')
  const owner = { properties: { system_type: 'biogents-co2', plan_type: 'tank-exchange', trap_count: '3' } }
  const pf = (title, c) => prefillFromBooking({ slug: slugFromTitle(title) }, c)

  test('lowercase "2 tanks" maps to tank-exchange-2 with owner defaults', () => {
    expect(slugFromTitle('CO2 Tank Exchange - 2 tanks')).toBe('tank-exchange-2')
    expect(pf('CO2 Tank Exchange - 2 tanks', owner)).toEqual([
      { sku: 'TANK-REFILL', qty: 2 },
      { sku: 'TANK-HOOKUP-MAINT', qty: 1 },
      { sku: 'BAIT', qty: 3 },
    ])
  })

  test('"17 tanks" maps to tank-exchange-17', () => {
    expect(slugFromTitle('Chris Spinks: CO2 Tank Exchange - 17 tanks')).toBe('tank-exchange-17')
    expect(pf('CO2 Tank Exchange - 17 tanks', owner)[0]).toEqual({ sku: 'TANK-REFILL', qty: 17 })
  })

  test('"1 tank" (singular, lowercase) maps to tank-exchange-1', () => {
    expect(slugFromTitle('co2 tank exchange - 1 tank')).toBe('tank-exchange-1')
    expect(pf('CO2 Tank Exchange - 1 tank', null)).toEqual([{ sku: 'TANK-REFILL', qty: 1 }])
  })

  test('"Biogents CO2 Service - 4 Traps" renter gets BG4, not BG3', () => {
    expect(slugFromTitle('Biogents CO2 Service - 4 Traps')).toBe('biogents-co2-4')
    const renter = { properties: { system_type: 'BG1', plan_type: '', trap_count: '4' } }
    expect(pf('Biogents CO2 Service - 4 Traps', renter)).toEqual([{ sku: 'BG4', qty: 1 }])
    expect(SKU_PRICES.BG4).toBe(500)
  })

  test('traps beyond the largest package cap at BG4 with an explicit note', () => {
    const lines = pf('biogents co2 service - 6 traps', { properties: { system_type: 'Biogents-CO2', plan_type: 'rent' } })
    expect(lines).toHaveLength(1)
    expect(lines[0].sku).toBe('BG4')
    expect(lines[0].note).toMatch(/6 traps/)
  })

  test('existing exact titles and slugs unchanged', () => {
    expect(slugFromTitle('CO2 Tank Exchange - 10 Tanks')).toBe('tank-exchange-10')
    expect(slugFromTitle('Biogents CO2 Service - 2 Traps')).toBe('biogents-co2-2')
    expect(slugFromTitle('Two -20 pound CO2 Tank Exchange Delivery Service')).toBe('tank-exchange-2')
    expect(prefillFromBooking({ slug: 'biogents-co2-3' }, { properties: { system_type: 'Biogents-CO2', plan_type: 'rent' } }))
      .toEqual([{ sku: 'BG3', qty: 1 }])
  })
})

describe('Biogents owner bait: explicit trap_count 0 vs blank', () => {
  const { prefillFromBooking: pfb, prefillFromContact: pfc } = require('../lib/sku-engine')
  const zero = { properties: { system_type: 'biogents-co2', plan_type: 'tank-exchange', trap_count: '0', tank_count: '3' } }
  const blank = { properties: { system_type: 'biogents-co2', plan_type: 'tank-exchange', tank_count: '3' } }
  const noBait = [{ sku: 'TANK-REFILL', qty: 3 }, { sku: 'TANK-HOOKUP-MAINT', qty: 1 }]
  const withBait = [...noBait, { sku: 'BAIT', qty: 1 }]

  test('tank-exchange-N: trap_count 0 -> no bait, hookup kept', () => {
    expect(pfb({ slug: 'tank-exchange-3' }, zero)).toEqual(noBait)
  })
  test('tank-exchange-N: blank trap_count -> assume 1 bait', () => {
    expect(pfb({ slug: 'tank-exchange-3' }, blank)).toEqual(withBait)
  })
  test('biogents-co2-N owner: trap_count 0 -> no bait', () => {
    expect(pfb({ slug: 'biogents-co2-1' }, zero)).toEqual(noBait)
  })
  test('biogents-co2-N owner: blank trap_count -> assume 1 bait', () => {
    expect(pfb({ slug: 'biogents-co2-1' }, blank)).toEqual(withBait)
  })
  test('prefillFromContact: trap_count 0 -> no bait, blank -> 1 bait', () => {
    expect(pfc(zero)).toEqual(noBait)
    expect(pfc(blank)).toEqual(withBait)
  })
})
