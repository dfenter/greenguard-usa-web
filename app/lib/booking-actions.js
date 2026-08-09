// Admin booking mutations shared by the portal API pages AND the local chat
// daemon's MCP tools (which require() this file straight from the checkout,
// like local-notify-daemon.js does with lib/email.js). One implementation of
// book / reschedule / cancel / note so business rules live in exactly one place:
//
//  - No appointment may START before 10:00am CT (validateSlot, same rules as
//    the customer booking picker: Mon-Fri, 10:00-17:30 starts, half-hour
//    boundary, 4h notice).
//  - Customers are NEVER notified: Cal.com cancel notify=false, every GCal
//    write sendUpdates:'none'. No caller can opt in - there is no parameter.
//  - Event format comes from createDirectGCalEvent (title
//    "Name: Service (GreenGuard USA)" + Email:/Phone:/Address: lines) so
//    Rounds/route parsing never breaks.
//  - The gcal read caches are invalidated after every mutation so /admin/rounds
//    and the route views see the change within seconds, not the 120s TTL.
//    invalidate() clears the shared Redis tier, so a mutation made on the Mac
//    propagates to Vercel too.

const { getCalendar } = require('./gcal')
const { invalidate } = require('./cache')
const { validateSlot, ctParts, hasConflict } = require('./auto-reschedule')
const { rescheduleBooking, cancelBooking } = require('./calcom')
const { stripe, findInvoiceForBooking } = require('./stripe')
const { createDirectGCalEvent, localCTtoUTC, TZ, CALENDAR_ID } = require('./booking')

const DEFAULT_DUR_MS = 45 * 60_000

async function invalidateBookingCaches(dates) {
  const tz = process.env.CALENDAR_TIMEZONE || 'America/Chicago'
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const keys = new Set([
    `gcal:bookings:today:${todayStr}`,
    'gcal:upcoming:250',
    'gcal:upcoming:100',
  ])
  for (const d of dates) if (d) keys.add(`gcal:bookings:date:${d}`)
  for (const k of keys) await invalidate(k).catch(() => {})
}

// Wall-clock CT date ("YYYY-MM-DD") of an instant, for cache keys.
function ctDateStr(date) {
  return ctParts(new Date(date)).dateStr
}

// Move an appointment. Cal.com path preferred (keeps Cal.com in sync);
// GCal patch fallback for legacy events or when Cal.com rejects.
// Returns { ok, via, oldStart, newStart } or { ok:false, reason }.
async function rescheduleAppointment({ bookingUid, eventId, newStartIso, durationMin }) {
  const start = new Date(newStartIso)
  const invalid = validateSlot(start)
  if (invalid) return { ok: false, reason: `Refused: requested time is ${invalid}. Appointments are Mon-Fri, first start 10:00am CT, last start 5:30pm CT, on the half hour, with at least 4h notice.` }

  const calendar = getCalendar()

  // Fetch the current event when we have its id - gives us the old start for
  // cache invalidation and the duration to preserve.
  let ev = null
  if (eventId) {
    try { ev = (await calendar.events.get({ calendarId: CALENDAR_ID, eventId })).data } catch {}
  }
  const oldStart = ev?.start?.dateTime || null
  const oldEnd = ev?.end?.dateTime || null
  const durMs = durationMin ? durationMin * 60_000
    : (oldStart && oldEnd ? new Date(oldEnd) - new Date(oldStart) : DEFAULT_DUR_MS)

  if (await hasConflict(calendar, start.getTime(), start.getTime() + durMs, eventId).catch(() => false)) {
    return { ok: false, reason: 'Refused: that slot conflicts with another appointment.' }
  }

  if (bookingUid) {
    try {
      await rescheduleBooking(bookingUid, start.toISOString())
      await invalidateBookingCaches([oldStart && ctDateStr(oldStart), ctDateStr(start)])
      return { ok: true, via: 'cal.com', oldStart, newStart: start.toISOString() }
    } catch (e) {
      console.error('booking-actions cal.com reschedule failed:', e.message)
      // fall through to GCal patch
    }
  }

  if (!ev) return { ok: false, reason: 'Could not find the calendar event to move (need a valid eventId).' }
  await calendar.events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    sendUpdates: 'none',
    requestBody: {
      start: { dateTime: start.toISOString(), timeZone: TZ },
      end: { dateTime: new Date(start.getTime() + durMs).toISOString(), timeZone: TZ },
    },
  })
  await invalidateBookingCaches([oldStart && ctDateStr(oldStart), ctDateStr(start)])
  return { ok: true, via: 'gcal', oldStart, newStart: start.toISOString() }
}

