/**
 * Google Calendar client — OAuth2 with stored refresh token.
 *
 * Required env vars (set in Vercel + GitHub Secrets):
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REFRESH_TOKEN   (one-time: run _scripts/get-google-refresh-token.py)
 */
const { google } = require('googleapis')

const CALENDAR_ID = 'admin@greenguard-usa.com'
const BOOKING_TAG = 'GreenGuard USA'

function getAuth() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error('GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN must be set')
  }

  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN })
  return auth
}

function getCalendar() {
  return google.calendar({ version: 'v3', auth: getAuth() })
}

function parseEmailFromDescription(description) {
  if (!description) return null
  const match = description.match(/Email:\s*([^\s\n]+)/i)
  return match ? match[1].trim().toLowerCase() : null
}

function parseAddressFromDescription(description) {
  if (!description) return null
  const locMatch = description.match(/Location\s*={3,}\s*\n(.*)/i)
  return locMatch ? locMatch[1].trim() : null
}

function parseServiceTitle(summary) {
  if (!summary) return ''
  return summary
    .replace(/^[^:]+:\s*/, '')
    .replace(/\s*\(GreenGuard USA\)\s*$/, '')
    .trim()
}

async function getUpcomingBookingsForEmail(customerEmail, maxResults = 20) {
  const calendar = getCalendar()
  const email = customerEmail.toLowerCase().trim()

  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: new Date().toISOString(),
    maxResults: 100,
    singleEvents: true,
    orderBy: 'startTime',
    q: email,
  })

  return (res.data.items || [])
    .filter((e) => {
      const isBooking =
        (e.description && e.description.includes(BOOKING_TAG)) ||
        (e.summary && e.summary.includes('GreenGuard USA'))
      const descEmail = parseEmailFromDescription(e.description)
      const attendeeMatch = (e.attendees || []).some(
        (a) => a.email?.toLowerCase() === email
      )
      return isBooking && (attendeeMatch || descEmail === email)
    })
    .slice(0, maxResults)
    .map((e) => ({
      id: e.id,
      title: parseServiceTitle(e.summary),
      startTime: e.start?.dateTime || e.start?.date,
      endTime: e.end?.dateTime || e.end?.date,
      address: e.location || parseAddressFromDescription(e.description),
    }))
}

async function getPastBookingsForEmail(customerEmail, maxResults = 5) {
  const calendar = getCalendar()
  const email = customerEmail.toLowerCase().trim()

  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMax: new Date().toISOString(),
    maxResults: 100,
    singleEvents: true,
    orderBy: 'startTime',
    q: email,
  })

  return (res.data.items || [])
    .filter((e) => {
      const isBooking =
        (e.description && e.description.includes(BOOKING_TAG)) ||
        (e.summary && e.summary.includes('GreenGuard USA'))
      const descEmail = parseEmailFromDescription(e.description)
      const attendeeMatch = (e.attendees || []).some(
        (a) => a.email?.toLowerCase() === email
      )
      return isBooking && (attendeeMatch || descEmail === email)
    })
    .sort((a, b) => new Date(b.start?.dateTime) - new Date(a.start?.dateTime))
    .slice(0, maxResults)
    .map((e) => ({
      id: e.id,
      title: parseServiceTitle(e.summary),
      startTime: e.start?.dateTime || e.start?.date,
      endTime: e.end?.dateTime || e.end?.date,
      address: e.location || parseAddressFromDescription(e.description),
    }))
}

async function getBookingsForWeek(startISO, endISO) {
  const calendar = getCalendar()

  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: startISO,
    timeMax: endISO,
    maxResults: 250,
    singleEvents: true,
    orderBy: 'startTime',
    q: 'GreenGuard USA',
  })

  return (res.data.items || [])
    .filter((e) =>
      (e.description && e.description.includes(BOOKING_TAG)) ||
      (e.summary && e.summary.includes('GreenGuard USA'))
    )
    .map((e) => ({
      id: e.id,
      title: parseServiceTitle(e.summary),
      startTime: e.start?.dateTime || e.start?.date,
      endTime: e.end?.dateTime || e.end?.date,
      address: e.location || parseAddressFromDescription(e.description),
      email: parseEmailFromDescription(e.description),
    }))
}

module.exports = {
  getUpcomingBookingsForEmail,
  getPastBookingsForEmail,
  getBookingsForWeek,
  parseServiceTitle,
  parseEmailFromDescription,
}
