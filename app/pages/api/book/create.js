// POST /api/book/create
// Creates a GCal event, sends confirmation email, notifies admin, upserts HubSpot.
import { getCalendar } from '../../../lib/gcal'
import { upsertContact } from '../../../lib/hubspot'
import { sendEmail, emailShell, escapeHtml } from '../../../lib/email'
import { fireBookingConversions } from '../../../lib/booking-conversions'

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
    // 1. Create GCal event
    const calendar = getCalendar()
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

    // 2. Confirmation email to customer (non-blocking — a send failure here must
    //    never abort the admin notification or the rest of the handler)
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
    }).catch(e => console.error('[book/create] customer confirm failed:', e.message))

    // 3. Admin notification (non-blocking). Sent from admin@ (NOT the default
    //    noreply@, which our own inbox spam filter flags). Every attempt +
    //    outcome is logged so a silent miss is visible in the function logs.
    console.log(`[book/create] booking OK for ${name} <${email}> @ ${formattedDT} — sending admin notify`)
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
    })
      .then(r => console.log(`[book/create] admin notify SENT for ${name}:`, r?.data?.id || r?.messageId || 'ok'))
      .catch(e => console.error(`[book/create] admin notify FAILED for ${name} <${email}>:`, e.message))

    // 4. HubSpot upsert (non-blocking)
    upsertContact({ email, name, phone, address }).catch(e => console.error('[book/create] HubSpot failed:', e.message))

    // 5. Server-side ad conversions (non-blocking). The client-side gtag/fbq Lead
    // events are unreliable (iOS/ad-block, Meta Audience Network), so fire the
    // durable server signal so Google/Meta bidding can optimize toward bookings.
    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress
    fireBookingConversions({
      email, phone, gclid, fbclid, fbp, gaClientId, eventId,
      clientIp, userAgent: req.headers['user-agent'],
    }).catch(e => console.error('[book/create] conversions failed:', e.message))

    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('[book/create]', e.message)
    return res.status(500).json({ error: e.message })
  }
}
