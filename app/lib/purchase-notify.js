// Admin notifications on successful purchases. Fired from the Stripe webhook
// for any successful payment path: invoice.payment_succeeded (Rounds/quote
// invoices) and checkout.session.completed (Payment Links, ad-hoc checkouts).
//
// Dedup is via Stripe event id at the webhook layer — we don't fire the same
// event twice.

const { Resend } = require('resend')
const { sendSms } = require('./sms')
const { postToOps } = require('./slack')

const FROM = process.env.PORTAL_FROM_EMAIL || 'noreply@greenguard-usa.com'
const ADMIN_EMAIL = process.env.OWNER_EMAIL || process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'
const ADMIN_SMS = process.env.ADMIN_SMS_NUMBER || ''
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.greenguard-usa.com'

function fmt$(cents) {
  const n = Number(cents)
  return Number.isFinite(n) ? `$${(n / 100).toFixed(2)}` : '$0.00'
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;'}[c]))
}

// Notify admin of a successful purchase.
// `purchase` shape:
//   { source, customerName, customerEmail, customerPhone, amount, currency,
//     items: [{description, amount}], stripeUrl, ref }
async function notifyAdmin(purchase) {
  const results = { email: false, sms: false }
  const customerLabel = purchase.customerName || purchase.customerEmail || 'Customer'
  const subject = `New purchase: ${customerLabel} — ${fmt$(purchase.amount)}`

  if (process.env.RESEND_API_KEY) {
    const paidDate = purchase.paidAt
      ? new Date(purchase.paidAt * 1000).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })
      : new Date().toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })

    const itemRows = (purchase.items || []).map((l) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#222;font-size:14px;">${esc(l.description || '—')}${l.quantity > 1 ? ` <span style="color:#888;">×${l.quantity}</span>` : ''}</td>
        <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:700;color:#222;font-size:14px;white-space:nowrap;">${fmt$(l.amount)}</td>
      </tr>`).join('')

    const subtotal = purchase.subtotal || purchase.amount
    const tax = purchase.tax || 0
    const showBreakdown = tax > 0

    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:580px;margin:0 auto;background:#fff;color:#111;">

      <!-- Header -->
      <div style="background:#0d1a10;padding:24px 28px 20px;">
        <div style="color:rgba(212,230,202,0.5);font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:6px;">${esc(purchase.source || 'Purchase')} · ${esc(paidDate)}</div>
        <div style="color:#7dffaa;font-size:32px;font-weight:900;line-height:1;">${fmt$(purchase.amount)}</div>
      </div>

      <div style="padding:24px 28px;">

        <!-- Customer -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <tr>
            <td style="width:50%;vertical-align:top;">
              <div style="font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#888;margin-bottom:6px;">Customer</div>
              <div style="font-size:15px;font-weight:700;margin-bottom:2px;">${esc(purchase.customerName || '—')}</div>
              ${purchase.customerEmail ? `<div style="font-size:13px;color:#555;margin-bottom:2px;">${esc(purchase.customerEmail)}</div>` : ''}
              ${purchase.customerPhone ? `<div style="font-size:13px;color:#555;">${esc(purchase.customerPhone)}</div>` : ''}
            </td>
            ${purchase.customerAddress ? `
            <td style="width:50%;vertical-align:top;padding-left:20px;">
              <div style="font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#888;margin-bottom:6px;">Address</div>
              <div style="font-size:13px;color:#555;line-height:1.5;">${esc(purchase.customerAddress)}</div>
            </td>` : ''}
          </tr>
        </table>

        <!-- Line items -->
        ${itemRows ? `
        <div style="font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#888;margin-bottom:10px;">Items</div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          ${itemRows}
          ${showBreakdown ? `
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#888;">Subtotal</td>
            <td style="padding:8px 0;text-align:right;font-size:13px;color:#888;">${fmt$(subtotal)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;font-size:13px;color:#888;">Sales tax (8.25%)</td>
            <td style="padding:4px 0;text-align:right;font-size:13px;color:#888;">${fmt$(tax)}</td>
          </tr>` : ''}
          <tr style="border-top:2px solid #111;">
            <td style="padding:10px 0;font-size:15px;font-weight:800;">Total</td>
            <td style="padding:10px 0;text-align:right;font-size:15px;font-weight:800;">${fmt$(purchase.amount)}</td>
          </tr>
        </table>` : ''}

        <!-- CTA -->
        <a href="${esc(purchase.stripeUrl || 'https://dashboard.stripe.com/payments')}" style="display:inline-block;padding:12px 22px;background:#0d1a10;color:#7dffaa;font-weight:800;font-size:14px;border-radius:6px;text-decoration:none;margin-top:8px;">View in Stripe →</a>

        <p style="font-size:11px;color:#bbb;margin-top:20px;margin-bottom:0;">Session: ${esc(purchase.ref || '—')}</p>
      </div>
    </div>`

    try {
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: `GreenGuard USA <${FROM}>`,
        to: ADMIN_EMAIL,
        subject,
        html,
      })
      results.email = true
    } catch (e) { console.error('purchase notify email:', e.message) }
  }

  const alertText = `💰 *${purchase.customerName || purchase.customerEmail || 'Customer'}* paid ${fmt$(purchase.amount)} (${purchase.source || 'Stripe'})${purchase.stripeUrl ? ` — ${purchase.stripeUrl}` : ''}`

  // Sends via iMessage (lib/sms → local daemon). No longer gated on Twilio creds
  // (iMessage-only, business decision 2026-07-10) — gate on having a number only.
  if (ADMIN_SMS) {
    try {
      const r = await sendSms({ to: ADMIN_SMS, body: alertText.replace(/\*/g, '').slice(0, 320) })
      results.sms = r.ok
    } catch (e) { console.error('purchase notify sms:', e.message) }
  }

  await postToOps(alertText).catch(() => {})

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
  const taxAmount = invoice.tax || 0
  const subtotal = invoice.subtotal || 0
  const firstName = (customer.name || '').split(' ')[0] || 'there'

  const lineRows = (invoice.lines?.data || []).map((l) =>
    `<tr>
      <td style="padding:10px 20px;color:rgba(212,230,202,0.8);border-bottom:1px solid rgba(122,171,130,0.08);font-size:13px">${esc(l.description || 'Service')}</td>
      <td style="padding:10px 20px;text-align:right;font-weight:700;color:rgba(212,230,202,0.9);border-bottom:1px solid rgba(122,171,130,0.08);font-size:13px;white-space:nowrap">${fmt$(l.amount)}</td>
    </tr>`
  ).join('')

  const taxRows = taxAmount > 0 ? `
    <tr>
      <td style="padding:8px 20px;color:rgba(122,171,130,0.5);font-size:12px">Subtotal</td>
      <td style="padding:8px 20px;text-align:right;color:rgba(122,171,130,0.5);font-size:12px">${fmt$(subtotal)}</td>
    </tr>
    <tr>
      <td style="padding:8px 20px;color:rgba(122,171,130,0.5);font-size:12px">Sales tax (8.25%)</td>
      <td style="padding:8px 20px;text-align:right;color:rgba(122,171,130,0.5);font-size:12px">${fmt$(taxAmount)}</td>
    </tr>` : ''

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a1a0d;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:24px 16px">

  <!-- Receipt card -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0d1a10 0%,#1a2e1f 100%);border:1px solid rgba(122,171,130,0.2);border-radius:12px;margin-bottom:12px">
    <tr>
      <td style="padding:28px 28px 18px">
        <div style="color:#c9a84c;font-size:10px;font-weight:800;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:10px">GreenGuard USA &nbsp;&middot;&nbsp; Payment Receipt</div>
        <div style="color:#7dffaa;font-size:36px;font-weight:900;letter-spacing:-0.03em;line-height:1">${fmt$(amount)}</div>
        <div style="color:rgba(212,230,202,0.6);font-size:14px;margin-top:8px">Payment received. Thank you, ${esc(firstName)}.</div>
      </td>
    </tr>
    ${lineRows ? `
    <tr>
      <td style="padding:0 28px 20px">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(0,0,0,0.22);border:1px solid rgba(122,171,130,0.12);border-radius:8px">
          ${lineRows}
          ${taxRows}
          <tr>
            <td style="padding:12px 20px;border-top:1px solid rgba(122,171,130,0.18);color:#ffffff;font-weight:800;font-size:14px">Total paid</td>
            <td style="padding:12px 20px;border-top:1px solid rgba(122,171,130,0.18);text-align:right;color:#7dffaa;font-weight:900;font-size:16px;white-space:nowrap">${fmt$(amount)}</td>
          </tr>
        </table>
      </td>
    </tr>` : ''}
    <tr>
      <td style="padding:0 28px 22px">
        <table cellpadding="0" cellspacing="0">
          <tr>
            ${receiptUrl ? `<td style="padding-right:10px"><a href="${esc(receiptUrl)}" style="display:inline-block;background:#c9a84c;color:#0a1a0d;font-weight:900;font-size:13px;padding:12px 24px;border-radius:6px;text-decoration:none;letter-spacing:0.06em;text-transform:uppercase">View Receipt</a></td>` : ''}
            ${hostedInvoiceUrl ? `<td><a href="${esc(hostedInvoiceUrl)}" style="display:inline-block;background:rgba(122,171,130,0.12);border:1px solid rgba(122,171,130,0.3);color:#7dffaa;font-weight:700;font-size:13px;padding:10px 22px;border-radius:6px;text-decoration:none;letter-spacing:0.04em">View Invoice</a></td>` : ''}
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:0 28px 22px;border-top:1px solid rgba(122,171,130,0.1)">
        <div style="color:rgba(122,171,130,0.45);font-size:12px;line-height:1.6;padding-top:16px">Questions? Reply to this email or text <a href="tel:+15125604129" style="color:rgba(122,171,130,0.6);text-decoration:none">512-560-4129</a>. Ref: ${esc(invoice.id)}</div>
      </td>
    </tr>
  </table>

  <div style="text-align:center;color:rgba(122,171,130,0.18);font-size:10px;letter-spacing:0.08em;text-transform:uppercase">GreenGuard USA &nbsp;&middot;&nbsp; Smart, Safe, Effective mosquito control</div>
