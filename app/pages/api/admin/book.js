const { getSessionFromRequest } = require('../../../lib/auth')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'
const CALCOM_API_KEY = process.env.CALCOM_API_KEY || ''
const CALCOM_BASE = `${(process.env.CALCOM_BASE_URL || 'https://cal.com').replace(/\/$/, '')}/api/v2`
const TZ = process.env.CALENDAR_TIMEZONE || 'America/Chicago'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const session = await getSessionFromRequest(req)
  if (!session || session.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden' })

  const { eventTypeId, firstName, lastName, email, phone, address, startLocal, notes } = req.body

  if (!eventTypeId || !firstName || !email || !address || !startLocal) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  // Convert local CT datetime string to UTC ISO
  const dt = new Date(new Date(startLocal).toLocaleString('en-US', { timeZone: TZ }))
  const offsetMs = new Date(startLocal) - dt
  const utcIso = new Date(new Date(startLocal).getTime() + offsetMs).toISOString()

  const body = {
    eventTypeId: Number(eventTypeId),
    start: utcIso,
    attendee: {
      name: `${firstName} ${lastName}`.trim(),
      email,
      timeZone: TZ,
      phoneNumber: phone || undefined,
    },
    location: address,
  }
  if (notes) body.bookingFieldsResponses = { notes }

  const resp = await fetch(`${CALCOM_BASE}/bookings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CALCOM_API_KEY}`,
      'cal-api-version': '2024-08-13',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await resp.json()
  if (!resp.ok) return res.status(502).json({ error: data?.error?.message || 'Cal.com error' })

  res.status(200).json({ uid: data.data?.uid, status: 'created' })
}
