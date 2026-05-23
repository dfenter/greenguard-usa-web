const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { stripe } = require('../../../lib/stripe')
const { SKU_PRICES } = require('../../../lib/sku-engine')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

// GET  ?email=xxx          — load customer, invoices, pending items
// POST action=add          — add invoice item by SKU
// POST action=remove       — remove invoice item
// POST action=send         — finalize draft invoice and send
export default async function handler(req, res) {
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  if (req.method === 'GET') {
    const { email } = req.query
    if (!email) return res.status(400).json({ error: 'email required' })

    const search = await stripe.customers.search({ query: `email:"${email}"`, limit: 1 })
    const customer = search.data[0]
    if (!customer) return res.status(404).json({ error: 'Customer not found in Stripe' })

    const [invoices, pendingItems, subs] = await Promise.all([
      stripe.invoices.list({ customer: customer.id, limit: 10 }),
      stripe.invoiceItems.list({ customer: customer.id, pending: true, limit: 50 }),
      stripe.subscriptions.list({ customer: customer.id, status: 'active', limit: 3 }),
    ])

    return res.status(200).json({
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
      subscription: subs.data[0] ? {
        status: subs.data[0].status,
        amount: subs.data[0].items.data.reduce((s, i) => s + (i.price.unit_amount || 0), 0),
        label: subs.data[0].items.data.map((i) => i.price.nickname || i.price.id).join(' + '),
      } : null,
      invoices: invoices.data.map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        amountDue: inv.amount_due,
        amountPaid: inv.amount_paid,
        created: inv.created,
        hostedUrl: inv.hosted_invoice_url,
        pdfUrl: inv.invoice_pdf,
        items: (inv.lines?.data || []).map((l) => ({
          id: l.id,
          description: l.description,
          amount: l.amount,
          quantity: l.quantity,
        })),
      })),
      pendingItems: pendingItems.data.map((item) => ({
        id: item.id,
        description: item.description,
        amount: item.amount,
        currency: item.currency,
        priceId: item.price?.id,
      })),
      // Available SKUs for adding
      skuList: Object.entries(SKU_PRICES).map(([sku, price]) => ({ sku, price })),
    })
  }

  if (req.method === 'POST') {
    const { action, customerId, sku, itemId, invoiceId } = req.body || {}

    if (action === 'add') {
      if (!customerId || !sku) return res.status(400).json({ error: 'customerId and sku required' })
      // Whitelist SKU against known list before using it to build env var names
      if (!Object.prototype.hasOwnProperty.call(SKU_PRICES, sku)) {
        return res.status(400).json({ error: `Unknown SKU: ${sku}` })
      }
      const priceId = process.env[`STRIPE_PRICE_${sku.replace(/-/g, '_')}`]
      const price = SKU_PRICES[sku]

      if (priceId) {
        await stripe.invoiceItems.create({ customer: customerId, price: priceId })
      } else {
        await stripe.invoiceItems.create({ customer: customerId, amount: Math.round(price * 100), currency: 'usd', description: sku })
      }
      return res.status(200).json({ ok: true })
    }

    if (action === 'remove') {
      if (!itemId) return res.status(400).json({ error: 'itemId required' })
      await stripe.invoiceItems.del(itemId)
      return res.status(200).json({ ok: true })
    }

    if (action === 'send') {
      if (!customerId) return res.status(400).json({ error: 'customerId required' })
      // Find or create a draft invoice, then finalize and send
      let inv = invoiceId
        ? await stripe.invoices.retrieve(invoiceId)
        : (await stripe.invoices.list({ customer: customerId, status: 'draft', limit: 1 })).data[0]

      if (!inv) {
        inv = await stripe.invoices.create({ customer: customerId, auto_advance: false })
      }
      if (inv.status === 'draft') {
        await stripe.invoices.finalizeInvoice(inv.id)
        await stripe.invoices.sendInvoice(inv.id)
      }
      return res.status(200).json({ ok: true, invoiceId: inv.id })
    }

    return res.status(400).json({ error: 'Unknown action' })
  }

  res.status(405).end()
}
