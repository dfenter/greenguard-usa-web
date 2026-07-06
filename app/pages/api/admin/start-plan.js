// Start a recurring service plan for a customer.
//
// POST body: { customerEmail, customerName?, planId, quantity? }
// Creates the Stripe customer if needed, then creates a Stripe subscription
// against the plan's recurring price IDs. Quantity scales per-unit plans
// like mosqitter-rental for multi-Mosqitter customers.

const { getSessionFromRequest, isAdminEmail, escapeStripeSearch } = require('../../../lib/auth')
const { stripe, priceIdForSku } = require('../../../lib/stripe')
const { getPlan } = require('../../../lib/service-plans')
const { findContactByEmail, updateContact } = require('../../../lib/hubspot')

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const { customerEmail, customerName, planId, quantity = 1 } = req.body || {}
  if (!customerEmail || !planId) return res.status(400).json({ error: 'customerEmail and planId required' })

  const plan = getPlan(planId)
  if (!plan) return res.status(400).json({ error: `Unknown plan: ${planId}` })

  // Find or create the Stripe customer.
  const search = await stripe.customers.search({ query: `email:"${escapeStripeSearch(customerEmail)}"`, limit: 1 })
  let customer = search.data[0]
  if (!customer) {
    customer = await stripe.customers.create({
      email: customerEmail,
      ...(customerName ? { name: customerName } : {}),
      metadata: { source: 'auto-created-from-start-plan' },
    })
  }

  // Resolve price IDs for each plan line item.
  const items = []
  for (const li of plan.items) {
    const priceId = priceIdForSku(li.sku)
    if (!priceId) return res.status(500).json({ error: `Missing Stripe price for SKU ${li.sku}` })
    items.push({
      price: priceId,
      quantity: plan.perUnit ? Math.max(1, parseInt(quantity, 10) || 1) : 1,
    })
  }

  // Set default PM if customer has one but it isn't set — so charge_automatically works.
  if (!customer.invoice_settings?.default_payment_method) {
    const pms = await stripe.paymentMethods.list({ customer: customer.id, limit: 5 })
    if (pms.data.length > 0) {
      await stripe.customers.update(customer.id, {
        invoice_settings: { default_payment_method: pms.data[0].id },
      })
    }
  }

  const collection = customer.invoice_settings?.default_payment_method
    || (await stripe.paymentMethods.list({ customer: customer.id, limit: 1 })).data.length > 0
      ? 'charge_automatically' : 'send_invoice'

  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items,
    collection_method: collection,
    ...(collection === 'send_invoice' ? { days_until_due: 14 } : {}),
    metadata: { plan_id: planId, plan_label: plan.label, started_by: session.email },
  })

  // Mirror the active-plan flag back to HubSpot so /admin/clients can show it.
  try {
    const contact = await findContactByEmail(customerEmail).catch(() => null)
    if (contact?.id) {
      await updateContact(contact.id, {
        properties: {
          plan_type: 'rent',
          customer_status: 'active',
          stripe_customer_id: customer.id,
        },
      }).catch(() => {})
    }
  } catch {}

  return res.status(200).json({
    ok: true,
    subscriptionId: sub.id,
    status: sub.status,
    collectionMethod: collection,
    planId,
    quantity,
  })
}
