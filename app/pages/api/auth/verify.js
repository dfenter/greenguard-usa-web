const { stripe } = require('../../../lib/stripe')
const { verifyToken, createSessionToken, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } = require('../../../lib/auth')
const { serialize } = require('cookie')

export default async function handler(req, res) {
  const { token } = req.query

  if (!token) return res.status(400).json({ error: 'Token required' })

  const payload = await verifyToken(token)
  if (!payload || payload.type !== 'magic') {
    return res.redirect('/login?error=expired')
  }

  // Look up Stripe customer ID for the session token
  const customers = await stripe.customers.search({
    query: `email:"${payload.email}"`,
    limit: 1,
  })

  const stripeCustomerId = customers.data[0]?.id || null

  const sessionToken = await createSessionToken(payload.email, stripeCustomerId)
  const cookie = serialize(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS)
  res.setHeader('Set-Cookie', cookie)
  res.redirect('/dashboard')
}
