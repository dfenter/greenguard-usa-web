const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { stripe } = require('../../../lib/stripe')
const { updateContact } = require('../../../lib/hubspot')
const biz = require('../../../lib/business.config')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || biz.ownerEmail

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const { customerId, hubspotContactId, name, phone, address, planType, systemType, trapCount, hasTimer } = req.body || {}
  if (!customerId && !hubspotContactId) return res.status(400).json({ error: 'customerId or hubspotContactId required' })

  // Only update Stripe for real Stripe customer IDs; prospects use hs_ prefixed IDs
  const isStripeCustomer = typeof customerId === 'string' && customerId.startsWith('cus_')

  const stripeUpdates = {}
  if (name !== undefined) stripeUpdates.name = name
  if (phone !== undefined) stripeUpdates.phone = phone
  if (address !== undefined) stripeUpdates.address = { line1: address }
  // Store system fields in Stripe metadata as fallback when HubSpot properties aren't set
  const meta = {}
  if (planType !== undefined) meta.plan_type = planType
  if (systemType !== undefined) meta.system_type = systemType
  if (trapCount !== undefined) meta.trap_count = String(trapCount)
  if (hasTimer !== undefined) meta.has_timer = hasTimer ? 'true' : 'false'
  if (Object.keys(meta).length) stripeUpdates.metadata = meta

  const hubspotFields = { name, phone, address, plan_type: planType, system_type: systemType, trap_count: trapCount ? String(trapCount) : undefined, has_timer: hasTimer ? 'true' : 'false' }

  try {
    await Promise.all([
      isStripeCustomer && Object.keys(stripeUpdates).length ? stripe.customers.update(customerId, stripeUpdates) : Promise.resolve(),
      hubspotContactId ? updateContact(hubspotContactId, hubspotFields) : Promise.resolve(),
    ])
    res.status(200).json({ ok: true })
  } catch (err) {
    console.error('update-customer error:', err)
    res.status(502).json({ error: 'Failed to update customer' })
  }
}
