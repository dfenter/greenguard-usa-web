/**
 * Quick smoke-test: sends one real email for each customer-facing template.
 * Run from app/ directory:  node _test_emails.js
 */
require('dotenv').config({ path: '.env' })

const { Resend } = require('resend')
const { sendMagicLink, sendWelcomeEmail, emailShell, goldButton, outlineButton } = require('./lib/email')

const TO = 'admin@greenguard-usa.com'
const FROM = process.env.PORTAL_FROM_EMAIL || 'noreply@greenguard-usa.com'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.greenguard-usa.com'

const resend = new Resend(process.env.RESEND_API_KEY)

function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }
  return String(str ?? '').replace(/[&<>"']/g, (c) => map[c])
}

async function send(subject, html) {
  const r = await resend.emails.send({ from: `GreenGuard USA <${FROM}>`, to: TO, subject, html })
  console.log(subject, '→', r.error ? `ERROR: ${r.error.message}` : `sent ${r.data?.id}`)
}

async function main() {
  // 1. Magic login link
  await sendMagicLink(TO, 'test-token-abc123')

  // 2. Welcome email
  await sendWelcomeEmail({
    email: TO,
    customerName: 'Test Customer',
    magicLink: `${APP_URL}/auth/verify?token=test-token-xyz`,
    calLink: 'https://cal.com/greenguard-usa',
  })

  // 3. Post-visit (complete-stop) email
  const visitMsg = `Hi Jane,\n\nYour GreenGuard service visit is complete for today, June 8, 2026.\n\nWe swapped your CO₂ tank and checked your trap placement. Catch count this cycle: excellent.\n\nYour next visit is scheduled for July 8, 2026. We'll send a reminder the day before.\n\nThanks for being a GreenGuard customer!`
  await send(
    '[TEST] Post-Visit — Your GreenGuard service visit is complete',
    `<!DOCTYPE html>
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
        <div style="font-size:15px;color:#3d4f41;line-height:1.75;white-space:pre-wrap;font-family:Arial,sans-serif;margin-bottom:28px;">${escapeHtml(visitMsg)}</div>
        <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">
          <tr><td align="center" bgcolor="#c9a84c" style="border-radius:6px;"><a href="${APP_URL}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:800;color:#111800;text-decoration:none;font-family:Arial,sans-serif;">View My Account</a></td></tr>
        </table>
        <table cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" bgcolor="#ffffff" style="border-radius:6px;border:2px solid #2d6a3f;"><a href="https://search.google.com/local/writereview?placeid=ChIJx8wLC4K11wwRbfe7hhZiHXs" style="display:inline-block;padding:10px 22px;font-size:14px;font-weight:700;color:#2d6a3f;text-decoration:none;font-family:Arial,sans-serif;">&#11088; Leave a Review</a></td></tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="center" bgcolor="#dde8de" style="border-radius:0 0 10px 10px;padding:18px 32px;border:1px solid #dde8de;border-top:0;">
        <p style="margin:0 0 3px;font-size:12px;font-weight:700;color:#1a3320;font-family:Arial,sans-serif;">GreenGuard USA</p>
        <p style="margin:0;font-size:11px;color:#4a6650;font-family:Arial,sans-serif;">Austin, TX &#183; 512-560-4129 &#183; <a href="https://www.greenguard-usa.com" style="color:#2d6a3f;">greenguard-usa.com</a></p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>`
  )

  // 4. Admin send-message (custom freeform)
  const customMsg = `Hi Jane,\n\nJust a quick heads up that your next CO₂ delivery is coming up on July 8th between 9–11 AM.\n\nNo action needed on your end, we'll take care of everything.\n\nLet us know if you need to reschedule.`
  const htmlBody = escapeHtml(customMsg).replace(/\n/g, '<br/>')
  await send(
    '[TEST] Send-Message — Upcoming delivery reminder',
    `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f0f4f1;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0f4f1">
<tr><td align="center" style="padding:32px 16px;">
  <table width="580" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;">
    <tr>
      <td align="center" bgcolor="#1a3320" style="border-radius:10px 10px 0 0;padding:24px 32px;">
        <p style="margin:0;font-size:20px;font-weight:900;color:#ffffff;font-family:Arial,sans-serif;">GreenGuard USA</p>
        <p style="margin:4px 0 0;font-size:11px;font-weight:700;color:#7dbc8a;letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif;">Austin, TX</p>
      </td>
    </tr>
    <tr>
      <td bgcolor="#ffffff" style="padding:32px;border-left:1px solid #dde8de;border-right:1px solid #dde8de;">
        <p style="margin:0 0 20px;font-size:15px;font-weight:700;color:#111f14;font-family:Arial,sans-serif;">Hi Jane,</p>
        <div style="font-size:15px;line-height:1.75;color:#3d4f41;font-family:Arial,sans-serif;">${htmlBody}</div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;border-top:1px solid #e8efe9;">
          <tr><td style="padding-top:16px;font-size:12px;color:#9aab9c;font-family:Arial,sans-serif;">Questions? Reply to this email or text us at <a href="tel:5125604129" style="color:#2d6a3f;font-weight:700;">512-560-4129</a>.</td></tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="center" bgcolor="#dde8de" style="border-radius:0 0 10px 10px;padding:18px 32px;border:1px solid #dde8de;border-top:0;">
        <p style="margin:0 0 3px;font-size:12px;font-weight:700;color:#1a3320;font-family:Arial,sans-serif;">GreenGuard USA</p>
        <p style="margin:0;font-size:11px;color:#4a6650;font-family:Arial,sans-serif;">Austin, TX &#183; 512-560-4129 &#183; <a href="https://www.greenguard-usa.com" style="color:#2d6a3f;">greenguard-usa.com</a></p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>`
  )

  // 5. Quote email (simplified — no map/JWT)
  const quoteHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f0f4f1;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0f4f1">
<tr><td align="center" style="padding:32px 16px;">
  <table width="580" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;font-family:Arial,sans-serif;">
    <tr>
      <td align="center" bgcolor="#1a3320" style="border-radius:10px 10px 0 0;padding:24px 32px;">
        <p style="margin:0;font-size:20px;font-weight:900;color:#ffffff;font-family:Arial,sans-serif;">GreenGuard USA</p>
        <p style="margin:4px 0 0;font-size:11px;font-weight:700;color:#7dbc8a;letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif;">Austin, TX</p>
      </td>
    </tr>
    <tr>
      <td bgcolor="#ffffff" style="padding:28px 28px 8px;border-left:1px solid #dde8de;border-right:1px solid #dde8de;">
        <h2 style="margin:0 0 4px;font-size:20px;font-weight:900;color:#111f14;font-family:Arial,sans-serif;">Service Quote for Jane Smith</h2>
        <p style="margin:0 0 20px;font-size:13px;color:#6b7f6e;font-family:Arial,sans-serif;">This quote is valid for 30 days from today.</p>
        <div style="margin:0 0 16px;padding:16px 18px;background:#f7fbf6;border-radius:10px;border:1px solid #e3eedb;">
          <p style="margin:0 0 10px;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#0d8a3c;font-family:Arial,sans-serif;">Monthly Recurring</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="font-size:14px;color:#1a2e1f;padding:4px 0;font-family:Arial,sans-serif;">Full-Service Trap Rental (1 trap)</td><td align="right" style="font-size:14px;color:#1a2e1f;font-weight:700;white-space:nowrap;padding:4px 0;font-family:Arial,sans-serif;">$159.99/mo</td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #d4e8c8;margin-top:8px;padding-top:8px;">
            <tr><td style="font-size:14px;color:#0d8a3c;font-weight:800;padding:6px 0 0;font-family:Arial,sans-serif;">Total per month</td><td align="right" style="font-size:14px;color:#0d8a3c;font-weight:800;white-space:nowrap;padding:6px 0 0;font-family:Arial,sans-serif;">$159.99/mo</td></tr>
          </table>
        </div>
        <div style="margin:0 0 16px;padding:16px 18px;background:#f6f9fb;border-radius:10px;border:1px solid #dde6ed;">
          <p style="margin:0 0 10px;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#1565c0;font-family:Arial,sans-serif;">One-Time Charges (Due With First Visit)</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="font-size:14px;color:#1a2e1f;padding:4px 0;font-family:Arial,sans-serif;">Trap Installation</td><td align="right" style="font-size:14px;color:#1a2e1f;font-weight:700;white-space:nowrap;padding:4px 0;font-family:Arial,sans-serif;">$75.00</td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #ccdde8;margin-top:8px;padding-top:8px;">
            <tr><td style="font-size:14px;color:#1565c0;font-weight:800;padding:6px 0 0;font-family:Arial,sans-serif;">Total due with first visit</td><td align="right" style="font-size:14px;color:#1565c0;font-weight:800;white-space:nowrap;padding:6px 0 0;font-family:Arial,sans-serif;">$75.00</td></tr>
          </table>
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
          <tr>
            <td bgcolor="#1a3320" style="border-radius:8px;padding:16px 20px;">
              <p style="margin:0 0 8px;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#7dbc8a;font-family:Arial,sans-serif;">Summary</p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:14px;color:#ffffff;font-family:Arial,sans-serif;padding:3px 0;">Due with first visit</td><td align="right" style="font-size:14px;font-weight:800;color:#ffffff;white-space:nowrap;font-family:Arial,sans-serif;padding:3px 0;">$75.00</td></tr></table>
              <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:14px;color:#a8edc0;font-family:Arial,sans-serif;padding:3px 0;">Then monthly</td><td align="right" style="font-size:14px;font-weight:800;color:#a8edc0;white-space:nowrap;font-family:Arial,sans-serif;padding:3px 0;">$159.99/mo</td></tr></table>
            </td>
          </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#c9a84c" style="border-radius:6px;"><a href="${APP_URL}" style="display:inline-block;padding:16px 40px;font-size:16px;font-weight:800;color:#111800;text-decoration:none;font-family:Arial,sans-serif;">Review &amp; Approve Quote &rarr;</a></td></tr></table></td></tr>
        </table>
        <p style="margin:0 0 24px;font-size:13px;color:#9aab9c;text-align:center;font-family:Arial,sans-serif;">Questions? Reply to this email or call <a href="tel:+15125604129" style="color:#2d6a3f;font-weight:700;">512-560-4129</a></p>
      </td>
    </tr>
    <tr>
      <td align="center" bgcolor="#dde8de" style="border-radius:0 0 10px 10px;padding:18px 32px;border:1px solid #dde8de;border-top:0;">
        <p style="margin:0 0 3px;font-size:12px;font-weight:700;color:#1a3320;font-family:Arial,sans-serif;">GreenGuard USA</p>
        <p style="margin:0;font-size:11px;color:#4a6650;font-family:Arial,sans-serif;">Austin, TX &#183; 512-560-4129 &#183; <a href="https://www.greenguard-usa.com" style="color:#2d6a3f;">greenguard-usa.com</a></p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>`
  await send('[TEST] Quote — Service Quote for Jane Smith', quoteHtml)
}

main().catch(console.error)
