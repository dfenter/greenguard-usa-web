// Auto-apply a customer reschedule request when the requested slot passes the
// same rules the booking picker enforces (Mon–Fri, 10:00am–5:30pm CT starts,
// 4h minimum notice, no calendar conflict). Returns { ok: true, ... } when the
// GCal event was moved, or { ok: false, reason } so the caller can fall back
// to the manual request-email flow. Never throws.

const { getCalendar, getUpcomingBookingsForEmail } = require('./gcal')
const { invalidate } = require('./cache')
const biz = require('./business.config')

const CALENDAR_ID = process.env.CALENDAR_ID || biz.calendarId
const TZ = 'America/Chicago'
const WORK_DAYS = new Set([1, 2, 3, 4, 5])
const WORK_START_MIN = 10 * 60       // 10:00am CT
const WORK_LAST_MIN = 17.5 * 60      // last start 5:30pm CT
const MIN_NOTICE_H = 4
const DEFAULT_DUR_MS = 30 * 60_000

// Wall-clock parts of an instant in CT.
function ctParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(date).reduce((acc, p) => (acc[p.type] = p.value, acc), {})
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: parseInt(parts.hour) * 60 + parseInt(parts.minute),
    dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday),
  }
}

function validateSlot(start) {
  if (isNaN(start.getTime())) return 'unparseable requested time'
  if (start.getTime() < Date.now() + MIN_NOTICE_H * 3600_000) return 'less than 4h notice'
  const { minutes, dow } = ctParts(start)
  if (!WORK_DAYS.has(dow)) return 'outside work days'
  if (minutes < WORK_START_MIN || minutes > WORK_LAST_MIN) return 'outside work hours'
  if (minutes % 30 !== 0) return 'not on a half-hour boundary'
  return null
}

// Same busy rule as /api/book/slots: every non-cancelled event blocks time.
async function hasConflict(calendar, startMs, endMs, excludeEventId) {
  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: new Date(startMs - 24 * 3600_000).toISOString(),
    timeMax: new Date(endMs).toISOString(),
    singleEvents: true,
    maxResults: 250,
    orderBy: 'startTime',
  })
  return (res.data.items || []).some((e) => {
    if (e.status === 'cancelled' || e.id === excludeEventId) return false
    const s = new Date(e.start?.dateTime || (e.start?.date + 'T00:00:00Z')).getTime()
    const en = new Date(e.end?.dateTime || (e.end?.date + 'T23:59:59Z')).getTime()
    return s < endMs && en > startMs
  })
}

async function autoReschedule(customerEmail, requestedIso) {
  try {
    const start = new Date(requestedIso)
    const invalid = validateSlot(start)
    if (invalid) return { ok: false, reason: invalid }

    const bookings = await getUpcomingBookingsForEmail(customerEmail, 1)
    const booking = bookings[0]
    if (!booking) return { ok: false, reason: 'no upcoming booking found' }
    if (!booking.startTime || !String(booking.startTime).includes('T')) {
      return { ok: false, reason: 'booking is all-day, needs manual handling' }
    }

    const oldStart = new Date(booking.startTime)
    const oldEnd = booking.endTime ? new Date(booking.endTime) : null
    const durMs = oldEnd && oldEnd > oldStart ? oldEnd - oldStart : DEFAULT_DUR_MS
    const endMs = start.getTime() + durMs

    const calendar = getCalendar()
    if (await hasConflict(calendar, start.getTime(), endMs, booking.id)) {
      return { ok: false, reason: 'requested slot is no longer free' }
    }

    // Patch only start/end — patch semantics leave summary/location/description
    // untouched, and booking.id is the instance id for recurring series.
    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: booking.id,
      sendUpdates: 'none',
      requestBody: {
        start: { dateTime: start.toISOString(), timeZone: TZ },
        end: { dateTime: new Date(endMs).toISOString(), timeZone: TZ },
      },
    })

    for (const d of new Set([ctParts(oldStart).dateStr, ctParts(start).dateStr])) {
      await invalidate(`gcal:bookings:date:${d}`).catch(() => {})
    }

    return { ok: true, booking, oldStart, newStart: start }
  } catch (e) {
    console.error('auto-reschedule failed:', e.message)
    return { ok: false, reason: e.message }
  }
}

module.exports = { autoReschedule, validateSlot, ctParts, hasConflict }
