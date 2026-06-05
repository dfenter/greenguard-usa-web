// Public quote-link generator. Mirrors /api/admin/quote-link POST but
// without admin auth, so a self-service customer on /quote/new can mint
// the same JWT the admin builder produces, then proceed to /quote/[token]
// to pay.
//
// Rate-limited via Vercel KV (5 quotes / hour / IP). Required fields are
// the same as the admin endpoint; serverside size + tax fields are
// validated rather than trusted blindly.

const { newJti } = require('../../../lib/auth')
const { SignJWT } = require('jose')

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET)
}

async function rateLimitOk(ip) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return true
  try {
    const key = `quote-create:${ip}`
    const url = `${process.env.KV_REST_API_URL}/incr/${encodeURIComponent(key)}`
    const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } })
    const j = await r.json().catch(() => ({}))
    const count = Number(j?.result || 0)
    if (count === 1) {
      // Set TTL on first hit. Best-effort.
      await fetch(`${process.env.KV_REST_API_URL}/expire/${encodeURIComponent(key)}/3600`, {
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      }).catch(() => {})
    }
    return count <= 5
  } catch {
    return true
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() || 'unknown'
  if (!(await rateLimitOk(ip))) {
    return res.status(429).json({ error: 'Too many quote requests — try again in an hour.' })
  }

  const {
    customerName, customerEmail, customerAddress,
    serviceLines, addonLines, productLines,
    total, recurringTotal, oneTimeTotal, taxRate, taxAmount, notes,
  } = req.body || {}

  if (!customerEmail || !customerName) {
    return res.status(400).json({ error: 'customerName and customerEmail are required' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    return res.status(400).json({ error: 'Invalid email address' })
  }
  const sLines = Array.isArray(serviceLines) ? serviceLines : []
  const aLines = Array.isArray(addonLines) ? addonLines : []
  const pLines = Array.isArray(productLines) ? productLines : []
  if (sLines.length === 0 && pLines.length === 0) {
    return res.status(400).json({ error: 'No quote contents' })
  }
  const allLines = [...sLines, ...aLines, ...pLines]
  if (allLines.length > 50) return res.status(400).json({ error: 'Too many line items' })
  for (const l of allLines) {
    const amt = Number(l.amount)
    if (l.amount !== undefined && (!Number.isFinite(amt) || amt < 0 || amt > 100000)) {
      return res.status(400).json({ error: `Invalid amount on line: ${l.label || '?'}` })
    }
  }
  if (notes && String(notes).length > 5000) return res.status(400).json({ error: 'Notes too long' })
  const totals = [total, recurringTotal, oneTimeTotal, taxAmount].filter(v => v !== undefined)
  if (totals.some(v => !Number.isFinite(Number(v)) || Number(v) < 0)) {
    return res.status(400).json({ error: 'Invalid total value' })
  }

  const jti = newJti()
  const token = await new SignJWT({
    customerName, customerEmail, customerAddress,
    serviceLines: serviceLines || [],
    addonLines: addonLines || [],
    productLines: productLines || [],
    total, recurringTotal, oneTimeTotal, taxRate, taxAmount, notes,
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
