const { requireAdmin, consumeJti } = require('../../../lib/auth')
const { getBookingsForEmail } = require('../../../lib/calcom')
const crypto = require('crypto')

const CALCOM_API_KEY = process.env.CALCOM_API_KEY || ''
const CALCOM_BASE = `${(process.env.CALCOM_BASE_URL || 'https://cal.com').replace(/\/$/, '')}/api/v2`
const TZ = process.env.CALENDAR_TIMEZONE || 'America/Chicago'

async function createOneBooking(eventTypeId, firstName, lastName, email, phone, address, utcIso, notes) {
  // Cal.com schema (api-version 2024-08-13) requires:
  //   attendee.{name,email,timeZone,language,phoneNumber}
  //   top-level metadata: {}
  // The 2024-06-14 schema we used previously silently 400'd with three
  // validation errors (timeZone, language, metadata). Most of our hidden
  // event types also require a phone number — Cal.com 400s without it.
  const body = {
    eventTypeId: Number(eventTypeId),
    start: utcIso,
    attendee: {
      name: `${firstName} ${lastName}`.trim(),
      email,
      timeZone: TZ,
      language: 'en',
      ...(phone ? { phoneNumber: phone } : {}),
    },
    location: address,
    metadata: {},
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
  if (!resp.ok) {
    // Surface the full error so the client sees a useful message
    const detail = data?.error?.details?.message || data?.error?.message || data?.message || 'Cal.com booking failed'
    throw new Error(detail)
  }
  return data.data
}

async function hasOverlappingBooking(email, startISO) {
  // Defense in depth against double-book: scan customer's recent Cal.com bookings.
  // Anything within ±5 min of our intended start counts as a dupe.
  try {
    const lookbackISO = new Date(new Date(startISO).getTime() - 24 * 3600 * 1000).toISOString()
    const existing = await getBookingsForEmail(email, lookbackISO)
    const target = new Date(startISO).getTime()
    return (existing || []).some((b) => {
      if (b.status === 'CANCELLED' || b.status === 'cancelled') return false
      const bt = new Date(b.startTime).getTime()
      return Math.abs(bt - target) < 5 * 60 * 1000
    })
  } catch {
    return false // fail-open rather than block legit bookings on a Cal.com 5xx
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await requireAdmin(req, res)
  if (!session) return

  const { eventTypeId, firstName, lastName, email, phone, address, startLocal, notes, recurring } = req.body
  if (!eventTypeId || !firstName || !email || !address || !startLocal) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  // Idempotency: same (email, eventTypeId, startLocal) submitted twice within
  // 5 min is rejected. Survives lambda warm restarts via Vercel KV when set.
  const fp = crypto.createHash('sha256').update(`${email}|${eventTypeId}|${startLocal}`).digest('hex').slice(0, 16)
  const fresh = await consumeJti(`book:${fp}`, 300)
  if (!fresh) return res.status(409).json({ error: 'Duplicate booking submission — try again in a few minutes.' })

  const localDate = new Date(startLocal)
  const utcIso = localDate.toISOString()

  const intervalDays = recurring === '21' ? 21 : recurring === '28' ? 28 : 0
  const occurrences = intervalDays > 0 ? 6 : 1

  // Skip already-booked slots inside the recurring run (avoid double-creating
  // the first occurrence if admin retries after a partial failure).
  const bookings = []
  const errors = []
  const skipped = []
  for (let i = 0; i < occurrences; i++) {
    const start = new Date(localDate.getTime() + i * intervalDays * 24 * 60 * 60 * 1000).toISOString()
    if (await hasOverlappingBooking(email, start)) {
      skipped.push(`Occurrence ${i + 1} (${start.slice(0, 16)}): already booked`)
      continue
    }
    try {
      const result = await createOneBooking(eventTypeId, firstName, lastName, email, phone, address, start, notes)
      bookings.push(result)
    } catch (err) {
      errors.push(`Occurrence ${i + 1}: ${err.message}`)
    }
  }

  if (bookings.length === 0) {
    return res.status(502).json({ error: errors.join('; ') || skipped.join('; ') || 'Booking failed' })
  }

  res.status(200).json({
    uid: bookings[0]?.uid,
    status: 'created',
    count: bookings.length,
    recurring: intervalDays > 0,
    errors: errors.length > 0 ? errors : undefined,
    skipped: skipped.length > 0 ? skipped : undefined,
  })
}
