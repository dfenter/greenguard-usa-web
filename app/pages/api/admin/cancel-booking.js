const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { cancelBooking } = require('../../../lib/calcom')
const { stripe } = require('../../../lib/stripe')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const { bookingId, reason, customerEmail, action = 'cancel' } = req.body || {}
  if (!bookingId) return res.status(400).json({ error: 'bookingId required' })

  // Cancel or reschedule the Cal.com booking
  await cancelBooking(bookingId, reason || 'Cancelled by admin')

  // Handle the customer's open/draft Stripe invoice
  let invoiceAction = null
  if (customerEmail) {
    try {
      const search = await stripe.customers.search({ query: `email:"${customerEmail}"`, limit: 1 })
      const customer = search.data[0]
      if (customer) {
        const [drafts, opens] = await Promise.all([
          stripe.invoices.list({ customer: customer.id, status: 'draft', limit: 1 }),
          stripe.invoices.list({ customer: customer.id, status: 'open', limit: 1 }),
        ])
        const invoice = drafts.data[0] || opens.data[0] || null
        if (invoice) {
          if (action === 'cancel') {
            // Void open invoices, delete drafts
            if (invoice.status === 'open') {
              await stripe.invoices.voidInvoice(invoice.id)
              invoiceAction = 'voided'
            } else if (invoice.status === 'draft') {
              await stripe.invoices.del(invoice.id)
              invoiceAction = 'deleted'
            }
          } else if (action === 'reschedule') {
            // Leave invoice as draft — it will be updated when visit is completed
            invoiceAction = 'kept_as_draft'
          }
        }
      }
    } catch (err) {
      console.error('cancel-booking invoice error:', err.message)
    }
  }

  res.status(200).json({ ok: true, invoiceAction })
}
