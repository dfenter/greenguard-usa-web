const crypto = require('crypto')
const { resolveSKU, isSubscriptionSKU } = require('../../../lib/sku-engine')
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
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const rawBody = await readRawBody(req)
  const signature = req.headers['x-cal-signature-256'] || ''

  if (process.env.CALCOM_WEBHOOK_SECRET) {
    if (!verifySignature(rawBody, signature, process.env.CALCOM_WEBHOOK_SECRET)) {
      return res.status(401).json({ error: 'Invalid signature' })
    }
  }

  let payload
  try {
    payload = JSON.parse(rawBody.toString())
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  // Only handle new bookings
  if (payload.triggerEvent !== 'BOOKING_CREATED') {
    return res.status(200).json({ received: true })
  }

  const booking = payload.payload
  const attendee = booking.attendees?.[0] || {}

  // Extract custom fields from Cal.com booking responses
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

  const customerInfo = {
    email: attendee.email,
    name: attendee.name,
    phone: attendee.phoneNumber || responses.phone?.value || '',
    address: responses.address?.value || booking.location || '',
    metadata: {
      calcom_booking_uid: booking.uid,
      visit_type: visit.visitType,
      system_type: visit.systemType,
      trap_count: String(visit.trapCount),
    },
  }

  const skus = resolveSKU(visit)

  // Free visits: no billing action needed
  if (skus.every((s) => s === 'ASSESS' || s === 'CHK')) {
    await upsertContact(customerInfo)
    return res.status(200).json({ received: true, skus })
  }

  const subscriptionSkus = skus.filter(isSubscriptionSKU)
  const oneTimeSkus = skus.filter((s) => !isSubscriptionSKU(s))

  try {
    const customer = await findOrCreateCustomer(customerInfo)
    const isNew = !customer.metadata?.calcom_booking_uid

    if (isNew && subscriptionSkus.length > 0) {
      await createSubscription(customer.id, subscriptionSkus)
    } else if (oneTimeSkus.length > 0) {
      await addInvoiceItems(customer.id, oneTimeSkus)
    }

    const { id: hubspotId } = await upsertContact({
      ...customerInfo,
      metadata: {
        ...customerInfo.metadata,
        stripe_customer_id: customer.id,
        customer_type: visit.customerType,
      },
    })

    await addNote(
      hubspotId,
      `Cal.com booking: ${booking.uid}\nVisit: ${visit.visitType} / ${visit.systemType} / ${visit.trapCount} trap(s)\nSKUs: ${skus.join(', ')}\nStart: ${booking.startTime}`
    )

    res.status(200).json({ received: true, skus, stripeCustomerId: customer.id })
  } catch (err) {
    console.error('Cal.com webhook error:', err)
    res.status(500).json({ error: err.message })
  }
}
