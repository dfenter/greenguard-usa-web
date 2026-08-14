// Canonical pricing for the guided quote builder — the SINGLE source of truth.
//
// Used by BOTH:
//   - pages/quote/new.js (client) to build the quote line items, and
//   - pages/api/quote/create-link.js (server) to VALIDATE that a public,
//     self-service quote's line amounts weren't tampered with.
//
// The public /api/quote/create-link endpoint has no auth, so it must never
// trust client-supplied prices. Every legitimate line amount the builder can
// produce is enumerated here; anything else is rejected server-side.

const { SKU_PRICES } = require('./sku-engine')
const { productsForQuote, addonsForQuote } = require('./catalog')

// Per-trap pricing for Biogents CO₂ rental (volume discount at 4+; extends to
// 10 traps to cover the admin builder's larger commercial quotes)
const BG_RENTAL_PRICE = { 1: 159.99, 2: 266.99, 3: 399.99, 4: 500, 5: 625, 6: 750, 7: 875, 8: 1000, 9: 1125, 10: 1250 }
// Hookup & maintenance fee, per trap
const BG_HOOKUP_PER_TRAP = 10.00
// Biogents Non-CO₂ (customer owns trap), per trap
const BG_NONCO2_PER_TRAP = 10.00
// Starter package — WE rent the non-CO₂ trap (no tanks), per trap
const STARTER_NONCO2_PER_TRAP = 49.99
// Mosqitter — all-in service / rental / install
const MQ_PRICE = { rental: 299.99, service: 129.99, install: 199.99 }
// CO₂ tank exchange — 20lb tanks ($39 delivery + $49.99/tank, tiered 1–3)
const TANK_PRICE = { 1: 89.99, 2: 139.99, 3: 189.99 }
const TANK_EXT_PER_TANK = 49.99  // per-tank cost beyond 3 tanks

const MAX_QTY = 24

// Build the set (in integer cents) of every line amount the guided builder
// can legitimately produce. Kept generous on quantity so a valid quote is
// never rejected; the point is only to exclude arbitrary/undervalued amounts.
function allowedAmountCents() {
  const set = new Set([0]) // $0 assessment line
  const add = (dollars) => {
    if (Number.isFinite(dollars) && dollars >= 0) set.add(Math.round(dollars * 100))
  }

  // Per-unit priced items × quantity
  const unitPrices = [
    ...Object.values(SKU_PRICES),
    ...productsForQuote().map((p) => p.price).filter((v) => v != null),
    ...addonsForQuote().map((a) => a.price).filter((v) => v != null),
    MQ_PRICE.rental, MQ_PRICE.service, MQ_PRICE.install,
    BG_NONCO2_PER_TRAP, BG_HOOKUP_PER_TRAP, TANK_EXT_PER_TANK,
    // quote-local one-time services (installs / maintenance / troubleshoot)
    80.00, 29.99, 10.00, 20.00, 30.00, 79.99,
  ]
  for (const p of unitPrices) {
    for (let q = 1; q <= MAX_QTY; q++) add(p * q)
  }

  // Biogents CO₂ rental package totals (already trap-count totals)
  for (const v of Object.values(BG_RENTAL_PRICE)) add(v)

  // Tank exchange totals + the combined "tank + hookup" single line, incl.
  // the extension formula beyond 3 tanks used by the builder.
  for (let n = 1; n <= MAX_QTY; n++) {
    const tank = TANK_PRICE[n] || (TANK_PRICE[3] + (n - 3) * TANK_EXT_PER_TANK)
    add(tank)
    add(tank + BG_HOOKUP_PER_TRAP * n)
  }
  return set
}

let _allowed = null
function isAllowedQuoteAmount(dollars) {
  if (_allowed === null) _allowed = allowedAmountCents()
  const cents = Math.round(Number(dollars) * 100)
  if (!Number.isFinite(cents) || cents < 0) return false
  if (cents === 0) return true // exact $0 line (e.g. free assessment)
  // ±1¢ tolerance for float rounding, but never bridge to the $0 entry —
  // otherwise a tampered $0.01 line would validate.
  return [cents - 1, cents, cents + 1].some((c) => c > 0 && _allowed.has(c))
}

