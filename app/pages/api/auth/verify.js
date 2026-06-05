const { stripe } = require('../../../lib/stripe')
const {
  verifyToken,
  createSessionToken,
  isAdminEmail,
  isOwnerEmail,
  consumeJti,
  escapeStripeSearch,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
} = require('../../../lib/auth')
const { serialize } = require('cookie')

export default async function handler(req, res) {
  // Strip referer so the token doesn't leak to downstream pages
  res.setHeader('Referrer-Policy', 'no-referrer')

  const { token } = req.query
  if (!token) return res.status(400).json({ error: 'Token required' })

  const payload = await verifyToken(token)
  if (!payload || payload.type !== 'magic') {
    return res.redirect('/login?error=expired')
  }

  // Single-use enforcement: each magic token's jti can only be redeemed once
  if (!payload.jti) {
    return res.redirect('/login?error=expired')
  }
  const fresh = await consumeJti(payload.jti, 3600)
  if (!fresh) {
    return res.redirect('/login?error=used')
  }

  const customers = await stripe.customers.search({
    query: `email:"${escapeStripeSearch(payload.email)}"`,
    limit: 1,
  })

  const stripeCustomerId = customers.data[0]?.id || null

  const sessionToken = await createSessionToken(payload.email, stripeCustomerId)
  const cookie = serialize(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS)
  res.setHeader('Set-Cookie', cookie)

  if (!isAdminEmail(payload.email) && !stripeCustomerId) {
    return res.redirect('/prospect')
  }

  const dest = isAdminEmail(payload.email)
    ? (isOwnerEmail(payload.email) ? '/admin/home' : '/admin/tech')
    : '/dashboard'

  res.redirect(`/auth-success?next=${encodeURIComponent(dest)}`)
}
