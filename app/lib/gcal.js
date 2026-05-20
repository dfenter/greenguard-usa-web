/**
 * Google Calendar client for the GreenGuard portal.
 *
 * Auth: Google service account with domain-wide delegation to admin@greenguard-usa.com
 * Setup: https://developers.google.com/identity/protocols/oauth2/service-account
 *   1. Create service account in Google Cloud Console
 *   2. Enable Google Calendar API
 *   3. Grant domain-wide delegation
 *   4. In Google Workspace admin: add the service account client ID with scope
 *      https://www.googleapis.com/auth/calendar.readonly
 *   5. Set GOOGLE_SERVICE_ACCOUNT_KEY env var to the full JSON key (base64 encoded)
 */
const { google } = require('googleapis')

const CALENDAR_ID = 'admin@greenguard-usa.com'
// Tag that appears in all GreenGuard booking descriptions (both Acuity and Cal.com)
const BOOKING_TAG = 'GreenGuard USA'

function getAuth() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!keyJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY env var not set')

  const key = JSON.parse(
    Buffer.from(keyJson, 'base64').toString('utf8')
  )

  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    subject: CALENDAR_ID, // impersonate the GreenGuard admin calendar
  })

  return auth
}

function getCalendar() {
  return google.calendar({ version: 'v3', auth: getAuth() })
}

/**
 * Parse the email out of a Cal.com/Acuity event description.
 * Both formats include a line like "Email: customer@example.com"
 */
function parseEmailFromDescription(description) {
  if (!description) return null
  const match = description.match(/Email:\s*([^\s\n]+)/i)
  return match ? match[1].trim().toLowerCase() : null
}

/**
 * Parse the service address from an event description.
 * Appears under "Location\n============\n<address>" or in Notes.
 */
function parseAddressFromDescription(description) {
  if (!description) return null
  const locMatch = description.match(/Location\s*={3,}\s*\n(.*)/i)
  if (locMatch) return locMatch[1].trim()
  return null
}

/**
 * Normalize a raw calendar event title to a clean service type name.
 * Strips "CustomerName: " prefix and " (GreenGuard USA)" suffix.
 */
function parseServiceTitle(summary) {
  if (!summary) return ''
  return summary
    .replace(/^[^:]+:\s*/, '')
    .replace(/\s*\(GreenGuard USA\)\s*$/, '')
    .trim()
}

/**
 * Fetch all upcoming bookings for a specific customer email.
 * Searches the description text of all future GreenGuard events.
 *
 * @param {string} customerEmail
 * @param {number} [maxResults]
 * @returns {Promise<object[]>}
 */
async function getUpcomingBookingsForEmail(customerEmail, maxResults = 20) {
  const calendar = getCalendar()
  const email = customerEmail.toLowerCase().trim()

  // Cal.com includes attendee emails in the event attendees array.
  // Acuity embeds them in the description. We handle both.
  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: new Date().toISOString(),
    maxResults: 100,
    singleEvents: true,
    orderBy: 'startTime',
    q: email, // Google Calendar full-text search — matches description text
  })

  const events = (res.data.items || [])
    .filter((e) => {
      // Confirm this is a GreenGuard booking (not a personal event)
      const isBooking =
        (e.description && e.description.includes(BOOKING_TAG)) ||
        (e.summary && e.summary.includes('GreenGuard USA'))

      // Confirm the email matches (in attendees or description)
      const descEmail = parseEmailFromDescription(e.description)
      const attendeeMatch = (e.attendees || []).some(
        (a) => a.email?.toLowerCase() === email
      )
      const descMatch = descEmail === email

      return isBooking && (attendeeMatch || descMatch)
    })
    .slice(0, maxResults)
    .map((e) => ({
      id: e.id,
      title: parseServiceTitle(e.summary),
      rawTitle: e.summary,
      startTime: e.start?.dateTime || e.start?.date,
      endTime: e.end?.dateTime || e.end?.date,
      address: e.location || parseAddressFromDescription(e.description),
      description: e.description,
    }))

  return events
}

/**
 * Fetch past bookings for a specific customer email.
 *
 * @param {string} customerEmail
 * @param {number} [maxResults]
 * @returns {Promise<object[]>}
 */
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

/**
 * Fetch all GreenGuard bookings for a given week (for route optimizer).
 * Returns raw events with full descriptions for address/duration parsing.
 *
 * @param {string} startISO - Monday ISO datetime
 * @param {string} endISO   - Saturday ISO datetime
 * @returns {Promise<object[]>}
 */
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
      rawTitle: e.summary,
      startTime: e.start?.dateTime || e.start?.date,
      endTime: e.end?.dateTime || e.end?.date,
      address: e.location || parseAddressFromDescription(e.description),
      email: parseEmailFromDescription(e.description),
      description: e.description,
    }))
}

module.exports = {
  getUpcomingBookingsForEmail,
  getPastBookingsForEmail,
  getBookingsForWeek,
  parseServiceTitle,
  parseEmailFromDescription,
}
