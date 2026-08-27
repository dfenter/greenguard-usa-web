const { upsertContact } = require('../../../lib/hubspot')

const ALLOWED_ORIGINS = ['https://ops.greenguard-usa.com', 
  'https://www.greenguard-usa.com',
  'https://greenguard-usa.com',
  'https://new.greenguard-usa.com',
]

// Cross-instance throttle so this unauthenticated endpoint can't be scripted to
// flood HubSpot with junk contacts. No-ops if KV is unset.
async function rateLimitOk(ip, max = 10, windowSec = 3600) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return true
  try {
    const key = `leads-sub:${ip}`
    const r = await fetch(`${process.env.KV_REST_API_URL}/incr/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    })
    const j = await r.json().catch(() => ({}))
    const count = Number(j?.result || 0)
    if (count === 1) {
      await fetch(`${process.env.KV_REST_API_URL}/expire/${encodeURIComponent(key)}/${windowSec}`, {
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      }).catch(() => {})
    }
    return count <= max
  } catch {
    return true
  }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || ''
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).end()

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() || 'unknown'
  if (!(await rateLimitOk(ip))) {
    return res.status(429).json({ error: 'Too many requests — try again later.' })
  }

  const { email, firstName, source = 'website' } = req.body || {}
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' })
  }

  try {
    await upsertContact({ email, firstName: firstName || '', source })
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('subscribe error:', err.message)
    return res.status(500).json({ error: 'Failed to save' })
  }
}