</div>
</body>
</html>`

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

// Customer-facing receipt for a Stripe Checkout Session (quote flow).
// Checkout sessions don't produce an invoice object, so this mirrors
// sendCustomerReceipt but takes the session + pre-fetched line items.
async function sendCheckoutReceipt({ session, items, receiptUrl }) {
  if (!process.env.RESEND_API_KEY) return { ok: false, reason: 'no RESEND_API_KEY' }
  const email = session.customer_details?.email || session.customer_email || ''
  if (!email) return { ok: false, reason: 'no customer email' }

  const firstName = (session.customer_details?.name || '').split(' ')[0] || 'there'
  const amount = session.amount_total || 0

  const lineRows = (items || []).map((l) =>
    `<tr>
      <td style="padding:10px 20px;color:rgba(212,230,202,0.8);border-bottom:1px solid rgba(122,171,130,0.08);font-size:13px">${esc(l.description || 'Item')}</td>
      <td style="padding:10px 20px;text-align:right;font-weight:700;color:rgba(212,230,202,0.9);border-bottom:1px solid rgba(122,171,130,0.08);font-size:13px;white-space:nowrap">${fmt$(l.amount_total ?? l.amount)}</td>
    </tr>`
  ).join('')

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a1a0d;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:24px 16px">

  <!-- Receipt card -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0d1a10 0%,#1a2e1f 100%);border:1px solid rgba(122,171,130,0.2);border-radius:12px;margin-bottom:12px">
    <tr>
      <td style="padding:28px 28px 18px">
        <div style="color:#c9a84c;font-size:10px;font-weight:800;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:10px">GreenGuard USA &nbsp;&middot;&nbsp; Payment Receipt</div>
        <div style="color:#7dffaa;font-size:36px;font-weight:900;letter-spacing:-0.03em;line-height:1">${fmt$(amount)}</div>
        <div style="color:rgba(212,230,202,0.6);font-size:14px;margin-top:8px">Payment received. Thank you, ${esc(firstName)}.</div>
      </td>
    </tr>
    ${lineRows ? `
    <tr>
      <td style="padding:0 28px 20px">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(0,0,0,0.22);border:1px solid rgba(122,171,130,0.12);border-radius:8px">
          ${lineRows}
          <tr>
            <td style="padding:12px 20px;border-top:1px solid rgba(122,171,130,0.18);color:#ffffff;font-weight:800;font-size:14px">Total paid</td>
            <td style="padding:12px 20px;border-top:1px solid rgba(122,171,130,0.18);text-align:right;color:#7dffaa;font-weight:900;font-size:16px;white-space:nowrap">${fmt$(amount)}</td>
          </tr>
        </table>
      </td>
    </tr>` : ''}
    ${receiptUrl ? `
    <tr>
      <td style="padding:0 28px 20px">
        <a href="${esc(receiptUrl)}" style="display:inline-block;background:#c9a84c;color:#0a1a0d;font-weight:900;font-size:13px;padding:12px 24px;border-radius:6px;text-decoration:none;letter-spacing:0.06em;text-transform:uppercase">View Receipt</a>
      </td>
    </tr>` : ''}
    <tr>
      <td style="padding:0 28px 22px;border-top:1px solid rgba(122,171,130,0.1)">
        <div style="color:rgba(122,171,130,0.45);font-size:12px;line-height:1.6;padding-top:16px">Questions? Reply to this email or text <a href="tel:+15125604129" style="color:rgba(122,171,130,0.6);text-decoration:none">512-560-4129</a>. Ref: ${esc(session.id)}</div>
      </td>
    </tr>
  </table>

  <div style="text-align:center;color:rgba(122,171,130,0.18);font-size:10px;letter-spacing:0.08em;text-transform:uppercase">GreenGuard USA &nbsp;&middot;&nbsp; Smart, Safe, Effective mosquito control</div>
</div>
</body>
</html>`

  try {
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: `GreenGuard USA <${FROM}>`,
      to: email,
      bcc: ADMIN_EMAIL,
      subject: `Receipt — ${fmt$(amount)} paid to GreenGuard USA`,
      html,
    })
    return { ok: true }
  } catch (e) {
    console.error('checkout receipt send failed:', e.message)
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

module.exports = { notifyAdmin, sendCustomerReceipt, sendCheckoutReceipt, notifyAdminInvoiceSent }
