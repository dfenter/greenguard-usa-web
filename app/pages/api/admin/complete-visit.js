const { getSessionFromRequest, isAdminEmail, escapeStripeSearch } = require('../../../lib/auth')
const { findContactByEmail, upsertContact, addNote } = require('../../../lib/hubspot')
const { addInvoiceItems, stripe } = require('../../../lib/stripe')
const { SKU_PRICES, isSubscriptionSKU } = require('../../../lib/sku-engine')

// Only non-subscription, non-free SKUs are valid for manual invoice items
const BILLABLE_SKUS = new Set(
  Object.keys(SKU_PRICES).filter((sku) => !isSubscriptionSKU(sku) && sku !== 'ASSESS' && sku !== 'CHK')
)

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { email, skus: rawSkus = [], notes = '' } = req.body || {}
  if (!email) return res.status(400).json({ error: 'email required' })

  // Whitelist: only allow known non-subscription, non-free SKUs
  const skus = (Array.isArray(rawSkus) ? rawSkus : []).filter((s) => BILLABLE_SKUS.has(s))

  try {
    // Find Stripe customer ID
    const customers = await stripe.customers.search({
      query: `email:"${escapeStripeSearch(email)}"`,
      limit: 1,
    })
    const stripeCustomerId = customers.data[0]?.id || null

    // Add invoice items for one-time SKUs.
    // Double-billing guard: skip any SKU already added for this same customer +
    // visit day (double-submit, retry, or re-completing the same visit). Items
    // are now attached to a draft invoice (not left "pending"), so list ALL
    // invoice items — not just pending ones — to detect the duplicates.
    let invoiceItemsAdded = 0
    let skippedDuplicates = 0
    if (stripeCustomerId && skus.length > 0) {
      const visitDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
      let skusToAdd = skus
      try {
        const existing = await stripe.invoiceItems.list({
          customer: stripeCustomerId,
          limit: 100,
        })
        const billedToday = new Set(
          existing.data
            .filter((it) => it.metadata?.gg_source === 'complete-visit' && it.metadata?.gg_visit_date === visitDate)
            .map((it) => it.metadata?.gg_sku)
        )
        skusToAdd = skus.filter((s) => !billedToday.has(s))
        skippedDuplicates = skus.length - skusToAdd.length
      } catch (err) {
        console.error('complete-visit invoice-item lookup failed:', err.message)
        return res.status(503).json({ error: 'Could not verify existing invoice items; nothing was billed. Retry in a moment.' })
      }

      if (skusToAdd.length > 0) {
        const items = await addInvoiceItems(stripeCustomerId, skusToAdd, {
          gg_source: 'complete-visit',
          gg_visit_date: visitDate,
          gg_idem_base: `${stripeCustomerId}:${visitDate}:complete-visit`,
        })
        invoiceItemsAdded = items.length
      }
    }

    // Update HubSpot last_visit_date
    const contact = await findContactByEmail(email)
    if (contact) {
      await upsertContact({
        email,
        metadata: { last_visit_date: new Date().toISOString() },
      })

      // Add visit note
      const skuSummary = skus.length > 0 ? `Items: ${skus.join(', ')}` : 'No billable items'
      const noteBody = [
        `Visit completed ${new Date().toLocaleDateString('en-US')}`,
        skuSummary,
        notes ? `Notes: ${notes}` : '',
      ].filter(Boolean).join('\n')

      await addNote(contact.id, noteBody)
    }

    res.status(200).json({ success: true, invoiceItemsAdded, skippedDuplicates })
  } catch (err) {
    console.error('complete-visit error:', err)
    res.status(500).json({ error: 'Failed to complete visit' })
  }
}
