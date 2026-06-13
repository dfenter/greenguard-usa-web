const {
  verifyToken,
  createSessionToken,
  isAdminEmail,
  isOwnerEmail,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
} = require('../../../lib/auth')
const { serialize } = require('cookie')

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { token } = req.body || {}
  if (!token) return res.status(400).json({ error: 'Token required' })

  const payload = await verifyToken(token)
  if (!payload || payload.type !== 'session') {
    return res.status(401).json({ error: 'Invalid token' })
  }

  const fresh = await createSessionToken(payload.email, payload.stripeCustomerId)
  res.setHeader('Set-Cookie', serialize(SESSION_COOKIE_NAME, fresh, SESSION_COOKIE_OPTIONS))

  const dest = isAdminEmail(payload.email)
    ? (isOwnerEmail(payload.email) ? '/admin/home' : '/admin/tech')
    : '/dashboard'

  return res.json({ ok: true, dest })
}
