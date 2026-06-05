// Quote-engagement follow-up helpers.
//
// State machine (tracked via HubSpot notes keyed by jti):
//
//   [QUOTE-SENT]            ← written when admin sends quote
//   [QUOTE-FOLLOWUP-T48]    ← cron, T+48h, no engagement
//   [QUOTE-COLD]            ← cron, T+7d, admin alerted
//   [QUOTE-PAID]            ← cron, when Stripe session completes
//   [QUOTE-LOST]            ← cron, T+14d with no engagement
//
// Engagement signal: Stripe checkout session for this jti exists with
// status='complete' (paid). Sessions that only reached 'open' or expired
// don't count as engagement.

const { Resend } = require('resend')
const { stripe } = require('./stripe')

const FROM = process.env.PORTAL_FROM_EMAIL || 'noreply@greenguard-usa.com'
const ADMIN_EMAIL = process.env.OWNER_EMAIL || process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;'}[c]))
}

// ── T+48h customer nudge ─────────────────────────────────────────────────────
async function sendT48Email({ to, customerName, quoteUrl, amountDue }) {
  if (!process.env.RESEND_API_KEY || !to) return { skipped: true }
  const first = (customerName || '').split(' ')[0] || 'there'
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a1a0d;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:24px 16px">

  <!-- Main card -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0d1a10 0%,#1a2e1f 100%);border:1px solid rgba(122,171,130,0.2);border-radius:12px;margin-bottom:12px">
    <tr>
      <td style="padding:26px 28px 18px">
        <div style="color:#c9a84c;font-size:10px;font-weight:800;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:10px">GreenGuard USA &nbsp;&middot;&nbsp; Your Quote</div>
        <div style="color:#ffffff;font-size:24px;font-weight:900;letter-spacing:-0.02em;line-height:1.2">Hi ${esc(first)}, still thinking it over?</div>
        <div style="color:rgba(212,230,202,0.55);font-size:14px;margin-top:6px">Just circling back on your mosquito control quote.</div>
      </td>
    </tr>
    <tr>
      <td style="padding:0 28px 24px">
        <div style="border-top:1px solid rgba(122,171,130,0.15);padding-top:18px">
          <div style="color:rgba(212,230,202,0.8);font-size:14px;line-height:1.75;margin-bottom:18px">
            <p style="margin:0 0 14px">Quick recap of what's included in your quote:</p>
          </div>
          <!-- Feature list (table-based for email clients) -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px">
            <tr>
              <td style="padding:6px 0;vertical-align:top;width:20px"><span style="color:#7dffaa;font-weight:900">&#10003;</span></td>
              <td style="padding:6px 0;color:rgba(212,230,202,0.8);font-size:14px">Professional CO&#8322; trap install at your property</td>
            </tr>
            <tr>
              <td style="padding:6px 0;vertical-align:top;width:20px"><span style="color:#7dffaa;font-weight:900">&#10003;</span></td>
              <td style="padding:6px 0;color:rgba(212,230,202,0.8);font-size:14px">Monthly tank exchange + maintenance. No work on your end.</td>
            </tr>
            <tr>
              <td style="padding:6px 0;vertical-align:top;width:20px"><span style="color:#7dffaa;font-weight:900">&#10003;</span></td>
              <td style="padding:6px 0;color:rgba(212,230,202,0.8);font-size:14px">30-day money-back guarantee, cancel any time</td>
            </tr>
          </table>
          <!-- CTA -->
          <table cellpadding="0" cellspacing="0" style="margin-bottom:18px">
            <tr>
              <td>
                <a href="${esc(quoteUrl)}" style="display:inline-block;background:#c9a84c;color:#0a1a0d;font-weight:900;font-size:13px;padding:13px 28px;border-radius:6px;text-decoration:none;letter-spacing:0.06em;text-transform:uppercase">View Your Quote</a>
              </td>
            </tr>
          </table>
          <div style="color:rgba(122,171,130,0.5);font-size:13px;line-height:1.6">Questions or not the right time? Just reply. Goes straight to the owner.</div>
        </div>
      </td>
    </tr>
  </table>

  <div style="text-align:center;color:rgba(122,171,130,0.18);font-size:10px;letter-spacing:0.08em;text-transform:uppercase">GreenGuard USA &nbsp;&middot;&nbsp; Austin TX &nbsp;&middot;&nbsp; 512-560-4129</div>
</div>
</body>
</html>`
  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: `GreenGuard USA <${FROM}>`,
    to,
    reply_to: ADMIN_EMAIL,
    subject: `Following up on your GreenGuard quote`,
    html,
  })
  return { sent: true }
}

// ── T+7d admin alert ─────────────────────────────────────────────────────────
async function sendT7dAdminAlert({ customerName, customerEmail, quoteUrl, amountDue, jti }) {
  if (!process.env.RESEND_API_KEY) return { skipped: true }
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a1a0d;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:20px 16px">

  <!-- Alert card -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0d1a10 0%,#1a2e1f 100%);border:1px solid rgba(122,171,130,0.2);border-radius:12px;margin-bottom:12px">
    <tr>
      <td style="padding:24px 28px 18px">
        <div style="color:#c9a84c;font-size:10px;font-weight:800;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:10px">GreenGuard USA &nbsp;&middot;&nbsp; Cold Quote Alert</div>
        <div style="color:#ffffff;font-size:22px;font-weight:900;letter-spacing:-0.02em">Time for a personal touch.</div>
        <div style="color:rgba(212,230,202,0.55);font-size:14px;margin-top:6px">7 days out. Auto-follow-up didn't convert.</div>
      </td>
    </tr>
    <tr>
      <td style="padding:0 28px 24px">
        <!-- Quote details -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(0,0,0,0.22);border:1px solid rgba(122,171,130,0.12);border-radius:8px;margin-bottom:20px">
          <tr>
            <td style="padding:12px 18px;border-bottom:1px solid rgba(122,171,130,0.1)">
              <div style="color:#c9a84c;font-size:10px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:3px">Customer</div>
              <div style="color:#ffffff;font-weight:700;font-size:14px">${esc(customerName || '?')} &lt;${esc(customerEmail)}&gt;</div>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 18px;border-bottom:1px solid rgba(122,171,130,0.1)">
              <div style="color:#c9a84c;font-size:10px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:3px">Quote Total</div>
              <div style="color:#7dffaa;font-weight:900;font-size:18px">$${parseFloat(amountDue || 0).toFixed(2)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 18px">
              <div style="color:#c9a84c;font-size:10px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:3px">Quote Link</div>
              <a href="${esc(quoteUrl)}" style="color:rgba(122,171,130,0.7);font-size:12px;word-break:break-all;text-decoration:none">${esc(quoteUrl)}</a>
            </td>
          </tr>
        </table>
        <div style="color:rgba(212,230,202,0.75);font-size:14px;line-height:1.7;margin-bottom:12px">
          <strong style="color:#ffffff">Next step:</strong> Call or send a personal email. If they're a no-go, log <span style="background:rgba(201,168,76,0.12);border:1px solid rgba(201,168,76,0.3);border-radius:4px;padding:1px 6px;color:#c9a84c;font-size:12px;font-weight:800">[QUOTE-DEAD]</span> in HubSpot to stop auto-follow-ups.
        </div>
        <div style="color:rgba(122,171,130,0.4);font-size:12px">Auto-flow marks this <code style="background:rgba(122,171,130,0.1);padding:1px 5px;border-radius:3px">[QUOTE-LOST]</code> at T+14d unless paid or dead. jti: <code style="color:rgba(122,171,130,0.4)">${esc(jti)}</code></div>
      </td>
    </tr>
  </table>

  <div style="text-align:center;color:rgba(122,171,130,0.18);font-size:10px;letter-spacing:0.08em;text-transform:uppercase">GreenGuard USA &nbsp;&middot;&nbsp; Internal Alert</div>
</div>
</body>
</html>`
  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: `GreenGuard Alerts <${FROM}>`,
    to: ADMIN_EMAIL,
    subject: `Cold quote: ${customerName || customerEmail} ($${parseFloat(amountDue || 0).toFixed(2)})`,
    html,
  })
  return { sent: true }
}

// ── Check Stripe for jti engagement ──────────────────────────────────────────
// Returns true if customer reached checkout and completed payment.
// We cache the result on the calling cron's per-run map to avoid re-scanning
// Stripe sessions for each contact.
async function buildPaidJtiSet(sinceUnix) {
  const paid = new Set()
  let starting_after
  do {
    const page = await stripe.checkout.sessions.list({
      limit: 100,
      created: { gte: sinceUnix },
      ...(starting_after ? { starting_after } : {}),
    })
    for (const s of page.data) {
      const jti = s.metadata?.quote_jti
      if (jti && (s.payment_status === 'paid' || s.status === 'complete')) {
        paid.add(jti)
      }
    }
    starting_after = page.has_more ? page.data[page.data.length - 1]?.id : undefined
  } while (starting_after)
  return paid
}

module.exports = { sendT48Email, sendT7dAdminAlert, buildPaidJtiSet }
