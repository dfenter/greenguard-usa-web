const { getSessionFromRequest } = require('../../../lib/auth')
const { findContactByEmail, upsertContact } = require('../../../lib/hubspot')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export default async function handler(req, res) {
  const session = await getSessionFromRequest(req)
  if (!session || session.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (req.method === 'GET') {
    const { email } = req.query
    if (!email) return res.status(400).json({ error: 'email required' })

    const contact = await findContactByEmail(email).catch(() => null)
    if (!contact) return res.status(404).json({ error: 'Contact not found' })

    let markers = []
    try {
      const raw = contact.properties?.installation_map
      if (raw) markers = JSON.parse(raw).markers || []
    } catch {
      markers = []
    }

    const p = contact.properties || {}
    return res.status(200).json({
      email,
      address: p.address || null,
      markers,
    })
  }

  if (req.method === 'PUT') {
    const { email, markers = [] } = req.body || {}
    if (!email) return res.status(400).json({ error: 'email required' })

    try {
      await upsertContact({
        email,
        metadata: { installation_map: JSON.stringify({ markers }) },
      })
      return res.status(200).json({ success: true })
    } catch (err) {
      console.error('installation PUT error:', err)
      return res.status(500).json({ error: 'Failed to save' })
    }
  }

  res.status(405).end()
}
