const { getSessionFromRequest } = require('../../../lib/auth')
const { findContactByEmail, upsertContact, addNote } = require('../../../lib/hubspot')
const { addInvoiceItems, stripe } = require('../../../lib/stripe')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const session = await getSessionFromRequest(req)
  if (!session || session.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { email, skus = [], notes = '' } = req.body || {}
  if (!email) return res.status(400).json({ error: 'email required' })

  try {
    // Find Stripe customer ID
    const customers = await stripe.customers.search({
      query: `email:"${email}"`,
      limit: 1,
    })
    const stripeCustomerId = customers.data[0]?.id || null

    // Add invoice items for one-time SKUs
    let invoiceItemsAdded = 0
    if (stripeCustomerId && skus.length > 0) {
      const items = await addInvoiceItems(stripeCustomerId, skus)
      invoiceItemsAdded = items.length
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

    res.status(200).json({ success: true, invoiceItemsAdded })
  } catch (err) {
    console.error('complete-visit error:', err)
    res.status(500).json({ error: 'Failed to complete visit' })
  }
}
