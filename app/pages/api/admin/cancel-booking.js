const { getSessionFromRequest } = require('../../../lib/auth')
const { cancelBooking } = require('../../../lib/calcom')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || session.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden' })

  const { bookingId, reason } = req.body || {}
  if (!bookingId) return res.status(400).json({ error: 'bookingId required' })

  await cancelBooking(bookingId, reason || 'Cancelled by admin')
  res.status(200).json({ ok: true })
}
