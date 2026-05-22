const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'
const CALCOM_API_KEY = process.env.CALCOM_API_KEY || ''
const CALCOM_BASE = 'https://api.cal.com/v2'
const TZ = process.env.CALENDAR_TIMEZONE || 'America/Chicago'

async function createOneBooking(eventTypeId, firstName, lastName, email, address, utcIso, notes) {
  const body = {
    eventTypeId: Number(eventTypeId),
    start: utcIso,
    attendee: {
      name: `${firstName} ${lastName}`.trim(),
      email,
      timeZone: TZ,
    },
    location: address,
  }
  if (notes) body.bookingFieldsResponses = { notes }

  const resp = await fetch(`${CALCOM_BASE}/bookings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CALCOM_API_KEY}`,
      'cal-api-version': '2024-06-14',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await resp.json()
  if (!resp.ok) throw new Error(data?.error?.message || data?.message || 'Cal.com booking failed')
  return data.data
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const { eventTypeId, firstName, lastName, email, address, startLocal, notes, recurring } = req.body

  if (!eventTypeId || !firstName || !email || !address || !startLocal) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  // Convert local CT datetime to UTC
  const localDate = new Date(startLocal)
  const ctOffset = new Date(startLocal).toLocaleString('en-US', { timeZone: TZ, timeZoneName: 'short' }).match(/GMT([+-]\d+)/)?.[1]
  const utcIso = localDate.toISOString()

  const bookings = []
  const errors = []

  // Determine number of occurrences based on recurring type
  const intervalDays = recurring === '21' ? 21 : recurring === '28' ? 28 : 0
  const occurrences = intervalDays > 0 ? 6 : 1 // 6 future appointments for recurring

  for (let i = 0; i < occurrences; i++) {
    const start = new Date(localDate.getTime() + i * intervalDays * 24 * 60 * 60 * 1000)
    try {
      const result = await createOneBooking(eventTypeId, firstName, lastName, email, address, start.toISOString(), notes)
      bookings.push(result)
    } catch (err) {
      errors.push(`Occurrence ${i + 1}: ${err.message}`)
    }
  }

  if (bookings.length === 0) {
    return res.status(502).json({ error: errors.join('; ') || 'Booking failed' })
  }

  res.status(200).json({
    uid: bookings[0]?.uid,
    status: 'created',
    count: bookings.length,
    recurring: intervalDays > 0,
    errors: errors.length > 0 ? errors : undefined,
  })
}
