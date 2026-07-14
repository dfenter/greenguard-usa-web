// POST /api/book/create
// Creates a GCal event, sends confirmation email, notifies admin, upserts HubSpot.
import { getCalendar } from '../../../lib/gcal'
import { upsertContact } from '../../../lib/hubspot'
import { sendEmail, emailShell, escapeHtml } from '../../../lib/email'
import { fireBookingConversions } from '../../../lib/booking-conversions'
import { consumeJti } from '../../../lib/auth'

const CALENDAR_ID = process.env.CALENDAR_ID || 'admin@greenguard-usa.com'
const TZ = 'America/Chicago'
const SLOT_MIN = 30

// Global cross-instance rate limit via KV so this unauthenticated endpoint
// can't be scripted to stuff the calendar / spam HubSpot+email. No-ops if KV
// is unset. 6 bookings per IP per hour is far above any real customer.
async function rateLimitOk(ip, max = 6, windowSec = 3600) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return true
  try {
    const key = `book-create:${ip}`
    const r = await fetch(`${process.env.KV_REST_API_URL}/incr/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    })
    const j = await r.json().catch(() => ({}))
    const count = Number(j?.result || 0)
    if (count === 1) {
      await fetch(`${process.env.KV_REST_API_URL}/expire/${encodeURIComponent(key)}/${windowSec}`, {
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      }).catch(() => {})
    }
    return count <= max
  } catch {
    return true // fail open — availability over strictness
  }
}

function fmtDT(iso) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: TZ, timeZoneName: 'short',
  })
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() || 'unknown'
  if (!(await rateLimitOk(ip))) {
    return res.status(429).json({ error: 'Too many booking requests — please try again later or call us.' })
  }

  const { name, email, phone, street, city, state, zip, startISO, notes,
          gclid, fbclid, fbp, gaClientId, eventId } = req.body || {}

  if (!name || !email || !street || !city || !zip || !startISO) {
    return res.status(400).json({ error: 'name, email, street, city, zip, and startISO are required' })
  }

  const stateVal = state || 'TX'
  const address = `${street}, ${city}, ${stateVal} ${zip}`
  const endISO = new Date(new Date(startISO).getTime() + SLOT_MIN * 60000).toISOString()
  const formattedDT = fmtDT(startISO)
  const firstName = name.trim().split(/\s+/)[0]

  const description = [
    `Customer: ${name}`,
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : null,
    `Address: ${address}`,
    notes ? `Notes: ${notes}` : null,
    '',
    '(Booked via greenguard-usa.com)',
  ].filter(l => l !== null).join('\n')

  try {
    // Claim the exact customer/slot pair before the insert. KV failures are
    // deliberately fail-open here: public availability is more important than
    // rejecting a legitimate booking when the optional claim store is down.
    const claimKey = `book:${email.trim().toLowerCase()}:${startISO}`
    try {
      const claimed = await consumeJti(claimKey, 600)
      if (!claimed) {
        return res.status(409).json({ error: 'That time was just booked. Please choose another slot.' })
      }
    } catch (e) {
      console.warn('[book/create] slot claim unavailable; proceeding with availability check:', e.message)
    }

    // Re-check the exact slot immediately before insertion. The month-level
    // availability response is advisory and can be stale when two customers
    // submit the same slot concurrently.
    const calendar = getCalendar()
    const occupied = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: new Date(startISO).toISOString(),
      timeMax: endISO,
      singleEvents: true,
      showDeleted: false,
      maxResults: 250,
      orderBy: 'startTime',
    })
    const slotStart = new Date(startISO).getTime()
    const slotEnd = new Date(endISO).getTime()
    const overlaps = (occupied.data.items || []).some((event) => {
      if (event.status === 'cancelled') return false
      const eventStart = new Date(event.start?.dateTime || `${event.start?.date}T00:00:00Z`).getTime()
      const eventEnd = new Date(event.end?.dateTime || `${event.end?.date}T23:59:59Z`).getTime()
      return Number.isFinite(eventStart) && Number.isFinite(eventEnd) && slotStart < eventEnd && slotEnd > eventStart
    })
    if (overlaps) {
      return res.status(409).json({ error: 'That time is no longer available. Please choose another slot.' })
    }

    // Create GCal event
    await calendar.events.insert({
      calendarId: CALENDAR_ID,
      sendUpdates: 'none',
      requestBody: {
        summary: `${name}: Free Property Assessment (GreenGuard USA)`,
        location: address,
        description,
        start: { dateTime: startISO, timeZone: TZ },
        end: { dateTime: endISO, timeZone: TZ },
        attendees: [{ email }],
      },
    })

    // 2-5. Confirmation email, admin notify, HubSpot upsert, ad conversions.
    // MUST be awaited (via allSettled, so one failure never blocks another) —
    // Vercel's Node.js serverless runtime can freeze/tear down the function the
    // instant res.status(200) is sent, killing any still-in-flight fire-and-forget
    // promise. That was silently dropping the admin notify: logs showed "sending
    // admin notify" but the request to Resend never got to finish resolving
    // ("could not be resolved") because the response had already gone out.
    console.log(`[book/create] booking OK for ${name} <${email}> @ ${formattedDT} — sending notifications`)

    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress

    const results = await Promise.allSettled([
      sendEmail({
        to: email,
        subject: `Your assessment is confirmed — ${formattedDT}`,
        html: emailShell(`
          <h2 style="margin:0 0 16px;font-size:1.25rem;color:#1a3320;font-family:Arial,sans-serif;">You're booked, ${escapeHtml(firstName)}!</h2>
          <p style="margin:0 0 20px;color:#444;font-family:Arial,sans-serif;line-height:1.6;font-size:0.95rem;">
            Your free property assessment with GreenGuard USA is confirmed.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f9f5;border-left:4px solid #2d6a35;border-radius:4px;margin:0 0 24px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 6px;font-weight:800;font-size:1.05rem;color:#1a3320;font-family:Arial,sans-serif;">${escapeHtml(formattedDT)}</p>
              <p style="margin:0;color:#555;font-family:Arial,sans-serif;font-size:0.9rem;">${escapeHtml(address)}</p>
            </td></tr>
          </table>
          <p style="margin:0 0 10px;color:#555;font-size:0.9rem;font-family:Arial,sans-serif;line-height:1.6;">
            <strong>What to expect:</strong> We'll walk your property (about 30 minutes), identify the best trap placement, and give you an honest recommendation with no pressure and no obligation.
          </p>
          ${notes ? `<p style="margin:10px 0;color:#555;font-size:0.9rem;font-family:Arial,sans-serif;"><strong>Your notes:</strong> ${escapeHtml(notes)}</p>` : ''}
          <p style="margin:20px 0 0;color:#888;font-size:0.82rem;font-family:Arial,sans-serif;line-height:1.5;">
            Need to reschedule or cancel? Call or text us at <a href="tel:5125604129" style="color:#2d6a35;font-weight:700;">512-560-4129</a>
            or reply to this email and we'll get it sorted.
          </p>
        `),
      }),
      // Admin notification, sent from admin@ (NOT the default noreply@, which our
      // own inbox spam filter flags).
      sendEmail({
        to: CALENDAR_ID,
        from: `GreenGuard Bookings <admin@greenguard-usa.com>`,
        subject: `New booking: ${name} — ${formattedDT}`,
        html: emailShell(`
          <h2 style="margin:0 0 16px;font-size:1.1rem;color:#1a3320;font-family:Arial,sans-serif;">New Property Assessment Booking</h2>
          <table cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;font-size:0.9rem;width:100%;">
            <tr><td style="padding:5px 0;color:#888;white-space:nowrap;padding-right:16px;">Name</td><td style="padding:5px 0;font-weight:700;">${escapeHtml(name)}</td></tr>
            <tr><td style="padding:5px 0;color:#888;">Email</td><td style="padding:5px 0;"><a href="mailto:${escapeHtml(email)}" style="color:#2d6a35;">${escapeHtml(email)}</a></td></tr>
            ${phone ? `<tr><td style="padding:5px 0;color:#888;">Phone</td><td style="padding:5px 0;"><a href="tel:${phone.replace(/\D/g, '')}" style="color:#2d6a35;">${escapeHtml(phone)}</a></td></tr>` : ''}
            <tr><td style="padding:5px 0;color:#888;">Address</td><td style="padding:5px 0;">${escapeHtml(address)}</td></tr>
            <tr><td style="padding:5px 0;color:#888;">When</td><td style="padding:5px 0;font-weight:700;">${escapeHtml(formattedDT)}</td></tr>
            ${notes ? `<tr><td style="padding:5px 0;color:#888;">Notes</td><td style="padding:5px 0;">${escapeHtml(notes)}</td></tr>` : ''}
          </table>
          <p style="margin:20px 0 0;">
            <a href="https://calendar.google.com/calendar/r" style="background:#2d6a35;color:#fff;padding:10px 20px;border-radius:5px;text-decoration:none;font-weight:700;font-family:Arial,sans-serif;display:inline-block;font-size:0.85rem;">Open Google Calendar</a>
          </p>
        `),
      }),
      upsertContact({ email, name, phone, address }),
      // Server-side ad conversions. The client-side gtag/fbq Lead events are
      // unreliable (iOS/ad-block, Meta Audience Network), so fire the durable
      // server signal so Google/Meta bidding can optimize toward bookings.
      fireBookingConversions({
        email, phone, gclid, fbclid, fbp, gaClientId, eventId,
        clientIp, userAgent: req.headers['user-agent'],
      }),
    ])

    const [customerConfirm, adminNotify, hubspot, conversions] = results
    if (customerConfirm.status === 'rejected') console.error('[book/create] customer confirm failed:', customerConfirm.reason?.message)
    if (adminNotify.status === 'rejected') console.error(`[book/create] admin notify FAILED for ${name} <${email}>:`, adminNotify.reason?.message)
    else if (adminNotify.value?.queued) console.log(`[book/create] admin notify QUEUED for ${name}:`, adminNotify.value.sentBy || 'daemon-pending')
    else if (adminNotify.value?.sentBy || adminNotify.value?.data?.id || adminNotify.value?.messageId) console.log(`[book/create] admin notify SENT for ${name}:`, adminNotify.value.sentBy || adminNotify.value.data?.id || adminNotify.value.messageId)
    else console.error(`[book/create] admin notify UNCONFIRMED for ${name}`)
    if (hubspot.status === 'rejected') console.error('[book/create] HubSpot failed:', hubspot.reason?.message)
    if (conversions.status === 'rejected') console.error('[book/create] conversions failed:', conversions.reason?.message)

    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('[book/create]', e.message)
    return res.status(500).json({ error: e.message })
  }
}
