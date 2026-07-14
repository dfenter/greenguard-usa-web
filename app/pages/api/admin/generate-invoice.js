/**
 * POST /api/admin/generate-invoice
 * Finds the customer's existing open/draft Stripe invoice (created by the booking)
 * and adds the actual line items from the tech's rounds form.
 * Does NOT create a new invoice unless none exists.
 */
const { getSessionFromRequest, isAdminEmail, consumeJti } = require('../../../lib/auth')
const { stripe, getTaxRateId, priceIdForSku } = require('../../../lib/stripe')
const { findContactByEmail, updateContact } = require('../../../lib/hubspot')
const crypto = require('crypto')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const { customerEmail: rawEmail, customerName, lineItems, calBookingUid, serviceDate, force, forceId: requestedForceId, signatureUrl } = req.body || {}
  if (!rawEmail) return res.status(400).json({ error: 'customerEmail required' })
  if (!lineItems?.length) return res.status(400).json({ error: 'No line items' })

  // Sanitize email — GCal/HubSpot/manual entries sometimes have trailing
  // commas, semicolons, or whitespace that Stripe rejects as email_invalid.
  const customerEmail = String(rawEmail).trim().replace(/[,;\s]+$/, '').toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    return res.status(400).json({ error: `Invalid email address: ${rawEmail}` })
  }

  // ── Concurrency guard ─────────────────────────────────────────────────────
  // The dedup below is check-then-act; two overlapping submits (double-tap on
  // LTE) could both pass it and create duplicate invoices / double-append items.
  // Take a short single-flight lock per (customer + booking) via KV SET-NX.
  const lockKey = `invgen:${customerEmail}:${calBookingUid || serviceDate || 'manual'}`
  if (!force) {
    let gotLock
    try {
      gotLock = await consumeJti(`lock:${lockKey}`, 45)
    } catch (err) {
      console.error('Invoice lock unavailable:', err.message)
      return res.status(503).json({ error: 'Invoice lock unavailable (KV error). Retry in a moment.' })
    }
    if (!gotLock) {
      return res.status(409).json({ error: 'An invoice for this visit is already being generated. Try again in a moment.' })
    }
  }

  const forceId = force
    ? (typeof requestedForceId === 'string' && requestedForceId ? requestedForceId : crypto.randomUUID())
    : null

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

  // Reuse only an existing DRAFT, and only if it belongs to THIS booking (or is
  // an unclaimed draft with no booking metadata). Grabbing drafts.data[0]
  // blindly attached a new visit's items to a DIFFERENT booking's draft and
  // never recorded this visit's UID — so the dedup check above couldn't see it
  // and a re-generate appended the items a second time (double-bill). Never
  // attach to an open/finalized invoice — Stripe locks those and items vanish.
  const draftList = await stripe.invoices.list({ customer: customer.id, status: 'draft', limit: 100 })
  const existingInvoice = draftList.data.find((d) => {
    const m = d.metadata || {}
    const unclaimed = !m.cal_booking_uid && !m.service_date
    if (calBookingUid) return m.cal_booking_uid === calBookingUid || unclaimed
    if (serviceDate) return m.service_date === serviceDate || unclaimed
    return unclaimed
  }) || null

  // CRITICAL ORDERING: resolve/create the target invoice BEFORE creating
  // invoice items, then attach each item directly via the `invoice` param.
  // If we create items without invoice= and a draft already exists, Stripe
  // makes them "pending" and they DON'T pull into the existing draft —
  // the draft stays at $0. This was the Keith Yeung bug.
  const invoiceMeta = {}
  if (calBookingUid) invoiceMeta.cal_booking_uid = calBookingUid
  if (serviceDate) invoiceMeta.service_date = serviceDate
  if (signatureUrl) invoiceMeta.signature_url = signatureUrl
  // 5-day auto-approve safety net. The /api/cron/billing-run job finalizes
  // drafts whose billing_date is today or earlier, so a forgotten draft
  // still goes out (auto-charge card on file, or email hosted link).
  // Manually clicking Send bypasses the wait.
  //
  // Anchor: service_date + 5 days. Floor: tomorrow — prevents an old
  // service_date (logging a visit weeks late) from triggering same-day
  // auto-billing because billing_date computed to a date in the past.
  const fiveAfterService = serviceDate ? new Date(serviceDate + 'T12:00:00') : new Date()
  fiveAfterService.setDate(fiveAfterService.getDate() + 5)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const billDate = fiveAfterService > tomorrow ? fiveAfterService : tomorrow
  invoiceMeta.billing_date = billDate.toISOString().slice(0, 10)

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
  // Filter rule: keep items with qty>0 AND (price>0 OR a SKU that maps to a
  // Stripe price). SKU-priced items (e.g. BG1 monthly rental at $159.99) come
  // through from Rounds with price=0 because the dollar value lives in Stripe;
  // we still want them on the invoice.
  const errors = []
  const billableItems = lineItems
    .map((item, origIdx) => ({ item, origIdx }))
    .filter(({ item }) => item.qty > 0 && (item.price > 0 || (item.sku && priceIdForSku(item.sku))))

  for (const { item, origIdx } of billableItems) {
    const priceId = item.sku ? priceIdForSku(item.sku) : null
    const lineIdempotencyKey = `gg:line:${lockKey}${forceId ? ':' + forceId : ''}:${origIdx}:${(item.sku || item.label || '').slice(0, 40)}:${item.qty}`
    try {
      if (priceId) {
        // The env-mapped Stripe price may be either one-time or recurring.
        // Recurring prices belong to subscriptions and can't be attached as
        // invoice items. Detect and convert: charge unit_amount as a one-time
        // ad-hoc item with the price's product name as description.
        const price = await stripe.prices.retrieve(priceId, { expand: ['product'] })
        if (price.type === 'recurring') {
          const productName = price.product?.name || item.label || item.sku
          await stripe.invoiceItems.create({
            customer: customer.id, invoice: invoice.id,
            amount: (price.unit_amount || 0) * item.qty,
            currency: price.currency || 'usd',
            description: item.qty > 1 ? `${productName} ×${item.qty}` : productName,
          }, { idempotencyKey: lineIdempotencyKey })
        } else {
          await stripe.invoiceItems.create({
            customer: customer.id, invoice: invoice.id,
            price: priceId, quantity: item.qty,
          }, { idempotencyKey: lineIdempotencyKey })
        }
      } else {
        await stripe.invoiceItems.create({
          customer: customer.id, invoice: invoice.id,
          amount: Math.round(item.price * item.qty * 100),
          currency: 'usd',
          description: item.qty > 1 ? `${item.label} ×${item.qty}` : item.label,
        }, { idempotencyKey: lineIdempotencyKey })
      }
    } catch (err) {
      errors.push(`${item.label}: ${err.message.slice(0, 60)}`)
    }
  }

  if (errors.length > 0) {
    return res.status(502).json({
      ok: false,
      error: `Invoice incomplete: ${errors.length} line(s) failed`,
      invoiceId: invoice.id,
      invoiceUrl: invoice.hosted_invoice_url || null,
      errors,
    })
  }

  if (existingInvoice && Object.keys(invoiceMeta).length) {
    // Claim the draft for THIS booking — stamp its UID/service_date if they're
    // missing OR differ (we only ever reuse this booking's draft or an unclaimed
    // one, so this records the identifiers a later re-generate's dedup relies on).
    const needsUpdate =
      (invoiceMeta.cal_booking_uid && invoice.metadata?.cal_booking_uid !== invoiceMeta.cal_booking_uid) ||
      (invoiceMeta.service_date && invoice.metadata?.service_date !== invoiceMeta.service_date)
    if (needsUpdate) {
      await stripe.invoices.update(invoice.id, { metadata: { ...invoice.metadata, ...invoiceMeta } }).catch(() => {})
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