// ── Authoritative line builders ─────────────────────────────────────────────
// The ONE definition of how a quote's line items are produced, shared by the
// client preview (pages/quote/new.js) and the server (create-link.js). The
// server rebuilds lines from the config alone and never trusts client amounts.

// Quote-only one-time services (installs / maintenance / troubleshoot) that
// aren't surfaced in rounds/inventory.
const QUOTE_LOCAL_SERVICES = [
  { label: 'Trap Installation',          price: 80.00, category: 'One-Time Services' },
  { label: 'Timer Installation',         price: 29.99, category: 'One-Time Services' },
  { label: 'Trap Maintenance (1 trap)',  price: 10.00, category: 'One-Time Services' },
  { label: 'Trap Maintenance (2 traps)', price: 20.00, category: 'One-Time Services' },
  { label: 'Trap Maintenance (3 traps)', price: 30.00, category: 'One-Time Services' },
  { label: 'Assessment',                 price:  0.00, category: 'One-Time Services' },
  { label: 'Troubleshoot',               price: 79.99, category: 'One-Time Services' },
]
function serviceAddons() { return [...addonsForQuote(), ...QUOTE_LOCAL_SERVICES] }

function _clampInt(v, lo, hi, dflt) {
  const n = parseInt(v, 10)
  if (!Number.isFinite(n)) return dflt
  return Math.max(lo, Math.min(hi, n))
}

// Guided-configurator service lines. Prices come only from the constants above.
function buildServiceLines(cfg = {}) {
  const { system, plan, onTankService, mqPlan, mqInstall, tankHookup } = cfg
  // Cap 20 — matches the admin builder's count dropdown (raised from 12 for
  // large commercial quotes); MAX_QTY=24 keeps every ×20 amount in the allowlist.
  const tc = _clampInt(cfg.trapCount, 1, 20, 1)
  const mq = _clampInt(cfg.mqCount, 1, 20, 1)
  const tk = _clampInt(cfg.tankCount, 1, 20, 2)
  const lines = []

  if (system === 'biogents-co2' && plan === 'rental' && BG_RENTAL_PRICE[tc]) {
    const price = BG_RENTAL_PRICE[tc]
    lines.push({ label: `Biogents CO₂ Customer Rental — ${tc} Trap${tc > 1 ? 's' : ''} ($${(price / tc).toFixed(2)}/trap)`, amount: price, recurring: true })
  }
  if (system === 'biogents-co2' && plan === 'purchase') {
    const tankPrice = TANK_PRICE[tc] || (TANK_PRICE[3] + (tc - 3) * TANK_EXT_PER_TANK)
    lines.push({ label: `Monthly CO₂ Tank Exchange — ${tc}× 20lb Tank${tc > 1 ? 's' : ''}`, amount: tankPrice, recurring: true })
    if (onTankService === true) {
      lines.push({ label: `Tank Hookup & Maintenance — ${tc} trap${tc > 1 ? 's' : ''}`, amount: BG_HOOKUP_PER_TRAP * tc, recurring: true })
    }
  }
  if (system === 'biogents-nonco2') {
    if (plan === 'rental') {
      lines.push({ label: `Starter Non-CO₂ Trap Rental — ${tc} Trap${tc > 1 ? 's' : ''} ($${STARTER_NONCO2_PER_TRAP}/trap)`, amount: STARTER_NONCO2_PER_TRAP * tc, recurring: true })
    } else {
      lines.push({ label: `Biogents Non-CO₂ Maintenance — ${tc} Trap${tc > 1 ? 's' : ''} ($${BG_NONCO2_PER_TRAP}/trap)`, amount: BG_NONCO2_PER_TRAP * tc, recurring: true })
    }
  }
  if (system === 'mosqitter' && (mqPlan === 'rental' || mqPlan === 'purchase')) {
    const unitPrice = mqPlan === 'rental' ? MQ_PRICE.rental : MQ_PRICE.service
    const label = mqPlan === 'rental'
      ? `Mosqitter Grand Customer Rental ×${mq} — trap, hookup, bait & maintenance`
      : `Mosqitter Service ×${mq} — hookup, bait & maintenance included`
    lines.push({ label, amount: unitPrice * mq, recurring: true })
    if (mqInstall) lines.push({ label: `Mosqitter Installation ×${mq}`, amount: MQ_PRICE.install * mq, recurring: false })
  }
  if (system === 'tank' && TANK_PRICE[tk]) {
    const hookupPrice = tankHookup ? (BG_HOOKUP_PER_TRAP * tk) : 0
    lines.push({
      label: tankHookup
        ? `CO₂ Tank Exchange — ${tk}× 20lb Tank${tk > 1 ? 's' : ''} (includes hookup & maintenance)`
        : `CO₂ Tank Exchange — ${tk}× 20lb Tank${tk > 1 ? 's' : ''} ($39 delivery + $49.99/tank)`,
      amount: TANK_PRICE[tk] + hookupPrice,
      recurring: true,
    })
  }
  return lines
}

