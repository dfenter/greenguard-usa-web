const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { findContactByEmail, addNote, getContactNotes } = require('../../../lib/hubspot')
const { logCompletedStop } = require('../../../lib/gsheets')
const { sendEmail, escapeHtml } = require('../../../lib/email')

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
      const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.greenguard-usa.com'

      await sendEmail({
        to: email,
        subject: `Your GreenGuard service visit is complete — ${today}`,
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f0f4f1;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0f4f1">
<tr><td align="center" style="padding:32px 16px;">
  <table width="580" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;">
    <tr>
      <td align="center" bgcolor="#1a3320" style="border-radius:10px 10px 0 0;padding:24px 32px;">
        <p style="margin:0;font-size:20px;font-weight:900;color:#ffffff;font-family:Arial,sans-serif;">GreenGuard USA</p>
        <p style="margin:4px 0 0;font-size:11px;font-weight:700;color:#7dbc8a;letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif;">Service Complete</p>
      </td>
    </tr>
    <tr>
      <td bgcolor="#ffffff" style="padding:32px;border-left:1px solid #dde8de;border-right:1px solid #dde8de;">
        <div style="font-size:15px;color:#3d4f41;line-height:1.75;white-space:pre-wrap;font-family:Arial,sans-serif;margin-bottom:28px;">${escapeHtml(customEmailMessage)}</div>
        <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">
          <tr>
            <td align="center" bgcolor="#c9a84c" style="border-radius:6px;">
              <a href="${APP_URL}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:800;color:#111800;text-decoration:none;font-family:Arial,sans-serif;">View My Account</a>
            </td>
          </tr>
        </table>
        <table cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center" bgcolor="#ffffff" style="border-radius:6px;border:2px solid #2d6a3f;">
              <a href="https://g.page/r/CW33u4YWYh17EBM/review" style="display:inline-block;padding:10px 22px;font-size:14px;font-weight:700;color:#2d6a3f;text-decoration:none;font-family:Arial,sans-serif;">&#11088; Leave a Review</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="center" bgcolor="#dde8de" style="border-radius:0 0 10px 10px;padding:18px 32px;border:1px solid #dde8de;border-top:0;">
        <p style="margin:0 0 3px;font-size:12px;font-weight:700;color:#1a3320;font-family:Arial,sans-serif;">GreenGuard USA</p>
        <p style="margin:0;font-size:11px;color:#4a6650;font-family:Arial,sans-serif;">Austin, TX &nbsp;&#183;&nbsp; 512-560-4129 &nbsp;&#183;&nbsp; <a href="https://www.greenguard-usa.com" style="color:#2d6a3f;">greenguard-usa.com</a></p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>`,
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
