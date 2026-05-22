const { stripe } = require('../../../lib/stripe')
const { createMagicToken, isAdminEmail } = require('../../../lib/auth')
const { sendMagicLink } = require('../../../lib/email')

// Rate limiting is handled upstream by middleware.js (Edge Middleware, IP-based, 5 req/15min)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email } = req.body || {}
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' })
  }

  try {
    const isAdmin = isAdminEmail(email)
    let shouldSend = isAdmin

    if (!isAdmin) {
      // Check Stripe customers and prospect whitelist
      const customers = await stripe.customers.search({ query: `email:"${email}"`, limit: 1 })
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
    console.error('request-link error:', err)
  }

  // Always return 200 — avoids enumeration of customers or infrastructure state
  res.status(200).json({ sent: true })
}
