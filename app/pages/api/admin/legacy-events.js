const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { google } = require('googleapis')

const CALENDAR_ID = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

function calendar() {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.calendar({ version: 'v3', auth })
}

/**
 * GET /api/admin/legacy-events
 * Lists upcoming Google Calendar events that look like GreenGuard bookings
 * but have NO Cal.com booking/reschedule URL in their description. These are
 * legacy Acuity-era events that can't be self-reschedule/cancelled.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  try {
    const cal = calendar()
    const sixMonthsOut = new Date()
    sixMonthsOut.setMonth(sixMonthsOut.getMonth() + 6)

    const list = await cal.events.list({
      calendarId: CALENDAR_ID,
      timeMin: new Date().toISOString(),
      timeMax: sixMonthsOut.toISOString(),
      maxResults: 250,
      singleEvents: true,
      orderBy: 'startTime',
    })

    const items = (list.data.items || [])
      .filter((e) => {
        const summary = e.summary || ''
        const desc = e.description || ''
        // Looks like a GreenGuard booking
        const isGreenGuard = summary.includes('GreenGuard') ||
          desc.includes('GreenGuard') ||
          /AcuityID=/i.test(desc) ||
          /^[^:]+:\s+.*\(GreenGuard USA\)/.test(summary)
        if (!isGreenGuard) return false
        // No Cal.com URL → legacy
        const hasCalUrl = /cal\.com\/(booking|reschedule)\//i.test(desc)
        return !hasCalUrl
      })
      .map((e) => ({
        id: e.id,
        summary: e.summary || '',
        start: e.start?.dateTime || e.start?.date || null,
        end: e.end?.dateTime || e.end?.date || null,
        attendeeEmail: (e.attendees || []).map((a) => a.email).filter(Boolean)[0] || null,
        descriptionPreview: (e.description || '').slice(0, 200),
        hasAcuityId: /AcuityID=/i.test(e.description || ''),
      }))

    return res.status(200).json({ count: items.length, events: items })
  } catch (e) {
    console.error('legacy-events error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
