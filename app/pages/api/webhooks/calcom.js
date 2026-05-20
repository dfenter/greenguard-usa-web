const crypto = require('crypto')
const { resolveSKU, resolveByTitle, normalizeEventTitle, isSubscriptionSKU } = require('../../../lib/sku-engine')
const { findOrCreateCustomer, createSubscription, addInvoiceItems } = require('../../../lib/stripe')
const { upsertContact, addNote } = require('../../../lib/hubspot')

export const config = { api: { bodyParser: false } }

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function verifySignature(rawBody, signature, secret) {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  if (!signature || expected.length !== signature.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

/**
 * Resolve SKUs from a Cal.com booking.
 * Primary path: match event type title against cal-event-types.json
 * Fallback: use custom form fields (visitType, systemType, etc.)
 */
function resolveBookingSKUs(booking) {
  // Primary: title-based resolution
  const rawTitle = booking.eventType?.title || booking.title || ''
  const cleanTitle = normalizeEventTitle(rawTitle)
  const titleMatch = resolveByTitle(cleanTitle)
  if (titleMatch) return { ...titleMatch, resolvedBy: 'title' }

  // Fallback: custom form field resolution
  const responses = booking.responses || {}
  const visit = {
    visitType: responses.visitType?.value || 'assessment',
    systemType: responses.systemType?.value || 'Biogents-CO2',
    trapCount: parseInt(responses.trapCount?.value || '1', 10),
    tankCount: parseInt(responses.tankCount?.value || '1', 10),
    addons: responses.addons?.value || [],
    isWeekend: new Date(booking.startTime).getDay() % 6 === 0,
    customerType: responses.customerType?.value || 'rental',
  }
  return {
    skus: resolveSKU(visit),
    visitType: visit.visitType,
    systemType: visit.systemType,
    trapCount: visit.trapCount,
    tankCount: visit.tankCount,
    addons: visit.addons,
    resolvedBy: 'fields',
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const rawBody = await readRawBody(req)
  const signature = req.headers['x-cal-signature-256'] || ''

  if (!process.env.CALCOM_WEBHOOK_SECRET) {
    return res.status(500).json({ error: 'Webhook not configured' })
  }
  if (!verifySignature(rawBody, signature, process.env.CALCOM_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  let payload
  try {
    payload = JSON.parse(rawBody.toString())
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  if (payload.triggerEvent !== 'BOOKING_CREATED') {
    return res.status(200).json({ received: true })
  }

  const booking = payload.payload
  const attendee = booking.attendees?.[0] || {}
  const responses = booking.responses || {}

  const resolved = resolveBookingSKUs(booking)
  const { skus, visitType, systemType, trapCount, tankCount } = resolved

  const customerInfo = {
    email: attendee.email,
    name: attendee.name,
    phone: attendee.phoneNumber || responses.phone?.value || '',
    address: responses.address?.value || booking.location || '',
    metadata: {
      calcom_booking_uid: booking.uid,
      visit_type: visitType,
      system_type: systemType,
      trap_count: String(trapCount || 0),
      tank_count: String(tankCount || 0),
    },
  }

  // Free visits require no billing action
  if (skus.every((s) => s === 'ASSESS' || s === 'CHK')) {
    await upsertContact(customerInfo)
    return res.status(200).json({ received: true, skus })
  }

  const subscriptionSkus = skus.filter(isSubscriptionSKU)
  const oneTimeSkus = skus.filter((s) => !isSubscriptionSKU(s))

  try {
    const customer = await findOrCreateCustomer(customerInfo)

    // New customer: create subscription for recurring SKUs
    // Existing customer: attach one-time add-ons to next invoice
    const isNewCustomer = !customer.metadata?.calcom_booking_uid
    if (isNewCustomer && subscriptionSkus.length > 0) {
      await createSubscription(customer.id, subscriptionSkus)
    }
    if (oneTimeSkus.length > 0) {
      await addInvoiceItems(customer.id, oneTimeSkus)
    }

    const { id: hubspotId } = await upsertContact({
      ...customerInfo,
      metadata: {
        ...customerInfo.metadata,
        stripe_customer_id: customer.id,
        customer_type: responses.customerType?.value || 'rental',
        sku_resolved_by: resolved.resolvedBy,
      },
    })

    const eventTitle = normalizeEventTitle(booking.eventType?.title || booking.title || '')
    await addNote(
      hubspotId,
      `Cal.com booking: ${booking.uid}\nEvent: ${eventTitle}\nSKUs: ${skus.join(', ')} (resolved by ${resolved.resolvedBy})\nVisit: ${visitType} / ${systemType}\nStart: ${booking.startTime}`
    )

    res.status(200).json({ received: true, skus, resolvedBy: resolved.resolvedBy, stripeCustomerId: customer.id })
  } catch (err) {
    console.error('Cal.com webhook error:', err)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
}
