/**
 * POST /api/admin/generate-invoice
 * Finds the customer's existing open/draft Stripe invoice (created by the booking)
 * and adds the actual line items from the tech's rounds form.
 * Does NOT create a new invoice unless none exists.
 */
const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { stripe, getTaxRateId } = require('../../../lib/stripe')
const { findContactByEmail, updateContact } = require('../../../lib/hubspot')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

const SKU_TO_ENV = {
  BG1: 'STRIPE_PRICE_BG1', BG2: 'STRIPE_PRICE_BG2', BG3: 'STRIPE_PRICE_BG3',
  'MQ-RENT': 'STRIPE_PRICE_MQ_RENT', 'MQ-SVC': 'STRIPE_PRICE_MQ_SVC',
  'MQ-INST': 'STRIPE_PRICE_MQ_INST', 'MQ-TSHOOT': 'STRIPE_PRICE_MQ_TSHOOT',
  'OWN-BG': 'STRIPE_PRICE_OWN_BG', 'OWN-MQ': 'STRIPE_PRICE_OWN_MQ',
  TANK1: 'STRIPE_PRICE_TANK1', TANK2: 'STRIPE_PRICE_TANK2', TANK3: 'STRIPE_PRICE_TANK3',
  TANK4: 'STRIPE_PRICE_TANK4', TANK6: 'STRIPE_PRICE_TANK6', TANK10: 'STRIPE_PRICE_TANK10',
  'TANK-DELIVERY-FEE': 'STRIPE_PRICE_TANK_DELIVERY_FEE', 'TANK-REFILL': 'STRIPE_PRICE_TANK_REFILL',
  'TANK-HOOKUP-MAINT': 'STRIPE_PRICE_TANK_HOOKUP_MAINT',
  BARRIER: 'STRIPE_PRICE_BARRIER', BAIT: 'STRIPE_PRICE_BAIT', 'TANK-STRAPS': 'STRIPE_PRICE_TANK_STRAPS',
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

  // Find or auto-create the Stripe customer. New customers obviously have
  // no card on file, so the downstream branch will route to send_invoice
  // (Stripe emails the hosted invoice link).
  const search = await stripe.customers.search({ query: `email:"${customerEmail}"`, limit: 1 })
  let customer = search.data[0]
  if (!customer) {
    customer = await stripe.customers.create({
      email: customerEmail,
      ...(customerName ? { name: customerName } : {}),
      metadata: { source: 'auto-created-from-rounds', service_date: serviceDate || '' },
    })
  }

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

  // CRITICAL ORDERING: resolve/create the target invoice BEFORE creating
  // invoice items, then attach each item directly via the `invoice` param.
  // If we create items without invoice= and a draft already exists, Stripe
  // makes them "pending" and they DON'T pull into the existing draft —
  // the draft stays at $0. This was the Keith Yeung bug.
  const invoiceMeta = {}
  if (calBookingUid) invoiceMeta.cal_booking_uid = calBookingUid
  if (serviceDate) invoiceMeta.service_date = serviceDate
  // 5-day auto-approve safety net. The /api/cron/billing-run job finalizes
  // drafts whose billing_date is today or earlier, so a forgotten draft
  // still goes out (and either auto-charges the card on file or gets
  // emailed to the customer). Manually clicking Send bypasses the wait.
  const base = serviceDate ? new Date(serviceDate + 'T12:00:00') : new Date()
  base.setDate(base.getDate() + 5)
  invoiceMeta.billing_date = base.toISOString().slice(0, 10)

  let invoice = existingInvoice
  if (!invoice) {
    const taxRateId = getTaxRateId()
    // Pick collection method based on whether the customer has a card on
    // file. With a card → auto-charge (charge_automatically). Without →
    // email the hosted invoice link (send_invoice + 14-day terms).
    // If a card exists but no default_payment_method is set, promote the
    // most recent one — Stripe requires a default to auto-charge.
    let collectionMethod = 'send_invoice'
    let daysUntilDue = 14
    try {
      const pms = await stripe.paymentMethods.list({ customer: customer.id, limit: 5 })
      if (pms.data.length > 0) {
        if (!customer.invoice_settings?.default_payment_method) {
          await stripe.customers.update(customer.id, {
            invoice_settings: { default_payment_method: pms.data[0].id },
          })
        }
        collectionMethod = 'charge_automatically'
        daysUntilDue = undefined
      }
    } catch (e) {
      console.error('Payment-method lookup failed; falling back to send_invoice:', e.message)
    }

    const createPayload = {
      customer: customer.id,
      auto_advance: false,
      collection_method: collectionMethod,
      ...(daysUntilDue !== undefined ? { days_until_due: daysUntilDue } : {}),
      metadata: invoiceMeta,
      ...(taxRateId ? { default_tax_rates: [taxRateId] } : {}),
    }
    try {
      invoice = await stripe.invoices.create(createPayload)
    } catch (err) {
      // If the configured tax rate doesn't exist in this Stripe env, retry without it
      // rather than failing the whole invoice (common when test/live keys mismatch
      // or a stale STRIPE_TAX_RATE_ID is set).
      if (taxRateId && err?.code === 'resource_missing' && err?.param?.startsWith('default_tax_rates')) {
        console.error(`Stripe tax rate ${taxRateId} not found — retrying without tax`)
        delete createPayload.default_tax_rates
        invoice = await stripe.invoices.create(createPayload)
      } else {
        throw err
      }
    }
  }

  // Add the actual line items from rounds, attached directly to invoice.id.
  const errors = []
  const billableItems = lineItems.filter((i) => i.qty > 0 && i.price > 0)

  for (const item of billableItems) {
    const priceId = item.sku ? process.env[SKU_TO_ENV[item.sku]] : null
    try {
      if (priceId) {
        await stripe.invoiceItems.create({
          customer: customer.id, invoice: invoice.id,
          price: priceId, quantity: item.qty,
        })
      } else {
        await stripe.invoiceItems.create({
          customer: customer.id, invoice: invoice.id,
          amount: Math.round(item.price * item.qty * 100),
          currency: 'usd',
          description: item.qty > 1 ? `${item.label} ×${item.qty}` : item.label,
        })
      }
    } catch (err) {
      errors.push(`${item.label}: ${err.message.slice(0, 60)}`)
    }
  }

  if (existingInvoice && Object.keys(invoiceMeta).length) {
    // Always ensure metadata (cal_booking_uid + service_date) is present on existing invoices
    const mergedMeta = { ...invoice.metadata, ...invoiceMeta }
    const needsUpdate =
      (invoiceMeta.cal_booking_uid && !invoice.metadata?.cal_booking_uid) ||
      (invoiceMeta.service_date && !invoice.metadata?.service_date)
    if (needsUpdate) {
      await stripe.invoices.update(invoice.id, { metadata: mergedMeta }).catch(() => {})
    }
  }

  // If MQ-INST was billed, mark the HubSpot contact as installed so future
  // mosqitter-installation bookings prefill as MQ-SVC instead of MQ-INST.
  if (billableItems.some(i => i.sku === 'MQ-INST')) {
    try {
      const contact = await findContactByEmail(customerEmail)
      if (contact?.id && contact.properties?.mq_installed !== 'true') {
        await updateContact(contact.id, {
          properties: {
            mq_installed: 'true',
            mq_installed_at: serviceDate || new Date().toISOString().slice(0, 10),
          },
        }).catch(() => {})
      }
    } catch {}
  }

  // Save line items as a template on the customer for next-time auto-populate
  try {
    const skuTemplate = billableItems.map(i => ({ sku: i.sku || null, label: i.label, qty: i.qty }))
    if (skuTemplate.length > 0) {
      await stripe.customers.update(customer.id, {
        metadata: {
          ...customer.metadata,
          last_invoice_skus: JSON.stringify(skuTemplate).slice(0, 500), // Stripe metadata 500-char limit
          last_invoice_date: serviceDate || new Date().toISOString().slice(0, 10),
        },
      }).catch(() => {})
    }
  } catch {} // non-blocking

  return res.status(200).json({
    ok: true,
    invoiceId: invoice.id,
    invoiceUrl: invoice.hosted_invoice_url || null,
    invoiceStatus: invoice.status,
    existingInvoice: !!existingInvoice,
    errors: errors.length ? errors : undefined,
  })
}
