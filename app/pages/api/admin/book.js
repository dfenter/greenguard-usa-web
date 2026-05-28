const { requireAdmin } = require('../../../lib/auth')
const { getBookingsForEmail } = require('../../../lib/calcom')
const { getCalendar } = require('../../../lib/gcal')

const CALCOM_API_KEY = process.env.CALCOM_API_KEY || ''
const CALCOM_BASE = `${(process.env.CALCOM_BASE_URL || 'https://cal.com').replace(/\/$/, '')}/api/v2`
const TZ = process.env.CALENDAR_TIMEZONE || 'America/Chicago'
const BUSINESS_PHONE = process.env.BUSINESS_PHONE || '+15125604129'
const CALENDAR_ID = 'admin@greenguard-usa.com'

async function createOneBooking(eventTypeId, firstName, lastName, email, phone, address, utcIso, notes) {
  // Cal.com schema (api-version 2024-08-13) requires:
  //   attendee.{name,email,timeZone,language,phoneNumber}
  //   top-level metadata: {}
  // Phone is required by every hidden event type. If the admin didn't
  // collect one, fall back to the business number so the booking still
  // goes through — Cal.com just needs *something* in the field.
  const body = {
    eventTypeId: Number(eventTypeId),
    start: utcIso,
    attendee: {
      name: `${firstName} ${lastName}`.trim(),
      email,
      timeZone: TZ,
      language: 'en',
      phoneNumber: phone || BUSINESS_PHONE,
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
    const detail = data?.error?.details?.message || data?.error?.message || data?.message || 'Cal.com booking failed'
    const err = new Error(detail)
    err.calComResponse = data
    err.status = resp.status
    throw err
  }
  return data.data
}

// Direct Google Calendar event creation — used when admin opts to force a
// double-booking through Cal.com's availability check. The event is created
// on the same admin calendar Cal.com syncs to, so it shows up everywhere
// (rounds, route, etc.) just like a Cal.com booking would.
async function createDirectGCalEvent({ firstName, lastName, email, phone, address, utcIso, notes, eventTypeTitle }) {
  const cal = getCalendar()
  const start = new Date(utcIso)
  const end = new Date(start.getTime() + 30 * 60 * 1000)  // default 30 min
  const name = `${firstName} ${lastName}`.trim()
  const description = [
    `Customer: ${name}`,
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : null,
    address ? `Address: ${address}` : null,
    '',
    'Manual admin booking (Cal.com slot was unavailable — forced double-book). GreenGuard USA',
    notes ? '' : null,
    notes ? `Notes: ${notes}` : null,
  ].filter((x) => x !== null).join('\n')
  const r = await cal.events.insert({
    calendarId: CALENDAR_ID,
    sendUpdates: 'none',
    requestBody: {
      summary: `${name}: ${eventTypeTitle || 'Manual booking'} (GreenGuard USA)`,
      description,
      location: address,
      start: { dateTime: start.toISOString(), timeZone: TZ },
      end:   { dateTime: end.toISOString(),   timeZone: TZ },
    },
  })
  return { uid: r.data.id, source: 'gcal-direct' }
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

  const { eventTypeId, firstName, lastName, email, phone, address, startLocal, notes, recurring, allowDoubleBook, skipNotification, eventTypeTitle } = req.body
  if (!eventTypeId || !firstName || !email || !address || !startLocal) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  // Admin booking is intentionally unblockable — no idempotency rejection,
  // no availability gate. Owner asked for full override authority here.

  const localDate = new Date(startLocal)
  const utcIso = localDate.toISOString()

  const intervalDays = recurring === '21' ? 21 : recurring === '28' ? 28 : 0
  const occurrences = intervalDays > 0 ? 6 : 1

  // Skip already-booked slots inside the recurring run (avoid double-creating
  // the first occurrence if admin retries after a partial failure). When
  // `allowDoubleBook` is set the admin has explicitly opted in — skip our
  // dedupe guard AND fall back to a direct GCal event if Cal.com rejects.
  const bookings = []
  const errors = []
  const skipped = []
  for (let i = 0; i < occurrences; i++) {
    const start = new Date(localDate.getTime() + i * intervalDays * 24 * 60 * 60 * 1000).toISOString()
    if (!allowDoubleBook && !skipNotification && await hasOverlappingBooking(email, start)) {
      skipped.push(`Occurrence ${i + 1} (${start.slice(0, 16)}): already booked`)
      continue
    }
    // When `skipNotification` is checked, admin wants the appointment on
    // the calendar without any customer-facing email. Cal.com always sends
    // a confirmation when it creates a booking, so we bypass Cal.com
    // entirely and write directly to Google Calendar with sendUpdates=none.
    if (skipNotification) {
      try {
        const direct = await createDirectGCalEvent({
          firstName, lastName, email, phone, address, utcIso: start, notes, eventTypeTitle,
        })
        bookings.push(direct)
      } catch (e) {
        errors.push(`Occurrence ${i + 1}: GCal create failed: ${e.message}`)
      }
      continue
    }
    try {
      const result = await createOneBooking(eventTypeId, firstName, lastName, email, phone, address, start, notes)
      bookings.push(result)
    } catch (err) {
      // If admin opted into double-booking and Cal.com rejected because
      // the slot was unavailable, drop straight to Google Calendar so the
      // visit still lands on the route. Customer won't get a Cal.com
      // confirmation email but the appointment exists where it matters.
      const isAvail = /already has booking|not available|slot.*not available|conflict/i.test(err.message)
      if (allowDoubleBook && isAvail) {
        try {
          const direct = await createDirectGCalEvent({
            firstName, lastName, email, phone, address, utcIso: start, notes, eventTypeTitle,
          })
          bookings.push(direct)
        } catch (e2) {
          errors.push(`Occurrence ${i + 1}: ${err.message} (GCal fallback also failed: ${e2.message})`)
        }
      } else {
        errors.push(`Occurrence ${i + 1}: ${err.message}`)
      }
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
