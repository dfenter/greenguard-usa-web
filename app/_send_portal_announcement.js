/**
 * One-time send: portal announcement to all active paying customers.
 * Sends via Gmail (OAuth2) to avoid burning Resend's daily quota.
 * Run: DRY_RUN=1 node _send_portal_announcement.js   (preview list, no emails sent)
 *      node _send_portal_announcement.js              (sends for real)
 */
require('dotenv').config({ path: '.env' })

const nodemailer = require('nodemailer')
const Stripe = require('stripe')

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.greenguard-usa.com'
const DRY_RUN = process.env.DRY_RUN === '1'
const DELAY_MS = 500 // ~2/sec, well under Gmail's 14k/day Workspace limit

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    type: 'OAuth2',
    user: 'admin@greenguard-usa.com',
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
  },
})

function firstName(fullName) {
  if (!fullName) return null
  return fullName.trim().split(/\s+/)[0]
}

function buildHtml(first) {
  const greeting = first
    ? `<p style="margin:0 0 20px;font-size:15px;font-weight:700;color:#111f14;font-family:Arial,sans-serif;">Hi ${first},</p>`
    : ''

  return `<!DOCTYPE html>
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
      <td bgcolor="#ffffff" style="padding:32px 32px 28px;border-left:1px solid #dde8de;border-right:1px solid #dde8de;">
        ${greeting}
        <p style="margin:0 0 20px;font-size:15px;color:#3d4f41;line-height:1.7;font-family:Arial,sans-serif;">We just launched a customer portal where you can keep an eye on your service from anywhere.</p>

        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
          <tr>
            <td bgcolor="#f7fbf6" style="border-radius:10px;border:1px solid #e3eedb;padding:18px 20px;">
              <p style="margin:0 0 12px;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#0d8a3c;font-family:Arial,sans-serif;">What's inside</p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="padding:5px 0;font-size:14px;color:#1a2e1f;font-family:Arial,sans-serif;"><span style="color:#0d8a3c;font-weight:800;margin-right:8px;">&#10003;</span>Upcoming and past appointments</td></tr>
                <tr><td style="padding:5px 0;font-size:14px;color:#1a2e1f;font-family:Arial,sans-serif;"><span style="color:#0d8a3c;font-weight:800;margin-right:8px;">&#10003;</span>Invoice history and one-click payment</td></tr>
                <tr><td style="padding:5px 0;font-size:14px;color:#1a2e1f;font-family:Arial,sans-serif;"><span style="color:#0d8a3c;font-weight:800;margin-right:8px;">&#10003;</span>Live CO&#8322; tank level estimate</td></tr>
                <tr><td style="padding:5px 0;font-size:14px;color:#1a2e1f;font-family:Arial,sans-serif;"><span style="color:#0d8a3c;font-weight:800;margin-right:8px;">&#10003;</span>Current system view: trap count, tank count, and equipment details</td></tr>
                <tr><td style="padding:5px 0;font-size:14px;color:#1a2e1f;font-family:Arial,sans-serif;"><span style="color:#0d8a3c;font-weight:800;margin-right:8px;">&#10003;</span>Equipment upgrades available for your system</td></tr>
                <tr><td style="padding:5px 0;font-size:14px;color:#1a2e1f;font-family:Arial,sans-serif;"><span style="color:#c9a84c;font-weight:800;margin-right:8px;">&#9733;</span>Referral program: earn $25 for every neighbor you send our way</td></tr>
              </table>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#111f14;font-family:Arial,sans-serif;">Signing in is simple. No password needed.</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
          <tr>
            <td bgcolor="#f7fbf6" style="border-radius:10px;border:1px solid #e3eedb;padding:16px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="28" valign="top" style="font-size:13px;font-weight:800;color:#0d8a3c;font-family:Arial,sans-serif;padding:4px 0;">1.</td>
                  <td style="font-size:14px;color:#3d4f41;font-family:Arial,sans-serif;padding:4px 0;">Go to <a href="${APP_URL}/login" style="color:#2d6a3f;font-weight:700;">portal.greenguard-usa.com</a></td>
                </tr>
                <tr>
                  <td width="28" valign="top" style="font-size:13px;font-weight:800;color:#0d8a3c;font-family:Arial,sans-serif;padding:4px 0;">2.</td>
                  <td style="font-size:14px;color:#3d4f41;font-family:Arial,sans-serif;padding:4px 0;">Enter the email address on your account</td>
                </tr>
                <tr>
                  <td width="28" valign="top" style="font-size:13px;font-weight:800;color:#0d8a3c;font-family:Arial,sans-serif;padding:4px 0;">3.</td>
                  <td style="font-size:14px;color:#3d4f41;font-family:Arial,sans-serif;padding:4px 0;">Click the link we send you</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
          <tr>
            <td align="center" bgcolor="#c9a84c" style="border-radius:6px;">
              <a href="${APP_URL}/login" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:800;color:#111800;text-decoration:none;font-family:Arial,sans-serif;">Open My Account &rarr;</a>
            </td>
          </tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e8efe9;">
          <tr><td style="padding-top:16px;font-size:12px;color:#9aab9c;font-family:Arial,sans-serif;">
            Questions or trouble signing in? Reply to this email or text us at <a href="tel:5125604129" style="color:#2d6a3f;font-weight:700;">512-560-4129</a>.
          </td></tr>
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
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function main() {
  // Pull all Stripe customers with at least one paid invoice
  const allCustomers = []
  let hasMore = true
  let startingAfter
  while (hasMore) {
    const batch = await stripe.customers.list({ limit: 100, starting_after: startingAfter })
    allCustomers.push(...batch.data)
    hasMore = batch.has_more
    if (hasMore) startingAfter = batch.data[batch.data.length - 1].id
  }

  const active = []
  const seen = new Set()
  for (const c of allCustomers) {
    const email = (c.email || '').toLowerCase().trim()
    if (!email || seen.has(email)) continue
    const invoices = await stripe.invoices.list({ customer: c.id, status: 'paid', limit: 1 })
    if (invoices.data.length > 0) {
      seen.add(email)
      active.push({ email: c.email, name: c.name })
    }
  }

  console.log(`\nRecipient list (${active.length} customers):`)
  active.forEach((c, i) => console.log(`  ${i + 1}. ${c.email} | ${c.name}`))

  if (DRY_RUN) {
    console.log('\nDRY RUN — no emails sent. Remove DRY_RUN=1 to send.')
    return
  }

  console.log('\nSending...')
  let sent = 0, failed = 0
  for (const c of active) {
    const first = firstName(c.name)
    const html = buildHtml(first)
    try {
      const info = await transporter.sendMail({
        from: 'GreenGuard USA <admin@greenguard-usa.com>',
        to: c.email,
        subject: 'Welcome to the GreenGuard USA portal',
        html,
      })
      console.log(`  sent ${c.email} (${info.messageId})`)
      sent++
    } catch (err) {
      console.error(`FAIL ${c.email}: ${err.message}`)
      failed++
    }
    await sleep(DELAY_MS)
  }

  console.log(`\nDone. Sent: ${sent}, Failed: ${failed}`)
}

main().catch(console.error)
