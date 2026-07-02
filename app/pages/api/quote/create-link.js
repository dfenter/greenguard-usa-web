// Public self-service quote-link generator (NO auth).
//
// SECURITY: the server RECOMPUTES every line item from the customer's
// configuration using canonical catalog pricing (lib/quote-pricing.js) and
// never trusts any client-supplied amount. A tampered request therefore cannot
// underprice a system — the only client-controlled inputs are enum selections
// and integer quantities, both validated/clamped here. Rate-limited via KV.

const { newJti } = require('../../../lib/auth')
const { buildQuoteLines } = require('../../../lib/quote-pricing')
const { SignJWT } = require('jose')

const VALID_SYSTEMS = new Set(['biogents-co2', 'biogents-nonco2', 'mosqitter', 'tank', 'none'])
const TX_TAX_RATE = 0.0825
const MAX_LINE = 100000     // $100k per line (defense in depth; real lines are far lower)
const MAX_TOTAL = 50000     // $50k per quote
const round2 = (n) => Math.round(n * 100) / 100

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET)
}

async function rateLimitOk(ip) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return true
  try {
    const key = `quote-create:${ip}`
    const r = await fetch(`${process.env.KV_REST_API_URL}/incr/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    })
    const j = await r.json().catch(() => ({}))
    const count = Number(j?.result || 0)
    if (count === 1) {
      await fetch(`${process.env.KV_REST_API_URL}/expire/${encodeURIComponent(key)}/3600`, {
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      }).catch(() => {})
    }
    return count <= 5
  } catch {
    return true
  }
}

// Accept only { label: positiveInt } maps, cap key/value counts.
function sanitizeQtys(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
  const out = {}
  let n = 0
  for (const [k, v] of Object.entries(obj)) {
    if (n++ >= 100) break
    const q = parseInt(v, 10)
    if (Number.isFinite(q) && q > 0) out[String(k).slice(0, 200)] = Math.min(q, 99)
  }
  return out
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() || 'unknown'
  if (!(await rateLimitOk(ip))) {
    return res.status(429).json({ error: 'Too many quote requests — try again in an hour.' })
  }

  const {
    customerName, customerEmail, customerAddress,
    serviceConfig, productQtys, addonQtys, serviceDate, notes,
  } = req.body || {}

  if (!customerEmail || !customerName) {
    return res.status(400).json({ error: 'customerName and customerEmail are required' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    return res.status(400).json({ error: 'Invalid email address' })
  }
  if (notes && String(notes).length > 5000) {
    return res.status(400).json({ error: 'Notes too long' })
  }

  const cfg = (serviceConfig && typeof serviceConfig === 'object' && !Array.isArray(serviceConfig)) ? serviceConfig : {}
  if (cfg.system && !VALID_SYSTEMS.has(cfg.system)) {
    return res.status(400).json({ error: 'Invalid system selection' })
  }
  if (cfg.plan && cfg.plan !== 'rental' && cfg.plan !== 'purchase') {
    return res.status(400).json({ error: 'Invalid plan selection' })
  }
  if (cfg.mqPlan && cfg.mqPlan !== 'rental' && cfg.mqPlan !== 'purchase') {
    return res.status(400).json({ error: 'Invalid Mosqitter plan selection' })
  }

  // AUTHORITATIVE recompute — every price comes from the catalog, not the client.
  const { serviceLines, productLines, addonLines } = buildQuoteLines({
    serviceConfig: cfg,
    productQtys: sanitizeQtys(productQtys),
    addonQtys: sanitizeQtys(addonQtys),
  })

  const allLines = [...serviceLines, ...productLines, ...addonLines]
  if (allLines.length === 0 || !allLines.some((l) => Number(l.amount) > 0)) {
    return res.status(400).json({ error: 'No priced items in quote' })
  }
  if (allLines.length > 60) {
    return res.status(400).json({ error: 'Too many line items' })
  }
  for (const l of allLines) {
    const amt = Number(l.amount)
    if (!Number.isFinite(amt) || amt < 0 || amt > MAX_LINE) {
      return res.status(400).json({ error: 'Computed line amount out of range' })
    }
  }

  const recurringTotal = round2(allLines.filter((l) => l.recurring).reduce((s, l) => s + (l.amount || 0), 0))
  const oneTimeTotal = round2(allLines.filter((l) => !l.recurring).reduce((s, l) => s + (l.amount || 0), 0))
  const subtotal = round2(recurringTotal + oneTimeTotal)
  if (subtotal > MAX_TOTAL) {
    return res.status(400).json({ error: 'Quote total exceeds maximum' })
  }
  const taxAmount = round2(subtotal * TX_TAX_RATE)

  const jti = newJti()
  const token = await new SignJWT({
    customerName: String(customerName).slice(0, 200),
    customerEmail,
    customerAddress: customerAddress ? String(customerAddress).slice(0, 300) : '',
    serviceLines, addonLines, productLines,
    total: subtotal, recurringTotal, oneTimeTotal,
    taxRate: TX_TAX_RATE, taxAmount,
    serviceDate: serviceDate || null,
    notes: notes ? String(notes).slice(0, 5000) : '',
    type: 'quote',
    source: 'public-self-serve',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setJti(jti)
    .setExpirationTime('30d')
    .sign(getSecret())

  const url = `${process.env.NEXT_PUBLIC_APP_URL || 'https://portal.greenguard-usa.com'}/quote/${token}`
  return res.status(200).json({ url, token, jti })
}