// Turn a { label: qty } selection into priced lines, using ONLY catalog prices.
function _qtyLines(catalog, qtys, isRecurring) {
  const byLabel = new Map(catalog.map((c) => [c.label, c]))
  const out = []
  for (const [label, rawQty] of Object.entries(qtys || {})) {
    const item = byLabel.get(label)
    if (!item || item.price == null) continue
    const q = _clampInt(rawQty, 0, 99, 0)
    if (q <= 0) continue
    out.push({ label: q > 1 ? `${item.label} ×${q}` : item.label, amount: item.price * q, recurring: isRecurring(item) })
  }
  return out
}
function buildProductLines(productQtys = {}) {
  return _qtyLines(productsForQuote(), productQtys, () => false)
}
function buildAddonLines(addonQtys = {}) {
  return _qtyLines(serviceAddons(), addonQtys, (a) => a.category === 'Recurring Add-Ons')
}

// Full authoritative recomputation from a config + selections. The server calls
// this and ignores any client-supplied amounts entirely.
function buildQuoteLines({ serviceConfig, productQtys, addonQtys } = {}) {
  return {
    serviceLines: buildServiceLines(serviceConfig || {}),
    productLines: buildProductLines(productQtys || {}),
    addonLines: buildAddonLines(addonQtys || {}),
  }
}

// ── Dual-option quotes (rental vs purchase) ─────────────────────────────────
// Every quote for a two-plan system carries BOTH options so the customer can
// compare and pick one at acceptance time. Built here (shared client/server)
// so the on-screen comparison, the emailed quote, and the amount billed at
// checkout are always the same numbers.

const DUAL_PLAN_SYSTEMS = new Set(['biogents-co2', 'biogents-nonco2', 'mosqitter'])
const TX_TAX_RATE = 0.0825
const round2 = (n) => Math.round(n * 100) / 100

// Local delivery = Austin metro (786xx / 787xx ZIPs — same rule as the shop
// checkout). Local customers get free delivery; everyone else pays the
// per-item catalog shipping rates on shipped equipment.
function isLocalDeliveryAddress(address) {
  return /\b78[67]\d{2}(-\d{4})?\b/.test(String(address || ''))
}

// Per-item shipping (catalog `shipping` per unit) for a { label: qty } map.
function shippingForQtys(productQtys = {}) {
  const byLabel = new Map(productsForQuote().map((p) => [p.label, p]))
  let s = 0
  for (const [label, qty] of Object.entries(productQtys)) {
    const item = byLabel.get(label)
    if (item && item.shipping > 0) s += item.shipping * _clampInt(qty, 0, 99, 0)
  }
  return round2(s)
}

// First available service date = today + 5 days (ISO YYYY-MM-DD, local TZ).
// The quote no longer asks the customer to pick a date — it commits to the
// earliest slot and we confirm scheduling after acceptance.
function firstAvailableServiceDate() {
  const d = new Date()
  d.setDate(d.getDate() + 5)
  return d.toLocaleDateString('en-CA')
}

