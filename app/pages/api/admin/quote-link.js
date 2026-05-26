const { requireAdmin, newJti } = require('../../../lib/auth')
const { SignJWT, jwtVerify } = require('jose')

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET)
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    // Generate shareable quote link
    const session = await requireAdmin(req, res)
    if (!session) return

    const { customerName, customerEmail, customerAddress, serviceLines, addonLines, productLines, total, recurringTotal, oneTimeTotal, taxRate, taxAmount, notes } = req.body || {}

    // jti uniquely identifies this quote version. If admin re-issues a quote
    // for the same customer, the old jti is still valid until expiry — that's
    // fine since the new one has different amounts. Checkout consumes the jti
    // so a paid quote can't be replayed.
    const jti = newJti()

    const token = await new SignJWT({
      customerName, customerEmail, customerAddress,
      serviceLines, addonLines, productLines,
      total, recurringTotal, oneTimeTotal, taxRate, taxAmount, notes,
      type: 'quote',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setJti(jti)
      .setExpirationTime('30d')
      .sign(getSecret())

    const url = `${process.env.NEXT_PUBLIC_APP_URL || 'https://portal.greenguard-usa.com'}/quote/${token}`
    return res.status(200).json({ url, token, jti })
  }

  if (req.method === 'GET') {
    // Verify and decode a quote token (public — no auth required)
    const { token } = req.query
    if (!token) return res.status(400).json({ error: 'token required' })
    try {
      const { payload } = await jwtVerify(token, getSecret())
      if (payload.type !== 'quote') return res.status(400).json({ error: 'Invalid token' })
      return res.status(200).json(payload)
    } catch {
      return res.status(400).json({ error: 'Invalid or expired quote link' })
    }
  }

  res.status(405).end()
}
