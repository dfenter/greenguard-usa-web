const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { stripe, getTaxRateId } = require('../../../lib/stripe')
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
      const qty = Math.max(1, parseInt(req.body?.qty || 1, 10) || 1)

      // If invoiceId is provided, attach line item directly to that draft.
      // Otherwise create a pending item that lands on the customer's next invoice.
      const params = { customer: customerId }
      if (invoiceId) params.invoice = invoiceId
      if (priceId) {
        await stripe.invoiceItems.create({ ...params, price: priceId, quantity: qty })
      } else {
        await stripe.invoiceItems.create({
          ...params,
          amount: Math.round(price * 100 * qty),
          currency: 'usd',
          description: qty > 1 ? `${sku} ×${qty}` : sku,
        })
      }
      return res.status(200).json({ ok: true })
    }

    if (action === 'remove') {
      // Remove a pending invoice item (not yet on any invoice)
      if (!itemId) return res.status(400).json({ error: 'itemId required' })
      await stripe.invoiceItems.del(itemId)
      return res.status(200).json({ ok: true })
    }

    if (action === 'delete-line') {
      // Remove a line item from a draft invoice
      if (!invoiceId || !itemId) return res.status(400).json({ error: 'invoiceId and itemId required' })
      await stripe.invoices.deleteLineItem(invoiceId, itemId)
      return res.status(200).json({ ok: true })
    }

    if (action === 'update-line') {
      // Edit a line item in a draft invoice (description, amount)
      if (!invoiceId || !itemId) return res.status(400).json({ error: 'invoiceId and itemId required' })
      const { description, unitAmount } = req.body
      const updates = {}
      if (description) updates.description = description
      if (unitAmount !== undefined) updates.unit_amount = unitAmount
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' })
      await stripe.invoiceItems.update(itemId, updates)
      return res.status(200).json({ ok: true })
    }

    if (action === 'void') {
      // Void an open invoice (irreversible — invoice number stays on record)
      if (!invoiceId) return res.status(400).json({ error: 'invoiceId required' })
      await stripe.invoices.voidInvoice(invoiceId)
      return res.status(200).json({ ok: true })
    }

    if (action === 'delete-draft') {
      // Permanently delete a draft invoice. Only works on drafts; open/paid
      // invoices must be voided. Drafts have no invoice number yet.
      if (!invoiceId) return res.status(400).json({ error: 'invoiceId required' })
      const inv = await stripe.invoices.retrieve(invoiceId)
      if (inv.status !== 'draft') {
        return res.status(400).json({ error: `Cannot delete invoice in status '${inv.status}' — use void instead` })
      }
      await stripe.invoices.del(invoiceId)
      return res.status(200).json({ ok: true })
    }

    if (action === 'send') {
      if (!customerId) return res.status(400).json({ error: 'customerId required' })
      // Find or create a draft invoice, then finalize and either auto-charge
      // (charge_automatically) or email the hosted invoice link (send_invoice).
      let inv = invoiceId
        ? await stripe.invoices.retrieve(invoiceId)
        : (await stripe.invoices.list({ customer: customerId, status: 'draft', limit: 1 })).data[0]

      if (!inv) {
        inv = await stripe.invoices.create({ customer: customerId, auto_advance: false })
      }
      if (inv.status === 'draft') {
        if (!inv.lines?.data?.length || inv.amount_due === 0) {
          return res.status(400).json({ error: 'Cannot send an invoice with no billable items' })
        }
        const taxRateId = getTaxRateId()
        if (taxRateId) {
          try {
            await stripe.invoices.update(inv.id, { default_tax_rates: [taxRateId] })
          } catch (err) {
            if (err?.code !== 'resource_missing') throw err
            console.error(`Stripe tax rate ${taxRateId} not found — sending without tax`)
          }
        }
        // Repair common case: card on file but no default_payment_method set.
        // We need the default to be set for charge_automatically to actually
        // pull funds. If still no PMs at all, switch to send_invoice instead.
        if (inv.collection_method === 'charge_automatically') {
          const cust = await stripe.customers.retrieve(customerId)
          if (!cust.invoice_settings?.default_payment_method) {
            const pms = await stripe.paymentMethods.list({ customer: customerId, limit: 5 })
            if (pms.data.length > 0) {
              await stripe.customers.update(customerId, {
                invoice_settings: { default_payment_method: pms.data[0].id },
              })
            } else {
              await stripe.invoices.update(inv.id, {
                collection_method: 'send_invoice', days_until_due: 14,
              })
              inv.collection_method = 'send_invoice'
            }
          }
        }
        await stripe.invoices.finalizeInvoice(inv.id)
        if (inv.collection_method === 'send_invoice') {
          // Emails the hosted invoice link to the customer.
          await stripe.invoices.sendInvoice(inv.id)
        } else {
          // charge_automatically — attempt the charge now on the default PM.
          // payInvoice throws on failure; that's fine, surface as 500.
          await stripe.invoices.pay(inv.id)
        }
      }
      const refreshed = await stripe.invoices.retrieve(inv.id)
      return res.status(200).json({
        ok: true,
        invoiceId: inv.id,
        status: refreshed.status,
        collectionMethod: refreshed.collection_method,
      })
    }

    return res.status(400).json({ error: 'Unknown action' })
  }

  res.status(405).end()
}
