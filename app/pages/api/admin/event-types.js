const { getSessionFromRequest } = require('../../../lib/auth')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'
const CALCOM_API_KEY = process.env.CALCOM_API_KEY || ''
const CALCOM_BASE = `${(process.env.CALCOM_BASE_URL || 'https://cal.com').replace(/\/$/, '')}/api/v2`

export default async function handler(req, res) {
  const session = await getSessionFromRequest(req)
  if (!session || session.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden' })

  const resp = await fetch(`${CALCOM_BASE}/event-types`, {
    headers: {
      Authorization: `Bearer ${CALCOM_API_KEY}`,
      'cal-api-version': '2024-08-13',
    },
  })

  if (!resp.ok) return res.status(502).json({ error: 'Cal.com error' })

  const json = await resp.json()
  let items = json.data || []
  if (typeof items === 'object' && !Array.isArray(items)) {
    items = (items.eventTypeGroups?.[0]?.eventTypes) || []
  }

  res.status(200).json(items.map(et => ({ id: et.id, title: et.title, slug: et.slug })))
}
