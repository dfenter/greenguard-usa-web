// Returns everything the calendar docked-detail panel needs for a clicked event:
// HubSpot contact, last + next appointments for that customer, event description,
// Google Calendar htmlLink, and a Cal.com reschedule URL if it's a Cal.com booking.
//
// Query: ?eventId=<gcal-event-id>  (preferred — looks up event + parses email)
//   or:  ?email=<customer-email>   (lighter fallback)

const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { google } = require('googleapis')
const { findContactByEmail } = require('../../../lib/hubspot')

const CALENDAR_ID = 'admin@greenguard-usa.com'

function calendar() {
  const oauth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  oauth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.calendar({ version: 'v3', auth: oauth })
}

function parseEmailFromDescription(desc) {
  const m = (desc || '').match(/Email:\s*([^\s|]+@[^\s|]+)/i)
  return m ? m[1].toLowerCase() : null
}

function parseRescheduleUrl(desc) {
  if (!desc) return null
  // Only Cal.com URLs — never Squarespace/Acuity legacy.
  const m = desc.match(/(https:\/\/cal\.com\/[^\s)]+)/i)
  return m ? m[1] : null
}

function isLegacyAcuity(desc) {
  if (!desc) return false
  return /acuityid=|acuityscheduling\.com|squarespace\.com\/[^\s]*appointments\/view\/|swordfish-triangle/i.test(desc)
}

async function fetchAdjacentBookings(cal, email, nowISO) {
  // Find last (past) and next (future) appointments for this customer's email.
  const yearAgo = new Date(Date.now() - 365 * 86400 * 1000).toISOString()
  const yearAhead = new Date(Date.now() + 365 * 86400 * 1000).toISOString()
  const res = await cal.events.list({
    calendarId: CALENDAR_ID,
    timeMin: yearAgo, timeMax: yearAhead,
    singleEvents: true, orderBy: 'startTime', maxResults: 250,
    q: email,
  })
  const eventsForEmail = (res.data.items || []).filter((e) =>
    parseEmailFromDescription(e.description) === email
  )
  const now = nowISO
  const past = eventsForEmail.filter((e) => (e.start?.dateTime || e.start?.date) < now)
  const future = eventsForEmail.filter((e) => (e.start?.dateTime || e.start?.date) >= now)
  const last = past[past.length - 1] || null
  const next = future[0] || null
  return { last, next, total: eventsForEmail.length }
}

function slim(event) {
  if (!event) return null
  return {
    id: event.id,
    summary: event.summary || '',
    start: event.start?.dateTime || event.start?.date || null,
    end: event.end?.dateTime || event.end?.date || null,
    htmlLink: event.htmlLink || null,
  }
}

export default async function handler(req, res) {
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const { eventId, email: queryEmail } = req.query
  if (!eventId && !queryEmail) return res.status(400).json({ error: 'eventId or email required' })

  const cal = calendar()

  let event = null
  let email = queryEmail || null
  if (eventId) {
    try {
      const r = await cal.events.get({ calendarId: CALENDAR_ID, eventId })
      event = r.data
      if (!email) email = parseEmailFromDescription(event.description)
    } catch (e) {
      return res.status(404).json({ error: `Event ${eventId} not found` })
    }
  }

  const [contact, adjacent] = await Promise.all([
    email ? findContactByEmail(email).catch(() => null) : Promise.resolve(null),
    email ? fetchAdjacentBookings(cal, email, new Date().toISOString()).catch(() => ({ last: null, next: null, total: 0 })) : Promise.resolve({ last: null, next: null, total: 0 }),
  ])

  return res.status(200).json({
    event: event ? {
      ...slim(event),
      description: event.description || '',
      location: event.location || '',
      htmlLink: event.htmlLink || null,
      rescheduleUrl: parseRescheduleUrl(event.description),
      isLegacyAcuity: isLegacyAcuity(event.description),
    } : null,
    email,
    contact: contact ? {
      id: contact.id,
      properties: contact.properties || {},
    } : null,
    last: slim(adjacent.last),
    next: slim(adjacent.next),
    totalAppointments: adjacent.total,
  })
}
