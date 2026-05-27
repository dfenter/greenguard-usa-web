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

// Customer-facing receipt. Stripe will only auto-send a receipt when (a) the
// account-level "Email customers about successful payments" toggle is on AND
// (b) the underlying charge had a receipt_email set — neither has been
// reliable in our flow, so we send our own branded receipt here so the
// customer always gets confirmation.
async function sendCustomerReceipt({ invoice, customer, receiptUrl, hostedInvoiceUrl }) {
  if (!process.env.RESEND_API_KEY) return { ok: false, reason: 'no RESEND_API_KEY' }
  if (!customer?.email) return { ok: false, reason: 'no customer email' }

  const amount = invoice.amount_paid || invoice.total || 0
  const lines = (invoice.lines?.data || []).map((l) =>
    `<tr>
      <td style="padding:8px 0;color:#444;border-bottom:1px solid #eee;">${esc(l.description || 'Service')}</td>
      <td style="padding:8px 0;text-align:right;font-weight:700;border-bottom:1px solid #eee;">${fmt$(l.amount)}</td>
    </tr>`
  ).join('')

  const taxAmount = invoice.tax || 0
  const subtotal = invoice.subtotal || 0
  const firstName = (customer.name || '').split(' ')[0] || 'there'

  const html = `
    <div style="font-family:-apple-system,sans-serif;max-width:560px;padding:24px;color:#1a2e1f;">
      <h1 style="color:#1a2e1f;font-size:1.6rem;margin:0 0 8px;">Payment received — thank you!</h1>
      <p style="color:#555;margin:0 0 18px;">Hi ${esc(firstName)}, this confirms your payment for GreenGuard USA mosquito control service.</p>
      <div style="background:#f4f8f4;border-radius:10px;padding:18px 22px;margin-bottom:20px;">
        <div style="color:#1a2e1f;font-size:0.72rem;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:4px;">Amount paid</div>
        <h2 style="color:#1a2e1f;font-size:2rem;margin:0;font-weight:900;">${fmt$(amount)}</h2>
      </div>
      <table style="width:100%;border-collapse:collapse;margin:0 0 12px;border-top:1px solid #eee;">${lines}</table>
      ${taxAmount > 0 ? `<p style="color:#555;margin:4px 0;display:flex;justify-content:space-between;"><span>Subtotal</span><span>${fmt$(subtotal)}</span></p>
      <p style="color:#555;margin:4px 0;display:flex;justify-content:space-between;"><span>Sales tax</span><span>${fmt$(taxAmount)}</span></p>` : ''}
      <p style="color:#1a2e1f;margin:8px 0 18px;display:flex;justify-content:space-between;font-weight:800;border-top:1px solid #1a2e1f;padding-top:8px;"><span>Total paid</span><span>${fmt$(amount)}</span></p>
      ${receiptUrl ? `<p style="margin:18px 0;"><a href="${esc(receiptUrl)}" style="display:inline-block;padding:10px 18px;background:#1a2e1f;color:#7dffaa;font-weight:800;border-radius:6px;text-decoration:none;">View Stripe receipt →</a>` : ''}
      ${hostedInvoiceUrl ? ` &nbsp; <a href="${esc(hostedInvoiceUrl)}" style="color:#1a2e1f;font-weight:700;text-decoration:underline;">View invoice</a></p>` : '</p>'}
      <p style="font-size:0.85rem;color:#555;margin-top:24px;border-top:1px solid #eee;padding-top:16px;">Questions about your service? Reply to this email or text us at <a href="tel:+15125604129" style="color:#1a2e1f;">512-560-4129</a>.</p>
      <p style="font-size:0.72rem;color:#888;margin-top:12px;">GreenGuard USA — Smart, Safe, Effective mosquito control. Ref: ${esc(invoice.id)}</p>
    </div>`

  try {
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: `GreenGuard USA <${FROM}>`,
      to: customer.email,
      subject: `Receipt — ${fmt$(amount)} paid to GreenGuard USA`,
      html,
    })
    return { ok: true }
  } catch (e) {
    console.error('customer receipt send failed:', e.message)
    return { ok: false, reason: e.message }
  }
}

// Admin notification when an invoice is finalized + sent to a customer.
// Mirrors what the customer just received so admin has a copy without
// configuring Stripe's BCC setting (which is global and noisy).
async function notifyAdminInvoiceSent({ invoice, customer }) {
  if (!process.env.RESEND_API_KEY) return { ok: false, reason: 'no RESEND_API_KEY' }

  const amount = invoice.amount_due || invoice.total || 0
  const lines = (invoice.lines?.data || []).map((l) =>
    `<tr>
      <td style="padding:6px 0;color:#444;">${esc(l.description || 'Service')}</td>
      <td style="padding:6px 0;text-align:right;font-weight:700;">${fmt$(l.amount)}</td>
    </tr>`
  ).join('')

  const html = `
    <div style="font-family:-apple-system,sans-serif;max-width:560px;padding:24px;color:#1a2e1f;">
      <div style="background:#0d1a10;border-radius:10px;padding:18px 22px;margin-bottom:20px;">
        <div style="color:rgba(212,230,202,0.55);font-size:0.72rem;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:4px;">Invoice sent</div>
        <h1 style="color:#7dffaa;font-size:1.6rem;margin:0;">${fmt$(amount)}</h1>
      </div>
      <p><strong>${esc(customer.name || customer.email || 'Customer')}</strong></p>
      <p style="color:#555;margin:4px 0;">${esc(customer.email || '')}${customer.phone ? ' · ' + esc(customer.phone) : ''}</p>
      ${lines ? `<table style="width:100%;border-collapse:collapse;margin:18px 0;border-top:1px solid #eee;">${lines}</table>` : ''}
      <p style="margin-top:18px;">
        <a href="${esc(invoice.hosted_invoice_url || '#')}" style="display:inline-block;padding:10px 18px;background:#7dffaa;color:#0d1a10;font-weight:800;border-radius:6px;text-decoration:none;margin-right:8px;">View what customer sees →</a>
        <a href="https://dashboard.stripe.com/invoices/${esc(invoice.id)}" style="color:#1a2e1f;font-weight:700;text-decoration:underline;">Open in Stripe</a>
      </p>
      <p style="font-size:0.72rem;color:#888;margin-top:18px;">Ref: ${esc(invoice.id)} · ${esc(invoice.collection_method)}</p>
    </div>`
  try {
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: `GreenGuard Billing <${FROM}>`,
      to: ADMIN_EMAIL,
      subject: `📤 Invoice sent: ${customer.name || customer.email} ${fmt$(amount)}`,
      html,
    })
    return { ok: true }
  } catch (e) {
    console.error('admin invoice-sent notify:', e.message)
    return { ok: false, reason: e.message }
  }
}

module.exports = { notifyAdmin, sendCustomerReceipt, notifyAdminInvoiceSent }