// Cancel an appointment and safely handle its Stripe invoice. The invoice
// block mirrors pages/api/admin/cancel-booking.js: resolve by booking identity
// (cal_booking_uid or service_date), void open / delete draft / never touch
// paid, and treat "no confident match" as a no-op - never a guess.
async function cancelAppointment({ bookingUid, eventId, customerEmail, serviceDate, reason }) {
  let cancelledVia = null
  let ev = null
  const calendar = getCalendar()
  if (eventId) {
    try { ev = (await calendar.events.get({ calendarId: CALENDAR_ID, eventId })).data } catch {}
  }

  if (bookingUid) {
    try {
      await cancelBooking(bookingUid, reason || 'Cancelled by admin', false)
      cancelledVia = 'cal.com'
    } catch (e) {
      console.error('booking-actions cal.com cancel failed:', e.message)
    }
  }
  if (!cancelledVia) {
    if (!ev) return { ok: false, reason: 'Could not find the appointment to cancel (need a Cal.com bookingUid or a valid eventId).' }
    await calendar.events.delete({ calendarId: CALENDAR_ID, eventId, sendUpdates: 'none' })
    cancelledVia = 'gcal'
  }

  let invoiceAction = null
  let invoiceError = null
  const svcDate = serviceDate || (ev?.start?.dateTime ? ctDateStr(ev.start.dateTime) : null)
  if (customerEmail && (bookingUid || svcDate)) {
    try {
      const match = await findInvoiceForBooking(customerEmail, { calBookingUid: bookingUid, serviceDate: svcDate })
      if (!match) {
        invoiceAction = 'skipped_no_match'
      } else {
        // findInvoiceForBooking is cached (30s). Re-read immediately before
        // mutating so we never void based on a stale status.
        const invoice = await stripe.invoices.retrieve(match.id)
        if (invoice.status === 'open') {
          await stripe.invoices.voidInvoice(invoice.id)
          invoiceAction = 'voided'
        } else if (invoice.status === 'draft') {
          await stripe.invoices.del(invoice.id)
          invoiceAction = 'deleted'
        } else {
          invoiceAction = `skipped_${invoice.status}`
        }
      }
    } catch (err) {
      console.error('booking-actions invoice error:', err.message)
      invoiceAction = 'error'
      invoiceError = err.message
    }
  } else if (customerEmail) {
    invoiceAction = 'skipped_no_identifier'
  }

  if (ev?.start?.dateTime) await invalidateBookingCaches([ctDateStr(ev.start.dateTime)])
  else await invalidateBookingCaches([svcDate])

  return { ok: true, via: cancelledVia, invoiceAction, ...(invoiceError ? { invoiceError } : {}) }
}

// Create a new appointment as a direct GCal event - silent by design (no
// Cal.com confirmation email). startLocal is "YYYY-MM-DDTHH:mm" CT.
async function bookAppointment({ firstName, lastName, email, phone, address, startLocal, serviceTitle, notes }) {
  if (!firstName || !email || !address || !startLocal) {
    return { ok: false, reason: 'firstName, email, address and startLocal are all required.' }
  }
  const utcIso = localCTtoUTC(startLocal)
  const start = new Date(utcIso)
  const invalid = validateSlot(start)
  if (invalid) return { ok: false, reason: `Refused: requested time is ${invalid}. Appointments are Mon-Fri, first start 10:00am CT, last start 5:30pm CT, on the half hour, with at least 4h notice.` }

  const calendar = getCalendar()
  if (await hasConflict(calendar, start.getTime(), start.getTime() + 30 * 60_000, null).catch(() => false)) {
    return { ok: false, reason: 'Refused: that slot conflicts with another appointment.' }
  }

  const created = await createDirectGCalEvent({
    firstName, lastName: lastName || '', email, phone, address, utcIso,
    notes, eventTypeTitle: serviceTitle,
  })
  await invalidateBookingCaches([ctDateStr(start)])
  return { ok: true, uid: created.uid, start: utcIso }
}

// Append a NOTE: line to the GCal event description (what Rounds parses via
// parseAppointmentNotes) AND insert into the event_notes table (what the admin
// UI note panel reads). Never HubSpot.
async function appendEventNote({ eventId, note, authorEmail, customerEmail }) {
  if (!eventId || !note) return { ok: false, reason: 'eventId and note required' }
  const calendar = getCalendar()
  const ev = (await calendar.events.get({ calendarId: CALENDAR_ID, eventId })).data
  const desc = ev.description || ''
  await calendar.events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    sendUpdates: 'none',
    requestBody: { description: `${desc}${desc.endsWith('\n') || !desc ? '' : '\n'}NOTE: ${note}` },
  })
  try {
    const { q } = require('./db')
    await q(
      `INSERT INTO event_notes (event_id, customer_email, author_email, body) VALUES ($1, $2, $3, $4)`,
      [eventId, customerEmail || null, authorEmail || 'assistant', note]
    )
  } catch (e) {
    console.error('booking-actions event_notes insert failed:', e.message)
  }
  if (ev.start?.dateTime) await invalidateBookingCaches([ctDateStr(ev.start.dateTime)])
  return { ok: true }
}

module.exports = { rescheduleAppointment, cancelAppointment, bookAppointment, appendEventNote, invalidateBookingCaches }
