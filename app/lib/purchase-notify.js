// Admin notifications on successful purchases. Fired from the Stripe webhook
// for any successful payment path: invoice.payment_succeeded (Rounds/quote
// invoices) and checkout.session.completed (Payment Links, ad-hoc checkouts).
//
// Dedup is via Stripe event id at the webhook layer — we don't fire the same
// event twice.

const { Resend } = require('resend')
const { sendSms } = require('./sms')

const FROM = process.env.PORTAL_FROM_EMAIL || 'noreply@greenguard-usa.com'
const ADMIN_EMAIL = process.env.OWNER_EMAIL || process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'
const ADMIN_SMS = process.env.ADMIN_SMS_NUMBER || ''
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.greenguard-usa.com'

function fmt$(cents) { return `$${(cents / 100).toFixed(2)}` }
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;'}[c]))
}

// Notify admin of a successful purchase.
// `purchase` shape:
//   { source, customerName, customerEmail, customerPhone, amount, currency,
//     items: [{description, amount}], stripeUrl, ref }
async function notifyAdmin(purchase) {
  const results = { email: false, sms: false }
  const subject = `💰 Purchase: ${purchase.customerName || purchase.customerEmail || 'Customer'} ${fmt$(purchase.amount)}`

  if (process.env.RESEND_API_KEY) {
    const lines = (purchase.items || []).map((l) =>
      `<tr><td style="padding:6px 0;color:#444;">${esc(l.description)}</td><td style="padding:6px 0;text-align:right;font-weight:700;">${fmt$(l.amount)}</td></tr>`
    ).join('')
    const html = `
      <div style="font-family:-apple-system,sans-serif;max-width:560px;padding:24px;color:#1a2e1f;">
        <div style="background:#0d1a10;border-radius:10px;padding:18px 22px;margin-bottom:20px;">
          <div style="color:rgba(212,230,202,0.55);font-size:0.72rem;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:4px;">${esc(purchase.source || 'Stripe')}</div>
          <h1 style="color:#7dffaa;font-size:1.6rem;margin:0;">${fmt$(purchase.amount)} ${esc((purchase.currency || 'USD').toUpperCase())}</h1>
        </div>
        <p><strong>${esc(purchase.customerName || '—')}</strong></p>
        <p style="color:#555;margin:4px 0;">
          ${esc(purchase.customerEmail || '')}${purchase.customerPhone ? ' · ' + esc(purchase.customerPhone) : ''}
        </p>
        ${lines ? `<table style="width:100%;border-collapse:collapse;margin:18px 0;border-top:1px solid #eee;">${lines}</table>` : ''}
        <p style="margin-top:18px;">
          <a href="${esc(purchase.stripeUrl || 'https://dashboard.stripe.com/payments')}" style="display:inline-block;padding:10px 18px;background:#7dffaa;color:#0d1a10;font-weight:800;border-radius:6px;text-decoration:none;">Open in Stripe →</a>
        </p>
        <p style="font-size:0.72rem;color:#888;margin-top:18px;">Ref: ${esc(purchase.ref || '-')}</p>
      </div>`
    try {
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: `GreenGuard Sales <${FROM}>`,
        to: ADMIN_EMAIL,
        subject,
        html,
      })
      results.email = true
    } catch (e) { console.error('purchase notify email:', e.message) }
  }

  if (ADMIN_SMS && process.env.TWILIO_AUTH_TOKEN) {
    const smsBody = `💰 ${purchase.customerName || purchase.customerEmail || 'Customer'} paid ${fmt$(purchase.amount)} (${purchase.source || 'Stripe'})`
    try {
      const r = await sendSms({ to: ADMIN_SMS, body: smsBody.slice(0, 320) })
      results.sms = r.ok
    } catch (e) { console.error('purchase notify sms:', e.message) }
  }

  return results
}

module.exports = { notifyAdmin }
