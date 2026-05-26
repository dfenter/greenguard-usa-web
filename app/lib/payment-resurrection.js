// Failed-payment resurrection helpers.
//
// Three escalation stages, all gated on invoice still being unpaid + state
// stored in Stripe invoice metadata (no extra database).
//
//   T+0    fire on Stripe webhook invoice.payment_failed
//   T+48h  cron scans, sends a second nudge + SMS
//   T+7d   cron drafts admin alert; flag HubSpot as churn-risk
//
// On invoice.payment_succeeded all stage markers are wiped so a re-fail
// later starts a fresh series.

const { Resend } = require('resend')
const { stripe } = require('./stripe')
const { findContactByEmail, addNote, updateContact } = require('./hubspot')
const { sendSms } = require('./sms')

const FROM = process.env.PORTAL_FROM_EMAIL || 'noreply@greenguard-usa.com'
const ADMIN_EMAIL = process.env.OWNER_EMAIL || process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.greenguard-usa.com'

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;'}[c]))
}

function fmt$(cents) { return `$${(cents/100).toFixed(2)}` }

// Stripe customer billing portal link (lets them update card-on-file)
async function billingPortalUrl(customerId) {
  try {
    const s = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${APP_URL}/dashboard/billing`,
    })
    return s.url
  } catch { return `${APP_URL}/dashboard/billing` }
}

// ── Stage T+0 ────────────────────────────────────────────────────────────────
async function sendT0Email(invoice, customer) {
  if (!process.env.RESEND_API_KEY || !customer.email) return { skipped: true }
  const portal = await billingPortalUrl(customer.id)
  const html = `
    <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a2e1f;">
      <div style="background:#0d1a10;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        <h1 style="color:#7dffaa;font-size:1.1rem;margin:0;">GreenGuard USA</h1>
      </div>
      <p style="font-size:1rem;">Hi ${esc(customer.name?.split(' ')[0] || 'there')},</p>
      <p>Quick heads-up — your most recent payment of <strong>${fmt$(invoice.amount_due)}</strong> didn't go through (your card was declined or there were insufficient funds).</p>
      <p>No action needed on the service side — your trap is still working. Just need to settle this when you have a minute:</p>
      <div style="margin:24px 0;text-align:center;">
        <a href="${esc(invoice.hosted_invoice_url)}" style="display:inline-block;padding:12px 24px;background:#7dffaa;color:#0d1a10;font-weight:700;border-radius:6px;text-decoration:none;">Pay invoice (${fmt$(invoice.amount_due)})</a>
      </div>
      <p style="font-size:0.85rem;color:#555;">Need to update your card? <a href="${esc(portal)}" style="color:#0d8a3c;">Manage payment methods</a></p>
      <p style="font-size:0.85rem;color:#555;">Questions? Just reply to this email — goes straight to admin.</p>
    </div>`
  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: `GreenGuard USA <${FROM}>`,
    to: customer.email,
    reply_to: ADMIN_EMAIL,
    subject: `Quick fix — your GreenGuard payment didn't go through`,
    html,
  })
  return { sent: true, to: customer.email }
}

