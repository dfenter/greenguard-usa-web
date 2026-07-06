// Apply a customer upgrade.
//
// Three kinds:
//   kind=capacity  → bump existing subscription item quantity (perUnit plans like MQ)
//                    OR cancel current and start a new plan (BG1 → BG2 different SKU)
//   kind=tier      → cancel current subscription, start a new one against targetPlan
//   kind=addon     → append a recurring SKU to subscription items AND store in
//                    HubSpot recurring_addons so future per-visit prefill picks it up
//
// POST body: { customerEmail, upgradeId, currentPathKey, quantity? }
// Returns: { ok, subscriptionId, action }

const { getSessionFromRequest, isAdminEmail, escapeStripeSearch } = require('../../../lib/auth')
const { stripe, priceIdForSku } = require('../../../lib/stripe')
const { getPlan } = require('../../../lib/service-plans')
const { PATHS } = require('../../../lib/upgrade-paths')
const { findContactByEmail, updateContact, addNote } = require('../../../lib/hubspot')

async function findUpgrade(currentPathKey, upgradeId) {
  const path = PATHS[currentPathKey]
  if (!path) return null
  return path.upgrades.find((u) => u.id === upgradeId) || null
}

async function getActiveSubscription(customerId) {
  const subs = await stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 5 })
  return subs.data[0] || null
}

async function cancelSubscription(subId) {
  await stripe.subscriptions.cancel(subId, { invoice_now: false, prorate: true })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const { customerEmail, upgradeId, currentPathKey, quantity = 1 } = req.body || {}
  if (!customerEmail || !upgradeId || !currentPathKey) {
    return res.status(400).json({ error: 'customerEmail, upgradeId, currentPathKey required' })
  }

  let upgrade, customer, contact
  try {
    upgrade = await findUpgrade(currentPathKey, upgradeId)
    if (!upgrade) return res.status(404).json({ error: `Unknown upgrade: ${upgradeId}` })

    const search = await stripe.customers.search({ query: `email:"${escapeStripeSearch(customerEmail)}"`, limit: 1 })
    customer = search.data[0]
    if (!customer) return res.status(404).json({ error: `No Stripe customer for ${customerEmail}` })

    contact = await findContactByEmail(customerEmail).catch(() => null)
  } catch (err) {
    console.error('execute-upgrade lookup error:', err)
    return res.status(500).json({ error: 'Failed to look up customer' })
  }

  try {
  if (upgrade.kind === 'addon') {
    // Append addon SKU to subscription if active sub exists
    const sub = await getActiveSubscription(customer.id)
    const priceId = priceIdForSku(upgrade.addonSku)
    if (!priceId) return res.status(500).json({ error: `Missing Stripe price for ${upgrade.addonSku}` })

    if (sub) {
      await stripe.subscriptionItems.create({ subscription: sub.id, price: priceId, quantity: 1 })
    } else {
      await stripe.subscriptions.create({
        customer: customer.id, items: [{ price: priceId }],
        collection_method: customer.invoice_settings?.default_payment_method ? 'charge_automatically' : 'send_invoice',
        ...(!customer.invoice_settings?.default_payment_method ? { days_until_due: 14 } : {}),
        metadata: { upgrade_id: upgradeId, started_by: session.email },
      })
    }

    // Update HubSpot recurring_addons so per-visit prefill knows about it.
    if (contact?.id) {
      const existing = (contact.properties?.recurring_addons || '').split(',').map((s) => s.trim()).filter(Boolean)
      if (!existing.includes(upgrade.addonSku)) {
        await updateContact(contact.id, {
          properties: { recurring_addons: [...existing, upgrade.addonSku].join(',') },
        }).catch(() => {})
      }
      await addNote(contact.id, `[UPGRADE] ${upgrade.title} added by ${session.email}`).catch(() => {})
    }

    return res.status(200).json({ ok: true, action: 'addon-added', sku: upgrade.addonSku })
  }

  // tier or capacity → swap to targetPlan
  const targetPlan = getPlan(upgrade.targetPlan)
  if (!targetPlan) return res.status(404).json({ error: `Unknown target plan: ${upgrade.targetPlan}` })

  const currentSub = await getActiveSubscription(customer.id)
  if (currentSub) await cancelSubscription(currentSub.id)

  const items = targetPlan.items.map((li) => ({
    price: priceIdForSku(li.sku),
    quantity: targetPlan.perUnit ? Math.max(1, parseInt(quantity, 10) || 1) : 1,
  }))

  // Ensure default PM if a card exists
  if (!customer.invoice_settings?.default_payment_method) {
    const pms = await stripe.paymentMethods.list({ customer: customer.id, limit: 5 })
    if (pms.data.length > 0) {
      await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pms.data[0].id } })
    }
  }
  const collection = (await stripe.customers.retrieve(customer.id)).invoice_settings?.default_payment_method
    ? 'charge_automatically' : 'send_invoice'

  const newSub = await stripe.subscriptions.create({
    customer: customer.id, items,
    collection_method: collection,
    ...(collection === 'send_invoice' ? { days_until_due: 14 } : {}),
    metadata: { upgrade_id: upgradeId, plan_id: upgrade.targetPlan, started_by: session.email, replaces_subscription: currentSub?.id || '' },
  })

  if (contact?.id) {
    await addNote(contact.id, `[UPGRADE] ${upgrade.kind === 'tier' ? 'Tier' : 'Capacity'} upgrade — ${upgrade.title} (sub ${newSub.id}) by ${session.email}`).catch(() => {})
  }

  return res.status(200).json({
    ok: true,
    action: upgrade.kind === 'tier' ? 'tier-swap' : 'capacity-swap',
    subscriptionId: newSub.id,
    replaced: currentSub?.id || null,
  })
  } catch (err) {
    console.error('execute-upgrade error:', err)
    return res.status(500).json({ error: 'Failed to execute upgrade' })
  }
}
