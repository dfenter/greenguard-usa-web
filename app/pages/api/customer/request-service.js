const { getSessionFromRequest } = require('../../../lib/auth')
const { findContactByEmail } = require('../../../lib/hubspot')
const { sendServiceRequest } = require('../../../lib/email')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const session = await getSessionFromRequest(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })

  const { message } = req.body || {}
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message required' })
  }

  const contact = await findContactByEmail(session.email).catch(() => null)
  const p = contact?.properties || {}

  const customerInfo = {
    name: [p.firstname, p.lastname].filter(Boolean).join(' ') || null,
    email: session.email,
    address: p.address || null,
    systemType: p.system_type || null,
  }

  try {
    await sendServiceRequest(ADMIN_EMAIL, customerInfo, message.trim())
  } catch (err) {
    console.error('request-service email error:', err)
    return res.status(500).json({ error: 'Failed to send' })
  }

  res.status(200).json({ sent: true })
}
