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
  // Legacy event description format: "Email: xxx@example.com"
  const legacyMatch = description.match(/^Email:\s*([^\s\n]+)/im)
  if (legacyMatch) return legacyMatch[1].trim().toLowerCase()
  // Cal.com format: emails appear under "Who:" section, one per line
  // Match any email that's NOT admin@greenguard-usa.com
  const allEmails = description.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g) || []
  const customerEmail = allEmails.find(e => e.toLowerCase() !== 'admin@greenguard-usa.com')
  return customerEmail ? customerEmail.toLowerCase() : null
}

function parseEmailFromAttendees(attendees) {
  if (!Array.isArray(attendees)) return null
  const customer = attendees.find(a => a.email && a.email.toLowerCase() !== 'admin@greenguard-usa.com' && !a.organizer)
  return customer ? customer.email.toLowerCase() : null
}

function parsePhoneFromDescription(description) {
  if (!description) return null
  // Cal.com format: "Phone number (Text notifications):\n+1..."
  const calMatch = description.match(/Phone number[^:]*:\s*\n?\s*(\+?[\d\s\-().]+)/i)
  if (calMatch) return calMatch[1].trim()
  // Legacy event description format: "Phone: xxx"
  const legacyMatch = description.match(/^Phone:\s*(.+)/im)
  return legacyMatch ? legacyMatch[1].trim() : null
}

function parseAddressFromDescription(description) {
  if (!description) return null
  // Legacy event description format: Location section
  const locMatch = description.match(/Location\s*={3,}\s*\n(.*)/i)
  if (locMatch) return locMatch[1].trim()
  // Cal.com format: "Where:\nAddress"
  const whereMatch = description.match(/Where:\s*\n(.+)/i)
  return whereMatch ? whereMatch[1].trim() : null
}

function parseRescheduleUrl(description) {
  if (!description) return null
  // Cal.com format: "https://cal.com/booking/UID?changes=true"
  const calBookingMatch = description.match(/https:\/\/cal\.com\/booking\/([a-zA-Z0-9_-]+)/i)
  if (calBookingMatch) return `https://cal.com/booking/${calBookingMatch[1]}?changes=true`
  // Cal.com reschedule format (older): cal.com/reschedule/UID
  const calRescheduleMatch = description.match(/https:\/\/cal\.com\/reschedule\/([a-zA-Z0-9_-]+)/i)
  if (calRescheduleMatch) return `https://cal.com/reschedule/${calRescheduleMatch[1]}`
  // Acuity legacy bookings — admin reschedule URL
  const acuityMatch = description.match(/(https:\/\/[^\s]*?(?:squarespace|acuityscheduling)[^\s]*?appointments\/view\/\d+)/i)
  if (acuityMatch) return acuityMatch[1]
  // AcuityID fallback — construct admin URL
  const acuityIdMatch = description.match(/AcuityID=(\d+)/i)
  if (acuityIdMatch) return `https://swordfish-triangle-c6yr.squarespace.com/config/scheduling/appointments/view/${acuityIdMatch[1]}`
  return null
}

function parseServiceTitle(summary) {
  if (!summary) return ''
  // Cal.com format: "ServiceType between GreenGuard USA and CustomerName"
  const calMatch = summary.match(/^(.+?)\s+between\s+GreenGuard USA\s+and\s+.+$/i)
  if (calMatch) return calMatch[1].trim()
  // Legacy event title format: "CustomerName: ServiceType (GreenGuard USA)"
  return summary
    .replace(/^[^:]+:\s*/, '')
    .replace(/\s*\(GreenGuard USA\)\s*$/, '')
    .trim()
}

function parseCustomerName(summary) {
  if (!summary) return ''
  // Cal.com format: "ServiceType between GreenGuard USA and CustomerName"
  const calMatch = summary.match(/\band\s+(.+?)(?:\s*\(GreenGuard USA\))?\s*$/i)
  if (calMatch && summary.toLowerCase().includes('between greenguard usa')) {
    return calMatch[1].trim()
  }
  // Legacy event title format: "CustomerName: ServiceType"
  return (summary.split(':')[0] || '').trim()
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
      rescheduleUrl: parseRescheduleUrl(e.description),
      customerName: parseCustomerName(e.summary),
      name: parseCustomerName(e.summary),
      title: parseServiceTitle(e.summary),
      startTime: e.start?.dateTime || e.start?.date,
      endTime: e.end?.dateTime || e.end?.date,
      address: e.location || parseAddressFromDescription(e.description),
    }))
}

async function getPastBookingsForEmail(customerEmail, maxResults = 5) {
  const calendar = getCalendar()
  const email = customerEmail.toLowerCase().trim()

  // Look back 18 months — Google API capped at 250 events per call and orderBy:'startTime'
  // is ascending, so without timeMin we'd get the OLDEST events and miss recent visits.
  const eighteenMonthsAgo = new Date()
  eighteenMonthsAgo.setMonth(eighteenMonthsAgo.getMonth() - 18)

  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: eighteenMonthsAgo.toISOString(),
    timeMax: new Date().toISOString(),
    maxResults: 250,
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
      rescheduleUrl: parseRescheduleUrl(e.description),
      customerName: parseCustomerName(e.summary),
      name: parseCustomerName(e.summary),
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
      rescheduleUrl: parseRescheduleUrl(e.description),
      customerName: parseCustomerName(e.summary),
      name: parseCustomerName(e.summary),
      title: parseServiceTitle(e.summary),
      startTime: e.start?.dateTime || e.start?.date,
      endTime: e.end?.dateTime || e.end?.date,
      address: e.location || parseAddressFromDescription(e.description),
      email: parseEmailFromDescription(e.description),
      phone: parsePhoneFromDescription(e.description),
    }))
}

