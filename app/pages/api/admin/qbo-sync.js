/**
 * POST /api/admin/qbo-sync
 * Sync a paid Stripe invoice to QuickBooks Online
 * Body: { stripeInvoiceId } OR { customerEmail, customerName, lines, serviceDate }
 */
const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { stripe } = require('../../../lib/stripe')
const qbo = require('../../../lib/qbo')

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  if (!process.env.QBO_CLIENT_ID || !process.env.QBO_REFRESH_TOKEN || !process.env.QBO_REALM_ID) {
    return res.status(503).json({ error: 'QuickBooks not configured — see CLAUDE.md for setup instructions' })
  }

  const { stripeInvoiceId, customerEmail, customerName, lines, serviceDate } = req.body || {}

  try {
    let syncEmail = customerEmail
    let syncName = customerName
    let syncLines = lines
    let syncDate = serviceDate
    let syncStripeId = stripeInvoiceId

    // If a Stripe invoice ID is given, pull data from Stripe
    if (stripeInvoiceId) {
      const inv = await stripe.invoices.retrieve(stripeInvoiceId, { expand: ['customer', 'lines'] })
      syncEmail = inv.customer_email
      syncName = inv.customer_name || inv.customer?.name
      syncDate = inv.metadata?.service_date || new Date(inv.created * 1000).toISOString().slice(0, 10)
      syncLines = inv.lines.data.map((l) => ({
        description: l.description || 'Service',
        amount: l.amount / 100,
        quantity: l.quantity || 1,
      }))
    }

    if (!syncEmail || !syncLines?.length) {
      return res.status(400).json({ error: 'customerEmail and lines required' })
    }

    const qboInvoice = await qbo.createInvoice({
      customerEmail: syncEmail,
      customerName: syncName,
      lines: syncLines,
      stripeInvoiceId: syncStripeId,
      serviceDate: syncDate,
    })

    return res.status(200).json({ ok: true, qboInvoiceId: qboInvoice.Id, docNumber: qboInvoice.DocNumber })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
