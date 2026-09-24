const { addonsForRounds } = require('../lib/catalog')
const { prefillFromBooking } = require('../lib/sku-engine')
const {
  sectionTotal, buildLineItems, resolveCommonItems, commonItemPatch,
} = require('../lib/rounds-common-items')

// Mirrors the Services rows in pages/admin/rounds.js that matter here.
const SERVICES = [
  { label: 'CO₂ Tank Refill (per tank)', sku: 'TANK-REFILL', price: 50.00 },
  { label: 'GreenGuard Barrier Treatment', sku: 'BARRIER', price: 49.99 },
]
const ADDONS = addonsForRounds()
const SECTIONS = [
  { field: 'serviceQtys', catalog: SERVICES },
  { field: 'addonQtys', catalog: ADDONS },
]
const COMMON = resolveCommonItems(SECTIONS)
const bySku = (sku) => COMMON.find((i) => i.sku === sku)

describe('rounds common items', () => {
  test('resolves the four common items to existing catalog rows, in order', () => {
    expect(COMMON.map((i) => [i.label, i.sku, i.field])).toEqual([
      ['Generic Bait Pack', 'BAIT', 'addonQtys'],
      ['GreenGuard Barrier Treatment', 'BARRIER', 'serviceQtys'],
      ['Biogents Non-CO₂ Trap Rental', 'BG-NONCO2-RENT', 'addonQtys'],
      ['Larvicide Tablet', null, 'addonQtys'],
    ])
    // Prices come from the catalogs, not a second table.
    expect(bySku('BAIT').price).toBe(ADDONS.find((a) => a.sku === 'BAIT').price)
    expect(bySku('BARRIER').price).toBe(49.99)
  })

  test('stepper +/- writes the same qty map the dropdown uses and never goes below 0', () => {
    let state = { serviceQtys: {}, addonQtys: { 'Generic Bait Pack': 1 } }
    const apply = (item, n) => { state = { ...state, ...commonItemPatch(item, n)(state) } }
    const bait = bySku('BAIT')
    const barrier = bySku('BARRIER')
    const larv = COMMON.find((i) => i.label === 'Larvicide Tablet')
    apply(bait, 2)
    apply(barrier, 1)
    apply(larv, 3)
    apply(larv, 2)
    apply(bySku('BG-NONCO2-RENT'), -1)
    expect(state.addonQtys).toEqual({ 'Generic Bait Pack': 2, 'Larvicide Tablet': 2, 'Biogents Non-CO₂ Trap Rental': 0 })
    expect(state.serviceQtys).toEqual({ 'GreenGuard Barrier Treatment': 1 })

    const lines = [...buildLineItems(SERVICES, state.serviceQtys), ...buildLineItems(ADDONS, state.addonQtys)]
    expect(lines).toEqual([
      { label: 'GreenGuard Barrier Treatment', sku: 'BARRIER', price: 49.99, qty: 1 },
      { label: 'Generic Bait Pack', sku: 'BAIT', price: 10, qty: 2 },
      { label: 'Larvicide Tablet', sku: null, price: 4, qty: 2 },
    ])
    expect(sectionTotal(SERVICES, state.serviceQtys) + sectionTotal(ADDONS, state.addonQtys)).toBeCloseTo(49.99 + 20 + 8, 2)
  })

  test('pre-populated owner round (Ryan Wayne) defaults bait stepper to 1, others to 0', () => {
    const ryan = { properties: { system_type: 'biogents-co2', plan_type: 'tank-exchange', trap_count: '1', tank_count: '1' } }
    const prefill = prefillFromBooking({ slug: 'biogents-co2-1' }, ryan)
    // Same SKU -> catalog-row mapping the rounds page applies to prefill.
    const state = { serviceQtys: {}, addonQtys: {} }
    for (const { sku, qty } of prefill) {
      const hit = SECTIONS.flatMap((s) => s.catalog.map((c) => ({ ...c, field: s.field }))).find((c) => c.sku === sku)
      if (hit) state[hit.field][hit.label] = (state[hit.field][hit.label] || 0) + qty
    }
    expect(state.serviceQtys['CO₂ Tank Refill (per tank)']).toBe(1)
    expect(prefill.some((l) => l.sku === 'TANK-HOOKUP-MAINT')).toBe(true)
    const qtyOf = (item) => state[item.field][item.label] || 0
    expect(COMMON.map(qtyOf)).toEqual([1, 0, 0, 0])
  })
})
