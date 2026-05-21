const { Resend } = require('resend')

const FROM = process.env.PORTAL_FROM_EMAIL || 'noreply@greenguard-usa.com'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.greenguard-usa.com'

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set')
  return new Resend(process.env.RESEND_API_KEY)
}

/**
 * Send a magic login link to the given email.
 */
async function sendMagicLink(email, token) {
  const link = `${APP_URL}/auth/verify?token=${encodeURIComponent(token)}`

  return getResend().emails.send({
    from: `GreenGuard USA <${FROM}>`,
    to: email,
    subject: 'Your GreenGuard login link',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#1a2e1f;border-radius:12px;color:#d4e6ca;">
        <h2 style="color:#7dffaa;font-size:1.4rem;margin:0 0 16px;">Sign in to GreenGuard</h2>
        <p style="margin:0 0 24px;line-height:1.6;color:rgba(212,230,202,0.8);">
          Click the button below to sign in. This link expires in 15 minutes.
        </p>
        <a href="${link}"
           style="display:inline-block;background:#c9a84c;color:#0d1a10;font-weight:700;
                  font-size:0.95rem;padding:14px 28px;border-radius:4px;text-decoration:none;">
          Sign In to My Account
        </a>
        <p style="margin:24px 0 0;font-size:0.82rem;color:rgba(212,230,202,0.45);">
          If you didn't request this link, you can safely ignore this email.
        </p>
      </div>
    `,
  })
}

/**
 * Send a customer service request email to admin.
 */
async function sendServiceRequest(adminEmail, customerInfo, message) {
  const { name, email, address, systemType } = customerInfo
  return getResend().emails.send({
    from: `GreenGuard USA <${FROM}>`,
    to: adminEmail,
    subject: `Service request from ${name || email}`,
    html: `
      <div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:32px 24px;background:#1a2e1f;border-radius:12px;color:#d4e6ca;">
        <h2 style="color:#7dffaa;font-size:1.3rem;margin:0 0 16px;">New Service Request</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <tr><td style="padding:6px 0;color:rgba(212,230,202,0.55);width:110px;">Name</td><td style="padding:6px 0;font-weight:700;">${name || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:rgba(212,230,202,0.55);">Email</td><td style="padding:6px 0;">${email}</td></tr>
          <tr><td style="padding:6px 0;color:rgba(212,230,202,0.55);">Address</td><td style="padding:6px 0;">${address || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:rgba(212,230,202,0.55);">System</td><td style="padding:6px 0;">${systemType || '—'}</td></tr>
        </table>
        <div style="background:rgba(125,255,170,0.06);border-radius:8px;padding:16px;border:1px solid rgba(125,255,170,0.12);">
          <div style="font-size:0.8rem;color:rgba(212,230,202,0.5);margin-bottom:8px;">Message</div>
          <p style="margin:0;line-height:1.6;white-space:pre-wrap;">${message}</p>
        </div>
        <p style="margin:20px 0 0;font-size:0.8rem;color:rgba(212,230,202,0.4);">Sent from GreenGuard Customer Portal</p>
      </div>
    `,
  })
}

/**
 * Send a daily inventory summary email to admin.
 */
async function sendInventoryReport(adminEmail, counts, notes) {
  const rows = [
    ['Full CO₂ tanks', counts.fullTanks],
    ['Empty CO₂ tanks', counts.emptyTanks],
    ['Biogents traps', counts.bgTraps],
    ['Mosqitter units', counts.mosqitterUnits],
    ['Timers', counts.timers],
    ['Bait stations', counts.baitStations],
  ]
  const tableRows = rows.map(([label, val]) =>
    `<tr><td style="padding:6px 12px 6px 0;color:rgba(212,230,202,0.55);">${label}</td><td style="padding:6px 0;font-weight:700;">${val ?? 0}</td></tr>`
  ).join('')

  return getResend().emails.send({
    from: `GreenGuard USA <${FROM}>`,
    to: adminEmail,
    subject: `Daily Inventory — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#1a2e1f;border-radius:12px;color:#d4e6ca;">
        <h2 style="color:#7dffaa;font-size:1.3rem;margin:0 0 16px;">Daily Inventory Report</h2>
        <p style="margin:0 0 16px;font-size:0.85rem;color:rgba(212,230,202,0.5);">
          Submitted ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT
        </p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">${tableRows}</table>
        ${notes ? `<div style="background:rgba(125,255,170,0.06);border-radius:8px;padding:16px;border:1px solid rgba(125,255,170,0.12);"><div style="font-size:0.8rem;color:rgba(212,230,202,0.5);margin-bottom:8px;">Notes</div><p style="margin:0;white-space:pre-wrap;">${notes}</p></div>` : ''}
      </div>
    `,
  })
}

/**
 * Send a formatted service quote to a customer.
 */
async function sendQuote(toEmail, customerName, quoteHtml) {
  return getResend().emails.send({
    from: `GreenGuard USA <${FROM}>`,
    to: toEmail,
    subject: 'Your GreenGuard Service Quote',
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#1a2e1f;border-radius:12px;color:#d4e6ca;">
        <h2 style="color:#7dffaa;font-size:1.3rem;margin:0 0 8px;">GreenGuard USA — Service Quote</h2>
        ${customerName ? `<p style="margin:0 0 24px;color:rgba(212,230,202,0.6);">Prepared for ${customerName}</p>` : '<div style="margin-bottom:24px;"></div>'}
        ${quoteHtml}
        <p style="margin:28px 0 0;font-size:0.82rem;color:rgba(212,230,202,0.4);">
          Questions? Reply to this email or call us. This quote is valid for 30 days.
        </p>
      </div>
    `,
  })
}

module.exports = { sendMagicLink, sendServiceRequest, sendInventoryReport, sendQuote }