async function getBookingsForDate(dateStr) {
  const calendar = getCalendar()
  const startOfDay = new Date(dateStr + 'T00:00:00-05:00').toISOString()
  const endOfDay = new Date(dateStr + 'T23:59:59-05:00').toISOString()
  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: startOfDay,
    timeMax: endOfDay,
    maxResults: 50,
    singleEvents: true,
    orderBy: 'startTime',
    q: BOOKING_TAG,
  })
  return (res.data.items || [])
    .filter((e) =>
      (e.description && e.description.includes(BOOKING_TAG)) ||
      (e.summary && e.summary.includes('GreenGuard USA'))
    )
    .map((e) => {
      const desc = e.description || ''
      const propMatch = desc.match(/Property\s*[Ss]ize[:\s]+([^\n]+)/i)
      return {
        id: e.id,
        rescheduleUrl: parseRescheduleUrl(e.description),
        customerName: parseCustomerName(e.summary),
        name: parseCustomerName(e.summary),
        title: parseServiceTitle(e.summary),
        startTime: e.start?.dateTime || e.start?.date,
        endTime: e.end?.dateTime || e.end?.date,
        address: e.location || parseAddressFromDescription(desc),
        email: parseEmailFromDescription(desc),
        phone: parsePhoneFromDescription(desc),
        propertySize: propMatch?.[1]?.trim() || '',
      }
    })
}

async function getTodaysBookings() {
  const calendar = getCalendar()
  const tz = process.env.CALENDAR_TIMEZONE || 'America/Chicago'
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const startOfDay = new Date(todayStr + 'T00:00:00').toISOString()
  const endOfDay = new Date(todayStr + 'T23:59:59').toISOString()

  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: startOfDay,
    timeMax: endOfDay,
    maxResults: 50,
    singleEvents: true,
    orderBy: 'startTime',
    q: BOOKING_TAG,
  })

  return (res.data.items || [])
    .filter((e) =>
      (e.description && e.description.includes(BOOKING_TAG)) ||
      (e.summary && e.summary.includes('GreenGuard USA'))
    )
    .map((e) => ({
      id: e.id,
      rescheduleUrl: parseRescheduleUrl(e.description),
      customerName: parseCustomerName(e.summary),
      name: parseCustomerName(e.summary),
      title: parseServiceTitle(e.summary),
      startTime: e.start?.dateTime || e.start?.date,
      endTime: e.end?.dateTime || e.end?.date,
      address: e.location || parseAddressFromDescription(e.description),
      email: parseEmailFromDescription(e.description),
      phone: parsePhoneFromDescription(e.description),
    }))
}

async function getAllUpcomingBookings(maxResults = 20) {
  const calendar = getCalendar()

  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: new Date().toISOString(),
    maxResults: Math.min(maxResults * 5, 250),
    singleEvents: true,
    orderBy: 'startTime',
    q: BOOKING_TAG,
  })

  return (res.data.items || [])
    .filter((e) =>
      (e.description && e.description.includes(BOOKING_TAG)) ||
      (e.summary && e.summary.includes('GreenGuard USA'))
    )
    .slice(0, maxResults)
    .map((e) => ({
      id: e.id,
      rescheduleUrl: parseRescheduleUrl(e.description),
      customerName: parseCustomerName(e.summary),
      name: parseCustomerName(e.summary),
      title: parseServiceTitle(e.summary),
      startTime: e.start?.dateTime || e.start?.date,
      endTime: e.end?.dateTime || e.end?.date,
      address: e.location || parseAddressFromDescription(e.description),
      email: parseEmailFromDescription(e.description),
      phone: parsePhoneFromDescription(e.description),
    }))
}

async function getBookingsForDateRange(startISO, endISO) {
  const calendar = getCalendar()
  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: startISO,
    timeMax: endISO,
    maxResults: 250,
    singleEvents: true,
    orderBy: 'startTime',
    q: BOOKING_TAG,
  })
  const tz = process.env.CALENDAR_TIMEZONE || 'America/Chicago'
  return (res.data.items || [])
    .filter((e) =>
      (e.description && e.description.includes(BOOKING_TAG)) ||
      (e.summary && e.summary.includes('GreenGuard USA'))
    )
    .map((e) => {
      const start = e.start?.dateTime || e.start?.date
      const dateStr = new Date(start).toLocaleDateString('en-CA', { timeZone: tz })
      // Extract Cal.com booking UID from reschedule URL or booking URL in description
      let calBookingUid = null
      const desc = e.description || ''
      const uidMatch = desc.match(/cal\.com\/(?:booking|reschedule)\/([a-zA-Z0-9_-]+)/i)
      if (uidMatch) calBookingUid = uidMatch[1]
      // Email: try description first, then attendees list
      const email = parseEmailFromDescription(e.description) || parseEmailFromAttendees(e.attendees)
      return {
        dateStr,
        name: parseCustomerName(e.summary),
        title: parseServiceTitle(e.summary),
        email,
        calBookingUid,
        startTime: start,
      }
    })
}

module.exports = {
  getUpcomingBookingsForEmail,
  getPastBookingsForEmail,
  getBookingsForWeek,
  getAllUpcomingBookings,
  getTodaysBookings,
  getBookingsForDate,
  getBookingsForDateRange,
  parseServiceTitle,
  parseCustomerName,
  parseEmailFromDescription,
  parsePhoneFromDescription,
  parseRescheduleUrl,
}
