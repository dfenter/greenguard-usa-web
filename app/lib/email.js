const { Resend } = require('resend')
const { google } = require('googleapis')
const biz = require('./business.config')
const notifyQueue = require('./notify-queue')

const FROM = process.env.PORTAL_FROM_EMAIL || `noreply@${biz.email.split('@')[1]}`
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || `https://portal.${biz.email.split('@')[1]}`

function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }
  return String(str ?? '').replace(/[&<>"']/g, (c) => map[c])
}

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set')
  return new Resend(process.env.RESEND_API_KEY)
}

// Resend resolves API failures as `{ error }` in some cases instead of
// rejecting. Treat a response without a provider id as unconfirmed too.
function assertSendOk(result) {
  return Boolean(result && !result.error && (result.data?.id || result.id))
}

// Primary sender: the Gmail REST API (users.messages.send).
// Uses the dedicated GMAIL_* admin@ token; GOOGLE_* is calendar-only and can't
// send, so prefer GMAIL_* and only fall back to GOOGLE_* if it's unset.
//
// Deliberately NOT nodemailer's SMTP 'gmail' transport: that does real SMTP
// AUTH XOAUTH2, which Google only accepts for tokens carrying the full
// `https://mail.google.com/` scope. The GMAIL_* token instead carries the
// granular Gmail API scopes (gmail.compose/gmail.modify) — plenty for
// messages.send via the REST API, but SMTP login rejects it with
// "535 BadCredentials". Calling the REST API directly sends with the scopes
// the token actually has, no re-consent needed.
function getGmailAuth() {
  const clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN
  const auth = new google.auth.OAuth2(clientId, clientSecret)
  auth.setCredentials({ refresh_token: refreshToken })
  return auth
}

