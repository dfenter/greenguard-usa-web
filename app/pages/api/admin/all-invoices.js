// Lists all Stripe invoices with server-side cursor pagination and basic
// filters. UI does the rest of the filtering client-side over the visible
// page. Query params: status, limit, starting_after, created_gte, due_gte.

const { requireAdmin } = require('../../../lib/auth')
const { stripe } = require('../../../lib/stripe')

const MAX_LIMIT = 100

export default async function handler(req, res) {
  const session = await requireAdmin(req, res)
  if (!session) return

  const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, MAX_LIMIT)
  const starting_after = req.query.starting_after || undefined
  const status = req.query.status || undefined
  const created_gte = req.query.created_gte ? parseInt(req.query.created_gte, 10) : undefined
  const due_gte = req.query.due_gte ? parseInt(req.query.due_gte, 10) : undefined

  try {
    const params = {
      limit,
      ...(starting_after ? { starting_after } : {}),
      ...(status ? { status } : {}),
      ...(created_gte ? { created: { gte: created_gte } } : {}),
      ...(due_gte ? { due_date: { gte: due_gte } } : {}),
      expand: ['data.customer'],
    }
    const page = await stripe.invoices.list(params)
    const rows = page.data.map((inv) => ({
      id: inv.id,
      number: inv.number || inv.id,
      customerName: typeof inv.customer === 'object' ? (inv.customer?.name || '') : '',
      customerEmail: typeof inv.customer === 'object' ? (inv.customer?.email || '') : (inv.customer_email || ''),
      status: inv.status,                // draft | open | paid | uncollectible | void
      paid: inv.paid,
      amountDue: inv.amount_due,
      amountPaid: inv.amount_paid,
      total: inv.total,
      created: inv.created,
      dueDate: inv.due_date,
      hostedInvoiceUrl: inv.hosted_invoice_url,
      pdfUrl: inv.invoice_pdf,
      collectionMethod: inv.collection_method,
      isSuperseded: inv.metadata?.superseded === 'true',
    }))
    res.setHeader('Cache-Control', 'private, max-age=20, stale-while-revalidate=120')
    return res.status(200).json({
      rows,
      hasMore: page.has_more,
      nextCursor: page.has_more ? page.data[page.data.length - 1]?.id : null,
    })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
