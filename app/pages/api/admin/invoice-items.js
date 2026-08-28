const { getSessionFromRequest, isAdminEmail, escapeStripeSearch } = require('../../../lib/auth')
const { stripe, getTaxRateId } = require('../../../lib/stripe')
const { SKU_PRICES } = require('../../../lib/sku-engine')
const { notifyAdminInvoiceSent } = require('../../../lib/purchase-notify')
const biz = require('../../../lib/business.config')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || biz.ownerEmail

function createInvoiceItem(params, requestId) {
  return typeof requestId === 'string'
    ? stripe.invoiceItems.create(params, { idempotencyKey: `gg:manual:${requestId}` })
    : stripe.invoiceItems.create(params)
}

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

    const search = await stripe.customers.search({ query: `email:"${escapeStripeSearch(email)}"`, limit: 1 })
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
        collectionMethod: inv.collection_method,
        items: (inv.lines?.data || []).map((l) => ({
          id: l.id,
          // The underlying invoice-item id (ii_…) is what we delete/update;
          // l.id is the line id (il_…) which the SDK can't delete directly.
          invoiceItem: l.invoice_item || null,
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
   try {
    const { action, customerId, sku, itemId, invoiceId, requestId } = req.body || {}

    if (action === 'add') {
      if (!customerId || !sku) return res.status(400).json({ error: 'customerId and sku required' })
      if (requestId !== undefined && (typeof requestId !== 'string' || requestId.length > 64)) {
        return res.status(400).json({ error: 'requestId must be a string of 64 characters or fewer' })
      }
      // Whitelist SKU against known list before using it to build env var names
      if (!Object.prototype.hasOwnProperty.call(SKU_PRICES, sku)) {
        return res.status(400).json({ error: `Unknown SKU: ${sku}` })
      }
      let priceId = process.env[`STRIPE_PRICE_${sku.replace(/-/g, '_')}`]
      const price = SKU_PRICES[sku]
      const qty = Math.max(1, parseInt(req.body?.qty || 1, 10) || 1)

      // Invoice line items only accept one-time prices. Many SKUs (BG1, MQ-RENT,
      // etc.) map to RECURRING subscription prices — using those throws
      // "price ... type=recurring but this field only accepts type=one_time".
      // If the mapped price is recurring, ignore it and bill an amount-based
      // one-time line from SKU_PRICES instead.
      if (priceId) {
        try {
          const p = await stripe.prices.retrieve(priceId)
          if (p.recurring) priceId = null
        } catch { priceId = null }
      }

      // Attach to the given draft, else the customer's most recent draft, else
      // leave pending (lands on next invoice). Without this, a plain "add"
      // silently created a pending item the admin never saw on the open draft.
      let targetInvoice = invoiceId
      if (!targetInvoice) {
        const drafts = await stripe.invoices.list({ customer: customerId, status: 'draft', limit: 1 })
        targetInvoice = drafts.data[0]?.id
      }
      const params = { customer: customerId }
      if (targetInvoice) params.invoice = targetInvoice
      if (priceId) {
        await createInvoiceItem({ ...params, price: priceId, quantity: qty }, requestId)
      } else {
        await createInvoiceItem({
          ...params,
          amount: Math.round(price * 100 * qty),
          currency: 'usd',
          description: qty > 1 ? `${sku} ×${qty}` : sku,
        }, requestId)
      }
      return res.status(200).json({ ok: true })
    }

    if (action === 'add-custom') {
      // Add a one-off / arbitrary line item (no SKU). Description + dollar
      // amount + qty entered by hand in the editor. Lands on the customer's
      // draft (same target logic as a SKU add) so it bills like any other line.
      if (!customerId) return res.status(400).json({ error: 'customerId required' })
      if (requestId !== undefined && (typeof requestId !== 'string' || requestId.length > 64)) {
        return res.status(400).json({ error: 'requestId must be a string of 64 characters or fewer' })
      }
      const description = String(req.body?.description || '').trim()
      const unitPrice = Number(req.body?.unitPrice)
      const qty = Math.max(1, parseInt(req.body?.qty || 1, 10) || 1)
      if (!description) return res.status(400).json({ error: 'description required' })
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        return res.status(400).json({ error: 'unitPrice must be a positive dollar amount' })
      }

      let targetInvoice = invoiceId
      if (!targetInvoice) {
        const drafts = await stripe.invoices.list({ customer: customerId, status: 'draft', limit: 1 })
        targetInvoice = drafts.data[0]?.id
      }
      const params = { customer: customerId }
      if (targetInvoice) params.invoice = targetInvoice
      await createInvoiceItem({
        ...params,
        amount: Math.round(unitPrice * 100 * qty),
        currency: 'usd',
        description: qty > 1 ? `${description} ×${qty}` : description,
      }, requestId)
      return res.status(200).json({ ok: true })
    }

    if (action === 'remove') {
      // Remove a pending invoice item (not yet on any invoice)
      if (!itemId) return res.status(400).json({ error: 'itemId required' })
      await stripe.invoiceItems.del(itemId)
      return res.status(200).json({ ok: true })
    }

    if (action === 'delete-line') {
      // Remove a line item from a draft invoice. Stripe has no
      // invoices.deleteLineItem — you delete the backing invoice item.
      // Accept either an invoice-item id (ii_…) directly, or a line id
      // (il_…) which we resolve to its invoice_item.
      if (!itemId) return res.status(400).json({ error: 'itemId required' })
      let invoiceItemId = itemId
      if (itemId.startsWith('il_')) {
        if (!invoiceId) return res.status(400).json({ error: 'invoiceId required to resolve line' })
        const inv = await stripe.invoices.retrieve(invoiceId)
        // Ownership guard (finding #8): when a customerId is supplied, the
        // invoice must belong to it — an automated caller must not mutate a
        // line on some other customer's invoice.
        if (customerId && inv.customer !== customerId) {
          return res.status(403).json({ error: 'Invoice does not belong to that customer' })
        }
        const line = (inv.lines?.data || []).find((l) => l.id === itemId)
        invoiceItemId = line?.invoice_item
        if (!invoiceItemId) return res.status(400).json({ error: 'This line is not a removable invoice item (e.g. a subscription line).' })
      }
      await stripe.invoiceItems.del(invoiceItemId)
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

      // Ownership guard (finding #8): never finalize/send an invoice that
      // belongs to a different customer than the one named in the request.
      if (inv && inv.customer !== customerId) {
        return res.status(403).json({ error: 'Invoice does not belong to that customer' })
      }

      if (!inv) {
        inv = await stripe.invoices.create({ customer: customerId, auto_advance: false })
      }
      let notifyFailed = false
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
        // Notify admin with a copy of what the customer received (hosted
        // invoice URL + line items) before reporting the outcome.
        try {
          const finalInv = await stripe.invoices.retrieve(inv.id)
          const cust = await stripe.customers.retrieve(customerId)
          const notifyResult = await notifyAdminInvoiceSent({ invoice: finalInv, customer: cust })
          if (!notifyResult?.ok) {
            notifyFailed = true
            console.error('admin invoice-sent notify:', notifyResult?.reason || 'unconfirmed')
          }
        } catch (e) {
          notifyFailed = true
          console.error('admin invoice-sent notify (pre-fetch):', e.message)
        }
      } else if (inv.status === 'open') {
        // Already-finalized invoice — admin is requesting a resend or a
        // force-charge. send_invoice path resends the email; auto-charge
        // path tries to pull funds again. Previously this branch silently
        // did nothing, so the Send button on unpaid invoices appeared
        // broken (and the "Open" link sent admin to the Stripe page).
        if (inv.collection_method === 'send_invoice') {
          await stripe.invoices.sendInvoice(inv.id)
        } else {
          // charge_automatically — attempt the charge now.
          try {
            await stripe.invoices.pay(inv.id)
          } catch (e) {
            // Charge failed (declined / no PM). Fall back to emailing the
            // hosted link so the customer can still pay.
            await stripe.invoices.update(inv.id, { collection_method: 'send_invoice', days_until_due: 14 })
            await stripe.invoices.sendInvoice(inv.id)
            console.warn(`Charge retry failed for ${inv.id}: ${e.message} — emailed link instead`)
          }
        }
        try {
          const finalInv = await stripe.invoices.retrieve(inv.id)
          const cust = await stripe.customers.retrieve(customerId)
          const notifyResult = await notifyAdminInvoiceSent({ invoice: finalInv, customer: cust })
          if (!notifyResult?.ok) {
            notifyFailed = true
            console.error('admin invoice-resent notify:', notifyResult?.reason || 'unconfirmed')
          }
        } catch (e) {
          notifyFailed = true
          console.error('admin invoice-resent notify:', e.message)
        }
      }
      const refreshed = await stripe.invoices.retrieve(inv.id)
      return res.status(200).json({
        ok: true,
        invoiceId: inv.id,
        status: refreshed.status,
        collectionMethod: refreshed.collection_method,
        ...(notifyFailed ? { notifyFailed: true } : {}),
      })
    }

    return res.status(400).json({ error: 'Unknown action' })
   } catch (e) {
     console.error('invoice-items POST error:', e)
     return res.status(502).json({ error: e.message || 'Stripe request failed' })
   }
  }

  res.status(405).end()
}
