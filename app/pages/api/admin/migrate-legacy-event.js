const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { google } = require('googleapis')

const CALENDAR_ID = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'
const CALCOM_API_KEY = process.env.CALCOM_API_KEY || ''
const CALCOM_BASE = `${(process.env.CALCOM_BASE_URL || 'https://cal.com').replace(/\/$/, '')}/api/v2`
const TZ = process.env.CALENDAR_TIMEZONE || 'America/Chicago'

const eventTypesJson = require('../../../lib/cal-event-types.json')

function calendar() {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.calendar({ version: 'v3', auth })
}

// Map a GCal event title → Cal.com event type slug (best effort by title contains)
function resolveEventType(gcalSummary) {
  const summary = (gcalSummary || '').toLowerCase()
  // Strip the "Name: " prefix that the legacy format uses
  const titleOnly = summary.replace(/^[^:]+:\s*/, '').replace(/\s*\(greenguard usa\)\s*$/, '')
  const types = eventTypesJson.eventTypes || []
  // Score each by overlapping words
  let best = null; let bestScore = 0
  for (const t of types) {
    const tTitle = (t.title || '').toLowerCase()
    const tokens = tTitle.split(/\s+/).filter((w) => w.length >= 4)
    let score = 0
    for (const w of tokens) if (titleOnly.includes(w)) score += 1
    if (score > bestScore) { bestScore = score; best = t }
  }
  return bestScore >= 3 ? best : null
}

/**
 * POST /api/admin/migrate-legacy-event
 * Body: { eventId }
 * Creates a corresponding Cal.com booking for a legacy GCal event,
 * then patches the GCal event description to include the new Cal.com URL
 * so customers/admins can reschedule or cancel via Cal.com from now on.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const { eventId } = req.body || {}
  if (!eventId) return res.status(400).json({ error: 'eventId required' })

  const cal = calendar()
  let event
  try {
    const r = await cal.events.get({ calendarId: CALENDAR_ID, eventId })
    event = r.data
  } catch (e) {
    return res.status(404).json({ error: 'Event not found: ' + e.message })
  }

  const desc = event.description || ''
  if (/cal\.com\/(booking|reschedule)\//i.test(desc)) {
    return res.status(200).json({ ok: true, alreadyMigrated: true })
  }

  // Resolve attendee + event type
  const attendee = (event.attendees || []).find((a) => a.email) || {}
  const email = attendee.email
  if (!email) return res.status(400).json({ error: 'No attendee email on this event' })

  const evType = resolveEventType(event.summary)
  if (!evType) return res.status(422).json({ error: `Could not match Cal.com event type for "${event.summary}". Set eventTypeId manually.` })

  // Look up Cal.com event type to get its numeric ID
  let eventTypeId = evType.id
  if (!eventTypeId) {
    try {
      const r = await fetch(`${CALCOM_BASE}/event-types`, {
        headers: { Authorization: `Bearer ${CALCOM_API_KEY}`, 'cal-api-version': '2024-06-14' },
      })
      const j = await r.json()
      const match = (j.data || []).find((e) => e.slug === evType.slug)
      if (!match) return res.status(422).json({ error: `Cal.com event-type slug "${evType.slug}" not found` })
      eventTypeId = match.id
    } catch (e) {
      return res.status(502).json({ error: 'Cal.com event-types lookup failed: ' + e.message })
    }
  }

  // Create the Cal.com booking
  const startIso = event.start?.dateTime || event.start?.date
  const nameParts = (attendee.displayName || (event.summary || '').split(':')[0] || 'Customer').trim().split(/\s+/)
  const firstName = nameParts[0] || 'Customer'
  const lastName = nameParts.slice(1).join(' ') || ''
  const location = event.location || ''

  let booking
  try {
    const r = await fetch(`${CALCOM_BASE}/bookings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CALCOM_API_KEY}`, 'cal-api-version': '2024-06-14', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventTypeId: Number(eventTypeId),
        start: new Date(startIso).toISOString(),
        attendee: { name: `${firstName} ${lastName}`.trim(), email, timeZone: TZ },
        location: location || undefined,
        metadata: { source: 'legacy-migration', originalGCalEventId: eventId },
      }),
    })
    const j = await r.json()
    if (!r.ok) return res.status(502).json({ error: 'Cal.com booking failed: ' + (j?.error?.message || j?.message || JSON.stringify(j)) })
    booking = j.data
  } catch (e) {
    return res.status(502).json({ error: 'Cal.com booking error: ' + e.message })
  }

  const rescheduleUrl = `https://cal.com/reschedule/${booking.uid}`

  // Patch GCal description to append the new Cal.com URLs
  const newDesc = `${desc}\n\n--- Migrated to Cal.com ---\nReschedule: ${rescheduleUrl}\nBooking UID: ${booking.uid}\n`
  try {
    await cal.events.patch({
      calendarId: CALENDAR_ID,
      eventId,
      requestBody: { description: newDesc },
    })
  } catch (e) {
    // Booking was created but GCal patch failed — return success with warning
    return res.status(200).json({ ok: true, booking: { uid: booking.uid, id: booking.id }, rescheduleUrl, warning: 'Cal.com booking created but GCal description patch failed: ' + e.message })
  }

  return res.status(200).json({ ok: true, booking: { uid: booking.uid, id: booking.id }, rescheduleUrl })
}
