const { stripe } = require('../../../lib/stripe')
const { createMagicToken, isAdminEmail, escapeStripeSearch } = require('../../../lib/auth')
const { sendMagicLink } = require('../../../lib/email')

// Rate limiting is handled upstream by middleware.js (Edge Middleware, IP-based, 5 req/15min)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email } = req.body || {}
  // Strict RFC-ish email check; rejects quotes/backslashes/control chars
  if (!email || !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' })
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
      await sendMagicLink(email, token)
    }
  } catch (err) {
    console.error('request-link error:', err.message)
  }

  // Always return 200 — avoids enumeration of customers or infrastructure state
  res.status(200).json({ sent: true })
}
