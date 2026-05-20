const { stripe } = require('../../../lib/stripe')
const { createMagicToken } = require('../../../lib/auth')
const { sendMagicLink } = require('../../../lib/email')

const rateLimitMap = new Map()
function checkRateLimit(email) {
  const now = Date.now()
  const entry = rateLimitMap.get(email)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(email, { count: 1, resetAt: now + 15 * 60 * 1000 })
    return true
  }
  if (entry.count >= 5) return false
  entry.count++
  return true
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email } = req.body || {}
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' })
  }

  if (!checkRateLimit(email)) {
    return res.status(429).json({ error: 'Too many requests — try again in 15 minutes' })
  }

  // Verify the email belongs to a known Stripe customer before sending a link.
  // This prevents magic links being sent to arbitrary addresses.
  const customers = await stripe.customers.search({
    query: `email:"${email}"`,
    limit: 1,
  })

  if (customers.data.length === 0) {
    // Return 200 with same message to avoid email enumeration
    return res.status(200).json({ sent: true })
  }

  const token = await createMagicToken(email)
  await sendMagicLink(email, token)

  res.status(200).json({ sent: true })
}
