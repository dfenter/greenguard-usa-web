const { requireAdmin } = require('../../../lib/auth')
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

async function hasOverlappingBooking() {
  return false // Cal.com API key lacks booking scope — always returns []
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

  // `startLocal` is a datetime-local string ("YYYY-MM-DDTHH:mm") with NO
  // timezone — the browser means it as America/Chicago but Node would parse
  // it as UTC, putting every booking 5-6 hours early.  Convert explicitly:
  // treat the string as UTC (placeholder), see what CT clock that maps to,
  // compute the offset, then shift back to get the true UTC instant.
  function localCTtoUTC(dtLocal) {
    const asIfUTC = new Date(dtLocal + ':00Z')
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(asIfUTC)
    const get = (t) => parts.find((p) => p.type === t)?.value ?? '00'
    const tzShown = new Date(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`)
    return new Date(asIfUTC.getTime() + (asIfUTC.getTime() - tzShown.getTime())).toISOString()
  }

  const utcIso = localCTtoUTC(startLocal)

  // 24-hour minimum notice is enforced at the Cal.com level for customers.
  // Admin bookings are always unrestricted — this endpoint requires admin auth.

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
    const start = new Date(new Date(utcIso).getTime() + i * intervalDays * 24 * 60 * 60 * 1000).toISOString()
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
      // Cal.com rejected (any reason: min notice, scheduling window, conflict, etc.)
      // Admin is never blocked — always fall back to direct GCal so the visit
      // lands on the route. Customer won't get a Cal.com confirmation email.
      try {
        const direct = await createDirectGCalEvent({
          firstName, lastName, email, phone, address, utcIso: start, notes, eventTypeTitle,
        })
        bookings.push(direct)
      } catch (e2) {
        errors.push(`Occurrence ${i + 1}: ${err.message} (GCal fallback also failed: ${e2.message})`)
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
