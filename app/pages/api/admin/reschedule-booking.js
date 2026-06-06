// Reschedule a Cal.com booking via API. Body: { bookingUid, newStartIso }.
// For legacy Acuity events that don't have a Cal.com booking, falls back to
// patching the Google Calendar event start/end directly.

const { requireAdmin } = require('../../../lib/auth')
const { rescheduleBooking } = require('../../../lib/calcom')
const { google } = require('googleapis')

const CALENDAR_ID = 'admin@greenguard-usa.com'

function calendar() {
  const oauth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  oauth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.calendar({ version: 'v3', auth: oauth })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await requireAdmin(req, res)
  if (!session) return

  const { bookingUid, eventId, newStartIso, durationMin } = req.body || {}
  if (!newStartIso) return res.status(400).json({ error: 'newStartIso required' })

  // Cal.com path (preferred)
  if (bookingUid) {
    try {
      const out = await rescheduleBooking(bookingUid, newStartIso)
      return res.status(200).json({ ok: true, via: 'cal.com', booking: out })
    } catch (e) {
      // Fall through to gcal patch
      console.error('cal.com reschedule failed:', e.message)
    }
  }

  // Direct Google Calendar patch (legacy Acuity or no UID)
  if (!eventId) return res.status(400).json({ error: 'eventId required for gcal fallback' })
  try {
    const cal = calendar()
    const ev = await cal.events.get({ calendarId: CALENDAR_ID, eventId }).then((r) => r.data)
    const startMs = new Date(newStartIso).getTime()
    const oldStart = ev.start?.dateTime ? new Date(ev.start.dateTime).getTime() : null
    const oldEnd   = ev.end?.dateTime   ? new Date(ev.end.dateTime).getTime() : null
    const dur = durationMin ? durationMin * 60_000 : (oldStart && oldEnd ? oldEnd - oldStart : 45 * 60_000)
    const patched = await cal.events.patch({
      calendarId: CALENDAR_ID, eventId,
      sendUpdates: 'all',
      requestBody: {
        start: { dateTime: new Date(startMs).toISOString(), timeZone: 'America/Chicago' },
        end:   { dateTime: new Date(startMs + dur).toISOString(), timeZone: 'America/Chicago' },
      },
    })
    return res.status(200).json({ ok: true, via: 'gcal', event: patched.data })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
