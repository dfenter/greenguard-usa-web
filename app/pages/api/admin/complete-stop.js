const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { findContactByEmail, addNote, getContactNotes } = require('../../../lib/hubspot')
const { logCompletedStop } = require('../../../lib/gsheets')
const { Resend } = require('resend')
const { escapeHtml } = require('../../../lib/email')

const POST_VISIT_DEDUP_MS = 6 * 60 * 60 * 1000 // 6 hours — covers re-saves on same visit

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

function fmtQtyObj(obj) {
  if (!obj || typeof obj !== 'object') return ''
  return Object.entries(obj)
    .filter(([, qty]) => qty > 0)
    .map(([label, qty]) => `${label}${qty > 1 ? ` ×${qty}` : ''}`)
    .join(', ')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const {
    email, customerName, address, checkIn, checkOut,
    serviceTypes = [], equipmentInstalled = {}, addons = {},
    trapCount, notes, photoTaken, customEmailMessage,
  } = req.body || {}

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const equipStr = fmtQtyObj(equipmentInstalled)
  const addonStr = fmtQtyObj(addons)

  const noteLines = [
    `TECHNICIAN VISIT COMPLETED`,
    `Date: ${today}`,
    `Customer: ${customerName || email || 'Unknown'}`,
    address ? `Address: ${address}` : null,
    checkIn ? `Check-in: ${checkIn}` : null,
    checkOut ? `Check-out: ${checkOut}` : null,
    serviceTypes.length ? `Services: ${serviceTypes.join(', ')}` : null,
    trapCount ? `Traps provided: ${trapCount}` : null,
    equipStr ? `Equipment installed: ${equipStr}` : null,
    addonStr ? `Add-ons applied: ${addonStr}` : null,
    notes ? `\nNotes:\n${notes}` : null,
    `Photo taken: ${photoTaken ? 'Yes' : 'No'}`,
  ].filter(Boolean).join('\n')

  // 1. Log to HubSpot
  if (email) {
    try {
      const contact = await findContactByEmail(email)
      if (contact?.id) await addNote(contact.id, noteLines)
    } catch (err) {
      console.error('complete-stop HubSpot error:', err.message)
    }
  }

  // 2. Auto-export to Google Sheets
  try { await logCompletedStop(req.body) } catch (err) { console.error('complete-stop sheets error:', err.message) }

  // 3. Send post-visit email (use custom message if provided, else skip)
  if (email && customEmailMessage && process.env.RESEND_API_KEY) {
    // Dedup: skip if a post-visit email was already sent in the last 6 hours
    let alreadySent = false
    try {
      const contact = await findContactByEmail(email).catch(() => null)
      if (contact?.id) {
        const notes = await getContactNotes(contact.id, 10).catch(() => [])
        alreadySent = notes.some(n =>
          /\[EMAIL-OUT\]\s*Post-visit/i.test(n.body || '') &&
          (Date.now() - new Date(n.timestamp).getTime()) < POST_VISIT_DEDUP_MS
        )
      }
    } catch {}

    if (alreadySent) {
      console.log('complete-stop: post-visit email already sent within 6h, skipping')
    } else try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const FROM = process.env.PORTAL_FROM_EMAIL || 'noreply@greenguard-usa.com'
      const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.greenguard-usa.com'

      await resend.emails.send({
        from: `GreenGuard USA <${FROM}>`,
        to: email,
        subject: `Your GreenGuard service visit is complete — ${today}`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a2e1f;">
            <div style="background:#0d1a10;border-radius:8px;padding:18px 20px;margin-bottom:24px;">
              <h1 style="color:#7dffaa;font-size:1.1rem;margin:0;">GreenGuard USA</h1>
            </div>
            <div style="white-space:pre-wrap;font-size:0.9rem;color:#333;line-height:1.6;">${escapeHtml(customEmailMessage)}</div>
            <div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;display:flex;gap:12px;flex-wrap:wrap;">
              <a href="${APP_URL}" style="display:inline-block;padding:10px 20px;background:#0d1a10;color:#7dffaa;font-weight:700;font-size:0.85rem;border-radius:6px;text-decoration:none;">View My Account</a>
              <a href="https://search.google.com/local/writereview?placeid=ChIJx8wLC4K11wwRbfe7hhZiHXs" style="display:inline-block;padding:10px 20px;border:1px solid #ddd;color:#555;font-size:0.85rem;border-radius:6px;text-decoration:none;">⭐ Leave a Review</a>
            </div>
          </div>`,
      })
      // Mark sent so re-saves of same stop don't re-send for 6 hours
      try {
        const contact = await findContactByEmail(email).catch(() => null)
        if (contact?.id) await addNote(contact.id, `[EMAIL-OUT] Post-visit email sent on ${today} by ${session.email}`)
      } catch {}
    } catch (err) {
      console.error('complete-stop email error:', err.message)
    }
  }

  res.status(200).json({ ok: true })
}
