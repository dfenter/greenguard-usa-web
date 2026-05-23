/**
 * POST /api/admin/generate-invoice
 * Finds the customer's existing open/draft Stripe invoice (created by the booking)
 * and adds the actual line items from the tech's rounds form.
 * Does NOT create a new invoice unless none exists.
 */
const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { stripe, getTaxRateId } = require('../../../lib/stripe')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

const SKU_TO_ENV = {
  BG1: 'STRIPE_PRICE_BG1', BG2: 'STRIPE_PRICE_BG2', BG3: 'STRIPE_PRICE_BG3',
  'MQ-RENT': 'STRIPE_PRICE_MQ_RENT', 'MQ-SVC': 'STRIPE_PRICE_MQ_SVC',
  'MQ-INST': 'STRIPE_PRICE_MQ_INST', 'MQ-TSHOOT': 'STRIPE_PRICE_MQ_TSHOOT',
  'OWN-BG': 'STRIPE_PRICE_OWN_BG', 'OWN-MQ': 'STRIPE_PRICE_OWN_MQ',
  TANK1: 'STRIPE_PRICE_TANK1', TANK2: 'STRIPE_PRICE_TANK2', TANK3: 'STRIPE_PRICE_TANK3',
  TANK4: 'STRIPE_PRICE_TANK4', TANK6: 'STRIPE_PRICE_TANK6', TANK10: 'STRIPE_PRICE_TANK10',
  BARRIER: 'STRIPE_PRICE_BARRIER', BAIT: 'STRIPE_PRICE_BAIT',
  'BG-SWEETSCENT': 'STRIPE_PRICE_BG_SWEETSCENT', 'CO2-ADDON': 'STRIPE_PRICE_CO2_ADDON',
  'TRAP-INSTALL': 'STRIPE_PRICE_TRAP_INSTALL',
  'TRAP-MAINT-1': 'STRIPE_PRICE_TRAP_MAINT_1', 'TRAP-MAINT-2': 'STRIPE_PRICE_TRAP_MAINT_2',
  'TIMER-INSTALL': 'STRIPE_PRICE_TIMER_INSTALL', 'WKD-SURCH': 'STRIPE_PRICE_WKD_SURCH',
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const { customerEmail, customerName, lineItems, calBookingUid, serviceDate, force } = req.body || {}
  if (!customerEmail) return res.status(400).json({ error: 'customerEmail required' })
  if (!lineItems?.length) return res.status(400).json({ error: 'No line items' })

  // Find Stripe customer
  const search = await stripe.customers.search({ query: `email:"${customerEmail}"`, limit: 1 })
  if (!search.data.length) return res.status(404).json({ error: `No Stripe customer for ${customerEmail}` })
  const customer = search.data[0]

  // ── Double-billing protection — one invoice per booking UID ───────────────
  if (calBookingUid && !force) {
    // Search all invoices for this customer that already have this booking UID
    const allInvoices = await stripe.invoices.list({ customer: customer.id, limit: 100 })
    const duplicate = allInvoices.data.find(inv =>
      inv.metadata?.cal_booking_uid === calBookingUid &&
      ['paid', 'open', 'draft'].includes(inv.status)
    )
    if (duplicate) {
      return res.status(409).json({
        alreadyBilled: true,
        warning: `An invoice already exists for this appointment (booking ${calBookingUid}). Status: ${duplicate.status}. Click OK to view it or Cancel to abort.`,
        invoiceId: duplicate.id,
        invoiceUrl: duplicate.hosted_invoice_url,
        invoiceStatus: duplicate.status,
      })
    }
  }

  // Fallback dedup when no Cal.com UID (manual GCal entries / Acuity appointments)
  if (!calBookingUid && serviceDate && !force) {
    const allForDate = await stripe.invoices.list({ customer: customer.id, limit: 100 })
    const sameDayDuplicate = allForDate.data.find(inv =>
      inv.metadata?.service_date === serviceDate &&
      ['paid', 'open', 'draft'].includes(inv.status)
    )
    if (sameDayDuplicate) {
      return res.status(409).json({
        alreadyBilled: true,
        warning: `An invoice already exists for this date (${serviceDate}). Status: ${sameDayDuplicate.status}.`,
        invoiceId: sameDayDuplicate.id,
        invoiceStatus: sameDayDuplicate.status,
      })
    }
  }

  // Find existing invoice — prefer draft, fall back to open
  const [drafts, opens] = await Promise.all([
    stripe.invoices.list({ customer: customer.id, status: 'draft', limit: 1 }),
    stripe.invoices.list({ customer: customer.id, status: 'open', limit: 1 }),
  ])

  const existingInvoice = drafts.data[0] || opens.data[0] || null

  // Add the actual line items from rounds
  const errors = []
  const billableItems = lineItems.filter((i) => i.qty > 0 && i.price > 0)

  for (const item of billableItems) {
    const priceId = item.sku ? process.env[SKU_TO_ENV[item.sku]] : null
    try {
      if (priceId) {
        await stripe.invoiceItems.create({ customer: customer.id, price: priceId, quantity: item.qty })
      } else {
        await stripe.invoiceItems.create({
          customer: customer.id,
          amount: Math.round(item.price * item.qty * 100),
          currency: 'usd',
          description: item.qty > 1 ? `${item.label} ×${item.qty}` : item.label,
        })
      }
    } catch (err) {
      errors.push(`${item.label}: ${err.message.slice(0, 60)}`)
    }
  }

  // Use existing invoice or create one if none exists
  // Tag with booking UID so we can prevent future duplicates
  const invoiceMeta = {}
  if (calBookingUid) invoiceMeta.cal_booking_uid = calBookingUid
  if (serviceDate) invoiceMeta.service_date = serviceDate

  let invoice = existingInvoice
  if (!invoice) {
    invoice = await stripe.invoices.create({
      customer: customer.id,
      auto_advance: false,
      metadata: invoiceMeta,
      default_tax_rates: [getTaxRateId()],
    })
  } else if (Object.keys(invoiceMeta).length && !existingInvoice.metadata?.cal_booking_uid) {
    // Tag existing invoice with booking UID if not already tagged
    await stripe.invoices.update(invoice.id, { metadata: { ...invoice.metadata, ...invoiceMeta } }).catch(() => {})
  }

  return res.status(200).json({
    ok: true,
    invoiceId: invoice.id,
    invoiceUrl: invoice.hosted_invoice_url || null,
    invoiceStatus: invoice.status,
    existingInvoice: !!existingInvoice,
    errors: errors.length ? errors : undefined,
  })
}
