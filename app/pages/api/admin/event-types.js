const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'
const CALCOM_API_KEY = process.env.CALCOM_API_KEY || ''
const CALCOM_BASE = `${(process.env.CALCOM_BASE_URL || 'https://cal.com').replace(/\/$/, '')}/api/v2`

// Cal.com v1 was decommissioned. v2 with cal-api-version: 2024-06-14 returns all event types
// including hidden ones when authenticated with an API key.
export default async function handler(req, res) {
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  try {
  const resp = await fetch(`${CALCOM_BASE}/event-types`, {
    headers: {
      Authorization: `Bearer ${CALCOM_API_KEY}`,
      'cal-api-version': '2024-06-14',
    },
  })

  if (!resp.ok) {
    const text = await resp.text()
    return res.status(502).json({ error: `Cal.com error ${resp.status}: ${text.slice(0, 200)}` })
  }

  const json = await resp.json()
  const data = json.data || []

  let items = []
  if (Array.isArray(data)) {
    // 2024-06-14 returns data as a flat array of event types
    items = data
  } else if (data.eventTypeGroups) {
    // Older format: grouped by profile
    items = data.eventTypeGroups.flatMap((g) => g.eventTypes || [])
  }

  res.status(200).json(
    items.map((et) => ({
      id: et.id,
      title: et.hidden ? `${et.title} (hidden)` : et.title,
      slug: et.slug,
      hidden: et.hidden || false,
      length: et.length,
    }))
  )
  } catch (err) {
    console.error('event-types error:', err)
    res.status(500).json({ error: 'Failed to fetch event types' })
  }
}