// ── Stage T+48h ──────────────────────────────────────────────────────────────
async function sendT48hReminder(invoice, customer) {
  let emailOk = false, smsOk = false
  if (process.env.RESEND_API_KEY && customer.email) {
    const portal = await billingPortalUrl(customer.id)
    const html = `
      <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a2e1f;">
        <div style="background:#fef3c7;border-radius:8px;padding:16px 20px;margin-bottom:20px;border-left:4px solid #c9a84c;">
          <strong style="color:#92400e;">Reminder — payment still outstanding</strong>
        </div>
        <p>Hi ${esc(customer.name?.split(' ')[0] || 'there')},</p>
        <p>We sent a note two days ago about a declined charge of <strong>${fmt$(invoice.amount_due)}</strong>. Just bumping this up so it doesn't get lost:</p>
        <div style="margin:24px 0;text-align:center;">
          <a href="${esc(invoice.hosted_invoice_url)}" style="display:inline-block;padding:12px 24px;background:#7dffaa;color:#0d1a10;font-weight:700;border-radius:6px;text-decoration:none;">Pay invoice</a>
        </div>
        <p style="font-size:0.85rem;color:#555;">Trouble with your card? <a href="${esc(portal)}" style="color:#0d8a3c;">Update payment method</a> · or reply with a question.</p>
      </div>`
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: `GreenGuard USA <${FROM}>`,
      to: customer.email,
      reply_to: ADMIN_EMAIL,
      subject: `Reminder — GreenGuard payment of ${fmt$(invoice.amount_due)} still pending`,
      html,
    })
    emailOk = true
  }
  // SMS escalation
  const contact = customer.email ? await findContactByEmail(customer.email).catch(() => null) : null
  const phone = customer.phone || contact?.properties?.phone
  if (phone && process.env.TWILIO_AUTH_TOKEN) {
    const r = await sendSms({
      to: phone,
      body: `GreenGuard: a ${fmt$(invoice.amount_due)} payment didn't go through. Pay or update card here: ${invoice.hosted_invoice_url}`,
    })
    smsOk = r.ok
  }
  return { email: emailOk, sms: smsOk }
}

// ── Stage T+7d ───────────────────────────────────────────────────────────────
async function sendT7dAdminAlert(invoice, customer) {
  const contact = customer.email ? await findContactByEmail(customer.email).catch(() => null) : null
  // Mark churn-risk on HubSpot
  if (contact?.id) {
    await addNote(
      contact.id,
      `[CHURN-RISK] Payment failed 7d ago, no resolution after 2 email reminders + SMS. Invoice ${invoice.id} ${fmt$(invoice.amount_due)}. Manual follow-up needed.`
    ).catch(() => {})
    await updateContact(contact.id, { properties: { payment_status: 'churn_risk' } }).catch(() => {})
  }
  // Admin alert
  if (process.env.RESEND_API_KEY) {
    const html = `
      <div style="font-family:-apple-system,sans-serif;max-width:560px;padding:20px;">
        <h2 style="color:#c0392b;margin:0 0 12px;">Manual follow-up needed: ${esc(customer.name || customer.email)}</h2>
        <p>Auto-resurrection escalated all the way to T+7d without resolution.</p>
        <ul style="color:#333;">
          <li>Customer: <strong>${esc(customer.name)}</strong> &lt;${esc(customer.email)}&gt;</li>
          <li>Amount: <strong>${fmt$(invoice.amount_due)}</strong></li>
          <li>Invoice: <a href="${esc(invoice.hosted_invoice_url)}">${esc(invoice.id)}</a></li>
          <li>HubSpot status set to <code>churn_risk</code></li>
        </ul>
        <p>The auto-flow has stopped. Time for a call or personal email.</p>
      </div>`
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: `GreenGuard Alerts <${FROM}>`,
      to: ADMIN_EMAIL,
      subject: `⚠️ Manual follow-up: ${customer.name || customer.email} unpaid 7d (${fmt$(invoice.amount_due)})`,
      html,
    })
  }
  return { ok: true }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
async function markStage(invoiceId, stage) {
  const inv = await stripe.invoices.retrieve(invoiceId)
  const meta = { ...inv.metadata, [`payfail_${stage}_at`]: new Date().toISOString() }
  await stripe.invoices.update(invoiceId, { metadata: meta })
}

async function clearStages(invoiceId) {
  const inv = await stripe.invoices.retrieve(invoiceId)
  const meta = { ...inv.metadata }
  let changed = false
  for (const k of Object.keys(meta)) {
    if (k.startsWith('payfail_')) { delete meta[k]; changed = true }
  }
  if (changed) await stripe.invoices.update(invoiceId, { metadata: meta })
}

module.exports = {
  sendT0Email, sendT48hReminder, sendT7dAdminAlert,
  markStage, clearStages, billingPortalUrl,
}
