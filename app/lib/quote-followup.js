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
  const html = `
    <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a2e1f;">
      <div style="background:#0d1a10;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
        <h1 style="color:#7dffaa;font-size:1.1rem;margin:0;">GreenGuard USA</h1>
      </div>
      <p>Hi ${esc(first)},</p>
      <p>Following up on the mosquito control quote we sent over a couple days ago. Just want to make sure you saw it and didn't have any questions.</p>
      <p>Quick recap of what's included:</p>
      <ul style="color:#444;line-height:1.6;">
        <li>Professional CO₂ trap install at your property</li>
        <li>Monthly tank exchange + maintenance — no work on your end</li>
        <li>30-day money-back guarantee, cancel any time</li>
      </ul>
      <div style="margin:24px 0;text-align:center;">
        <a href="${esc(quoteUrl)}" style="display:inline-block;padding:12px 28px;background:#c9a84c;color:#0d1a10;font-weight:700;border-radius:6px;text-decoration:none;font-size:1rem;">View your quote →</a>
      </div>
      <p style="font-size:0.9rem;color:#555;">If now's not the right time or you have questions, just reply to this email — goes straight to the owner. Happy to chat about anything.</p>
      <p style="font-size:0.78rem;color:#888;margin-top:24px;">
        GreenGuard USA · Austin TX · <a href="tel:+15125604129" style="color:#888;">512-560-4129</a>
      </p>
    </div>`
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
  const html = `
    <div style="font-family:-apple-system,sans-serif;max-width:560px;padding:20px;">
      <h2 style="color:#c9a84c;margin:0 0 12px;">Cold quote — time for a personal touch</h2>
      <p>It's been 7 days since this quote went out. Customer hasn't paid, and the auto-follow-up email at T+48h didn't get them off the fence either.</p>
      <ul style="color:#333;">
        <li>Customer: <strong>${esc(customerName || '?')}</strong> &lt;${esc(customerEmail)}&gt;</li>
        <li>Quote total: <strong>$${parseFloat(amountDue || 0).toFixed(2)}</strong></li>
        <li>Quote URL: <a href="${esc(quoteUrl)}">${esc(quoteUrl)}</a></li>
        <li>jti: <code>${esc(jti)}</code></li>
      </ul>
      <p><strong>Next step:</strong> Call or send a personal email. If they're a no-go, log a <code>[QUOTE-DEAD]</code> note on their HubSpot to silence further auto-follow-ups.</p>
      <p style="color:#888;font-size:0.85rem;">Auto-flow will mark this <code>[QUOTE-LOST]</code> at T+14d unless they pay or you log [QUOTE-DEAD].</p>
    </div>`
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
