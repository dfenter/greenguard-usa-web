const { stripe } = require('../../../lib/stripe')
const { createMagicToken, isAdminEmail, escapeStripeSearch, newLoginCode, storeLoginCode } = require('../../../lib/auth')
const { sendMagicLink } = require('../../../lib/email')

// Rate limiting: the Edge middleware limits per edge-node (in-memory). This
// handler adds a GLOBAL, cross-instance limit via Vercel KV so an attacker
// hitting many edge nodes can't email-bomb a customer. No-ops if KV is unset.
async function rateLimitOk(ip, max = 5, windowSec = 900) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return true
  try {
    const key = `magic-link:${ip}`
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
    return true // fail open on KV error — availability over strictness here
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email } = req.body || {}
  // Strict RFC-ish email check; rejects quotes/backslashes/control chars
  if (!email || !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' })
  }

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() || 'unknown'
  if (!(await rateLimitOk(ip))) {
    return res.status(429).json({ error: 'Too many requests — try again in 15 minutes' })
  }

  try {
    const isAdmin = isAdminEmail(email)
    let shouldSend = isAdmin

    if (!isAdmin) {
      const customers = await stripe.customers.search({ query: `email:"${escapeStripeSearch(email)}"`, limit: 1 })
      const isCustomer = customers.data.length > 0
      const guestEmails = (process.env.GUEST_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
      const isGuest = guestEmails.includes(email.toLowerCase())
      shouldSend = isCustomer || isGuest
    }

    if (shouldSend) {
      const token = await createMagicToken(email)
      const code = newLoginCode()
      await storeLoginCode(email, code)
      await sendMagicLink(email, token, code)
    }
  } catch (err) {
    console.error('request-link error:', err.message)
  }

  // Always return 200 — avoids enumeration of customers or infrastructure state
  res.status(200).json({ sent: true })
}