// Equipment the PURCHASE option always includes, per unit. Server-authoritative:
// the purchase option is never sent without the hardware that makes it work.
function purchaseEquipment(cfg = {}) {
  const { system } = cfg
  const tc = _clampInt(cfg.trapCount, 1, 20, 1)
  const mq = _clampInt(cfg.mqCount, 1, 20, 1)
  if (system === 'biogents-co2') {
    return {
      productQtys: { 'Biogents BG-Mosquitaire': tc, 'Biogents Timer': tc, 'CO₂ Tank — 20lb (empty)': tc },
      addonQtys: { 'Generic Bait Pack': tc },
    }
  }
  if (system === 'biogents-nonco2') {
    return { productQtys: { 'Biogents Non-CO₂ Trap': tc }, addonQtys: {} }
  }
  if (system === 'mosqitter') {
    return { productQtys: { 'Mosqitter Grand': mq }, addonQtys: {} }
  }
  return { productQtys: {}, addonQtys: {} }
}

function _mergeQtys(a = {}, b = {}) {
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] || 0) + v
  return out
}

function _optionTotals(serviceLines, productLines, addonLines, shippingTotal = 0) {
  const all = [...serviceLines, ...productLines, ...addonLines]
  const recurringTotal = round2(all.filter((l) => l.recurring).reduce((s, l) => s + (l.amount || 0), 0))
  const oneTimeTotal = round2(all.filter((l) => !l.recurring).reduce((s, l) => s + (l.amount || 0), 0))
  const subtotal = round2(recurringTotal + oneTimeTotal)
  // Shipping is added after tax — TX delivery charges are exempt.
  const taxAmount = round2(subtotal * TX_TAX_RATE)
  return {
    serviceLines, productLines, addonLines,
    recurringTotal, oneTimeTotal, subtotal, taxAmount,
    shippingTotal: round2(shippingTotal),
    total: round2(subtotal + taxAmount + shippingTotal),
  }
}

// Build BOTH plan options for a two-plan system. Customer-picked extra
// products/add-ons apply to both; purchase equipment is added only to the
// purchase option. onTankService is forced TRUE — every purchase customer is
// on our CO₂ tank service, so hookup & maintenance is always included.
// Returns null for single-plan systems ('tank', 'none') — those keep the
// classic single-option quote shape.
// localDelivery: Austin-metro customers ship free ("Free Local Delivery");
// everyone else pays catalog per-item shipping on shipped equipment.
function buildQuoteOptions({ serviceConfig, productQtys, addonQtys, localDelivery = true } = {}) {
  const cfg = serviceConfig || {}
  if (!DUAL_PLAN_SYSTEMS.has(cfg.system)) return null

  const rentalCfg = { ...cfg, plan: 'rental', mqPlan: 'rental', onTankService: true }
  const rental = _optionTotals(
    buildServiceLines(rentalCfg),
    buildProductLines(productQtys || {}),
    buildAddonLines(addonQtys || {}),
    localDelivery ? 0 : shippingForQtys(productQtys || {}),
  )

  const equip = purchaseEquipment(cfg)
  const purchaseCfg = { ...cfg, plan: 'purchase', mqPlan: 'purchase', onTankService: true }
  const purchaseQtys = _mergeQtys(productQtys, equip.productQtys)
  const purchase = _optionTotals(
    buildServiceLines(purchaseCfg),
    buildProductLines(purchaseQtys),
    buildAddonLines(_mergeQtys(addonQtys, equip.addonQtys)),
    localDelivery ? 0 : shippingForQtys(purchaseQtys),
  )

  return { rental, purchase, localDelivery: localDelivery === true }
}

module.exports = {
  BG_RENTAL_PRICE, BG_HOOKUP_PER_TRAP, BG_NONCO2_PER_TRAP, STARTER_NONCO2_PER_TRAP, MQ_PRICE, TANK_PRICE,
  QUOTE_LOCAL_SERVICES, serviceAddons,
  buildServiceLines, buildProductLines, buildAddonLines, buildQuoteLines,
  buildQuoteOptions, purchaseEquipment, firstAvailableServiceDate, DUAL_PLAN_SYSTEMS,
  isLocalDeliveryAddress, shippingForQtys,
  allowedAmountCents, isAllowedQuoteAmount,
}
