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

  test('biogents-co2-2 owned → BG2 + BAIT × trap_count', () => {
    expect(prefillFromBooking({ slug: 'biogents-co2-2' }, bgOwned)).toEqual([
      { sku: 'BG2', qty: 1 },
      { sku: 'BAIT', qty: 2 },
    ])
  })

  test('tank-exchange-5 → delivery fee + 5 refills', () => {
    expect(prefillFromBooking({ slug: 'tank-exchange-5' }, null)).toEqual([
      { sku: 'TANK-DELIVERY-FEE', qty: 1 },
      { sku: 'TANK-REFILL', qty: 5 },
    ])
  })

  test('tank-exchange-10 → delivery fee + 10 refills', () => {
    expect(prefillFromBooking({ slug: 'tank-exchange-10' }, null)).toEqual([
      { sku: 'TANK-DELIVERY-FEE', qty: 1 },
      { sku: 'TANK-REFILL', qty: 10 },
    ])
  })

  test('mosqitter-installation, rental customer → no line items', () => {
    expect(prefillFromBooking({ slug: 'mosqitter-installation' }, mqRental)).toEqual([])
  })

  test('mosqitter-installation, owner with 2 traps → MQ-INST × 2 (Archambo case)', () => {
    expect(prefillFromBooking({ slug: 'mosqitter-installation' }, mqOwned)).toEqual([
      { sku: 'MQ-INST', qty: 2 },
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
})
