const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { SignJWT, jwtVerify } = require('jose')

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET)
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    // Generate shareable quote link
    const session = await getSessionFromRequest(req)
    if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

    const { customerName, customerEmail, customerAddress, serviceLines, addonLines, productLines, total, recurringTotal, oneTimeTotal, notes } = req.body || {}

    const token = await new SignJWT({
      customerName, customerEmail, customerAddress,
      serviceLines, addonLines, productLines,
      total, recurringTotal, oneTimeTotal, notes,
      type: 'quote',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(getSecret())

    const url = `${process.env.NEXT_PUBLIC_APP_URL || 'https://portal.greenguard-usa.com'}/quote/${token}`
    return res.status(200).json({ url })
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
