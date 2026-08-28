// Shared booking primitives — extracted from pages/api/admin/book.js so that
// the live admin booking endpoint AND operational library code (e.g. the
// appointment-backfill extender) share ONE implementation of "write an event
// directly to Google Calendar" and "convert a Chicago local datetime to UTC".
//
// Behavior MUST stay identical to the original in book.js — that endpoint is
// live. Any change here changes admin booking too.

const { getCalendar } = require('./gcal')
const biz = require('./business.config')

const TZ = process.env.CALENDAR_TIMEZONE || 'America/Chicago'
const CALENDAR_ID = biz.calendarId

// Direct Google Calendar event creation — used when admin opts to force a
// double-booking through Cal.com's availability check. The event is created
// on the same admin calendar Cal.com syncs to, so it shows up everywhere
// (rounds, route, etc.) just like a Cal.com booking would.
//
// `extraLines` (optional) is appended to the description before the trailing
// footer block — used by the backfill extender to stamp an `Auto-backfill:`
// line. When omitted, the description is byte-for-byte the original book.js
// format so existing admin bookings are unchanged.
async function createDirectGCalEvent({ firstName, lastName, email, phone, address, utcIso, notes, eventTypeTitle, extraLines }) {
  const cal = getCalendar()
  const start = new Date(utcIso)
  const end = new Date(start.getTime() + 30 * 60 * 1000)  // default 30 min
  const name = `${firstName} ${lastName}`.trim()
  const description = [
    `Customer: ${name}`,
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : null,
    address ? `Address: ${address}` : null,
    ...(Array.isArray(extraLines) ? extraLines : []),
    '',
    `Manual admin booking (Cal.com slot was unavailable — forced double-book). ${biz.nameShort}`,
    notes ? '' : null,
    notes ? `Notes: ${notes}` : null,
  ].filter((x) => x !== null).join('\n')
  const r = await cal.events.insert({
    calendarId: CALENDAR_ID,
    sendUpdates: 'none',
    requestBody: {
      summary: `${name}: ${eventTypeTitle || 'Manual booking'} (${biz.bookingTag})`,
      description,
      location: address,
      start: { dateTime: start.toISOString(), timeZone: TZ },
      end:   { dateTime: end.toISOString(),   timeZone: TZ },
    },
  })
  return { uid: r.data.id, source: 'gcal-direct' }
}

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

module.exports = { createDirectGCalEvent, localCTtoUTC, TZ, CALENDAR_ID }