function base64url(str) {
  return Buffer.from(str, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sendViaGmailApi({ to, subject, html, bcc, from, labelIds }) {
  const gmail = google.gmail({ version: 'v1', auth: getGmailAuth() })
  const toList = Array.isArray(to) ? to.join(', ') : to
  const bccList = bcc ? (Array.isArray(bcc) ? bcc.join(', ') : bcc) : null
  const headers = [
    `From: ${from}`,
    `To: ${toList}`,
    bccList ? `Bcc: ${bccList}` : null,
    `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
  ].filter(Boolean).join('\r\n')
  const raw = base64url(`${headers}\r\n\r\n${html}`)
  const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
  // Self-addressed ops mail never reaches Gmail's filter engine (filters run on
  // inbound delivery only), so a settings filter on these silently no-ops. Label
  // it ourselves instead. NOTE: messages.send accepts a labelIds field but
  // ignores it — only messages.insert honors it — so this must be a follow-up
  // modify call. Verified against the live API: send-with-labelIds does nothing.
  // Best-effort: a labelling failure must never turn into a lost email, since
  // the message itself is already delivered by this point.
  if (labelIds && labelIds.length) {
    try {
      await gmail.users.messages.modify({
        userId: 'me',
        id: res.data.id,
        requestBody: { addLabelIds: labelIds },
      })
    } catch (e) {
      console.warn('ops label apply failed for %s (%s) — email still sent', res.data.id, e.message)
    }
  }
  return { messageId: res.data.id }
}

// The direct send path: Gmail API first, Resend as backup only.
// Owner policy 2026-08-18: "Everything should always default to send from the
// Mac if possible; Resend is always backup only." Gmail-first also conserves
// Resend quota. Consequence: Gmail can only send as admin@greenguard-usa.com
// (the sole verified sendAs identity — Gmail rewrites any other From), so
// customer mail now arrives from admin@ instead of noreply@, and replies land
// in the admin inbox. Used directly by the local daemon, and by sendEmail()
// below as the backup path when local isn't available or doesn't answer in
// time — one source of truth for how an email actually goes out.
async function sendEmailDirect({ to, subject, html, bcc, from }) {
  const resendFrom = from || `${biz.name} <${FROM}>`
  const gmailFrom = from || `${biz.name} <${biz.email}>`
  // Try Gmail first; fall back to Resend on ANY Gmail failure so a Gmail
  // hiccup never drops the email. No labelIds here: customer mail must not
  // get the Daily Ops label (that's purchase-notify.js only).
  try {
    return await sendViaGmailApi({ to, subject, html, bcc, from: gmailFrom })
  } catch (e) {
    // With no Resend key configured there is no backup — propagate.
    if (!process.env.RESEND_API_KEY) throw e
    console.warn('Gmail send threw (%s) — falling back to Resend', e.message)
  }
  const r = await getResend().emails.send({
    from: resendFrom,
    to,
    subject,
    html,
    ...(bcc ? { bcc } : {}),
  })
  if (!assertSendOk(r)) throw new Error(`Resend send failed or was unconfirmed: ${r?.error?.message || 'no provider id'}`)
  return r
}

/**
 * Local-first send: if the local notify daemon is alive, this hands off to it
 * (see notify-queue.sendLocalFirst); otherwise it calls sendEmailDirect() —
 * "the current method" — with zero added latency and identical behavior to the
 * pre-local-first code. The daemon uses the exact same sendEmailDirect(), so
 * there's a single source of truth for how an email actually goes out.
 */
async function sendEmail({ to, subject, html, bcc, from }) {
  return notifyQueue.sendLocalFirst({ kind: 'email', to, subject, html, bcc, from }, sendEmailDirect)
}

// Bulletproof light-mode email shell. Pass inner <td> content as body string.
function emailShell(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f0f4f1;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0f4f1">
<tr><td align="center" style="padding:32px 16px;">
  <table width="580" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;">
    <tr>
      <td align="center" bgcolor="#1a3320" style="border-radius:10px 10px 0 0;padding:24px 32px;">
        <p style="margin:0;font-size:20px;font-weight:900;color:#ffffff;font-family:Arial,sans-serif;letter-spacing:-0.5px;">${biz.nameShort}</p>
        <p style="margin:4px 0 0;font-size:11px;font-weight:700;color:#7dbc8a;letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif;">Smart &middot; Safe &middot; Effective</p>
      </td>
    </tr>
    <tr>
      <td bgcolor="#ffffff" style="padding:32px 32px 28px;border-left:1px solid #dde8de;border-right:1px solid #dde8de;">
        ${body}
      </td>
    </tr>
    <tr>
      <td align="center" bgcolor="#dde8de" style="border-radius:0 0 10px 10px;padding:18px 32px;border:1px solid #dde8de;border-top:0;">
        <p style="margin:0 0 3px;font-size:12px;font-weight:700;color:#1a3320;font-family:Arial,sans-serif;">${biz.nameShort}</p>
        <p style="margin:0;font-size:11px;color:#4a6650;font-family:Arial,sans-serif;">${biz.city} &nbsp;&#183;&nbsp; ${biz.phone} &nbsp;&#183;&nbsp; <a href="https://www.greenguard-usa.com" style="color:#2d6a3f;">greenguard-usa.com</a></p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>`
}

// Bulletproof gold button
function goldButton(href, label) {
  return `
  <table cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" bgcolor="#c9a84c" style="border-radius:6px;">
        <a href="${href}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:800;color:#111800;text-decoration:none;font-family:Arial,sans-serif;">${label}</a>
      </td>
    </tr>
  </table>`
}

// Outlined secondary button
function outlineButton(href, label) {
  return `
  <table cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" bgcolor="#ffffff" style="border-radius:6px;border:2px solid #2d6a3f;">
        <a href="${href}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:700;color:#2d6a3f;text-decoration:none;font-family:Arial,sans-serif;">${label}</a>
      </td>
    </tr>
  </table>`
}

/**
 * Magic login link — sent to every customer who signs in.
 */
async function sendMagicLink(email, token, code) {
  const link = `${APP_URL}/auth/verify?token=${encodeURIComponent(token)}`
  // The code block is for the home-screen app: tapping the link opens Safari
  // (a separate storage context from the installed PWA), so app users type this
  // code in the app instead to sign in where they actually use it.
  const codeBlock = code ? `
        <div style="margin:0 0 28px;padding:18px 20px;background:#f2f7f0;border:1px solid #d7e6d2;border-radius:10px;text-align:center;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#3d4f41;text-transform:uppercase;letter-spacing:1px;font-family:Arial,sans-serif;">Using the home-screen app? Enter this code</p>
          <p style="margin:0;font-size:34px;font-weight:900;letter-spacing:8px;color:#111f14;font-family:'Courier New',monospace;">${code}</p>
        </div>` : ''
  try {
    return await sendEmail({
      to: email,
      subject: `Your ${biz.nameShort} login link`,
      html: emailShell(`
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#2d6a3f;text-transform:uppercase;letter-spacing:2px;font-family:Arial,sans-serif;">Sign In</p>
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#111f14;font-family:Arial,sans-serif;">Your login link is ready.</h1>
        <p style="margin:0 0 28px;font-size:15px;color:#3d4f41;line-height:1.7;font-family:Arial,sans-serif;">
          Click the button below to sign in to your GreenGuard account. This link expires in 15 minutes.
        </p>
        ${goldButton(link, 'Sign In to My Account')}
        ${codeBlock}
        <p style="margin:24px 0 0;font-size:12px;color:#9aab9c;font-family:Arial,sans-serif;line-height:1.6;">
          If you didn't request this link, you can safely ignore this email.
        </p>
      `),
    })
  } catch (e) {
    console.error('sendMagicLink failed:', e.message)
    return { ok: false, error: e.message }
  }
}

/**
 * Post-purchase welcome email for new quote customers.
 */
async function sendWelcomeEmail({ email, customerName, magicLink, calLink }) {
  try {
    const name = customerName ? customerName.split(' ')[0] : 'there'
    const bookingUrl = calLink || `https://cal.com/${biz.calSlug}/${biz.assessmentSlug}`

    return sendEmail({
      to: email,
      subject: `Welcome to ${biz.nameShort} — here's what's next`,
      html: emailShell(`
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#2d6a3f;text-transform:uppercase;letter-spacing:2px;font-family:Arial,sans-serif;">Payment Confirmed</p>
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#111f14;font-family:Arial,sans-serif;">Hey ${escapeHtml(name)}, you're all set.</h1>
        <p style="margin:0 0 24px;font-size:15px;color:#3d4f41;line-height:1.7;font-family:Arial,sans-serif;">Your GreenGuard service is confirmed. Here's exactly what happens next.</p>

        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">
          <tr>
            <td bgcolor="#f4f8f5" style="border-radius:8px;padding:18px 20px;border-left:3px solid #c9a84c;">
              <p style="margin:0 0 6px;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#c9a84c;font-family:Arial,sans-serif;">Step 1</p>
              <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#111f14;font-family:Arial,sans-serif;">Book your installation</p>
              <p style="margin:0 0 14px;font-size:13px;color:#3d4f41;line-height:1.6;font-family:Arial,sans-serif;">Pick a time and we'll come out to install your trap(s), set up CO&#8322;, and walk you through everything. Takes about an hour.</p>
              ${goldButton(bookingUrl, 'Book Installation Time &rarr;')}
            </td>
          </tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">
          <tr>
            <td bgcolor="#f4f8f5" style="border-radius:8px;padding:18px 20px;border-left:3px solid #2d6a3f;">
              <p style="margin:0 0 6px;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#2d6a3f;font-family:Arial,sans-serif;">Step 2</p>
              <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#111f14;font-family:Arial,sans-serif;">Sign in to your account</p>
              <p style="margin:0 0 14px;font-size:13px;color:#3d4f41;line-height:1.6;font-family:Arial,sans-serif;">View service history, upcoming visits, and equipment details. No password needed.</p>
              ${outlineButton(magicLink, 'Sign In to My Account &rarr;')}
              <p style="margin:8px 0 0;font-size:11px;color:#9aab9c;font-family:Arial,sans-serif;">Link expires in 15 minutes. Request a new one anytime at ${APP_URL.replace(/^https?:\/\//, '')}</p>
            </td>
          </tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
          <tr>
            <td bgcolor="#f4f8f5" style="border-radius:8px;padding:18px 20px;border-left:3px solid #7dbc8a;">
              <p style="margin:0 0 6px;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#7dbc8a;font-family:Arial,sans-serif;">Step 3</p>
              <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#111f14;font-family:Arial,sans-serif;">Results in 6&ndash;8 weeks</p>
              <p style="margin:0;font-size:13px;color:#3d4f41;line-height:1.6;font-family:Arial,sans-serif;">Most customers notice fewer bites within 2&ndash;4 weeks. Maximum effectiveness at 6&ndash;8 weeks as the local population drops. The trap runs 24/7.</p>
            </td>
          </tr>
        </table>

        <p style="margin:0;font-size:13px;color:#9aab9c;font-family:Arial,sans-serif;line-height:1.6;">
          Questions? Reply to this email or call/text <a href="tel:${biz.phoneTel}" style="color:#2d6a3f;font-weight:700;">${biz.phone}</a>.
        </p>
      `),
    })
  } catch (e) {
    console.error('sendWelcomeEmail failed:', e.message)
    return { ok: false, error: e.message }
  }
}

/**
 * Customer-initiated request (service visit, reschedule, or pause).
 * Emails the admin and sends the customer a confirmation. Sends are best-effort:
 * the admin send must succeed; the customer confirmation is swallowed on failure.
 */
async function sendServiceRequest(adminEmail, customer = {}, message = '', { subject, heading, confirmHeading } = {}) {
  const name = customer.name || customer.email || 'A customer'
  const subj = subject || `Service Request: ${name}`

  const detailRows = [
    ['Customer', customer.name],
    ['Email', customer.email],
    ['Address', customer.address],
    ['System', customer.systemType],
    ['Upcoming visit', customer.bookingDate],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr>
      <td style="padding:6px 0;font-size:13px;color:#9aab9c;font-family:Arial,sans-serif;width:130px;">${k}</td>
      <td style="padding:6px 0;font-size:13px;font-weight:700;color:#111f14;font-family:Arial,sans-serif;">${escapeHtml(v)}</td>
    </tr>`)
    .join('')

  // ── Admin notification (must succeed) ──
  await sendEmail({
    to: adminEmail,
    subject: subj,
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#2d6a3f;text-transform:uppercase;letter-spacing:2px;font-family:Arial,sans-serif;">Customer Request</p>
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#111f14;font-family:Arial,sans-serif;">${escapeHtml(heading || 'New request from your dashboard')}</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#3d4f41;line-height:1.7;font-family:Arial,sans-serif;">${escapeHtml(message)}</p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;border-top:1px solid #dde8de;padding-top:8px;">${detailRows}</table>
    `),
  })

  // ── Customer confirmation (best-effort) ──
  if (customer.email) {
    try {
      const firstName = (customer.name || '').split(' ')[0] || 'there'
      await sendEmail({
        to: customer.email,
        subject: `We received your request — ${biz.nameShort}`,
        html: emailShell(`
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#2d6a3f;text-transform:uppercase;letter-spacing:2px;font-family:Arial,sans-serif;">Request Received</p>
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#111f14;font-family:Arial,sans-serif;">Hi ${escapeHtml(firstName)}, we got it.</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#3d4f41;line-height:1.7;font-family:Arial,sans-serif;">${escapeHtml(confirmHeading || 'Thanks for reaching out. Our team will follow up shortly to confirm the details.')}</p>
          <p style="margin:0;font-size:13px;color:#9aab9c;font-family:Arial,sans-serif;line-height:1.6;">
            Questions? Reply to this email or call/text <a href="tel:${biz.phoneTel}" style="color:#2d6a3f;font-weight:700;">${biz.phone}</a>.
          </p>
        `),
      })
    } catch (e) {
      console.error('service request confirmation failed:', e.message)
    }
  }
}

module.exports = {
  sendMagicLink, sendWelcomeEmail, sendEmail, sendServiceRequest, escapeHtml, emailShell, goldButton, outlineButton, assertSendOk,
  sendEmailDirect, // exported for the local notify daemon (scripts/local-notify-daemon.js) and tests
  sendViaGmailApi, // exported for admin-copy notifications that must stay off the Resend daily quota
}
