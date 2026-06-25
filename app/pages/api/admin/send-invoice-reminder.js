// POST /api/admin/send-invoice-reminder
// Body: { invoiceId }
// Re-sends the Stripe invoice email (with the hosted pay link) to the customer
// as a past-due reminder. Uses Stripe's invoices.sendInvoice, which re-delivers
// the standard invoice email for an open (finalized) invoice.

const { requireAdmin } = require('../../../lib/auth')
const { stripe } = require('../../../lib/stripe')

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await requireAdmin(req, res)
  if (!session) return

  const invoiceId = req.body?.invoiceId
  if (!invoiceId) return res.status(400).json({ error: 'invoiceId required' })

  try {
    const invoice = await stripe.invoices.retrieve(invoiceId)
    if (invoice.status !== 'open') {
      return res.status(400).json({ error: `Invoice is ${invoice.status}, not open` })
    }
    await stripe.invoices.sendInvoice(invoiceId)
    return res.status(200).json({ ok: true, email: invoice.customer_email || null })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to send reminder' })
  }
}
