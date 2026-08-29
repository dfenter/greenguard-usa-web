// Fulfil a paid SparkBridge checkout: issue one signed key per gateway bought, email
// them to the buyer from admin@, copy the admin, and leave a HubSpot note.
const { sendEmail } = require('./email')
const { skuInfo, issueForPurchase, licenseEmailHtml, supportUntilFrom, isoDate } = require('./sparkbridge-license')
const biz = require('./business.config')

function licenseeFrom(session) {
  const f = (session.custom_fields || []).find((x) => x.key === 'licensee')
  return (f && f.text && f.text.value) || session.customer_details?.name || session.customer_details?.email || 'SparkBridge customer'
}

async function fulfillSparkBridgeOrder({ session, stripe, notifyAdmin, addNote, findContactByEmail, upsertContact }) {
  const email = session.customer_details?.email || session.customer_email || ''
  const licensee = licenseeFrom(session)
  const sku = String(session.metadata?.sku || '').toLowerCase()
  const info = skuInfo(sku)
  if (!info) throw new Error(`sparkbridge fulfil: unknown sku ${sku} on ${session.id}`)

  // Quantity comes from the line item (the buyer can adjust it in Checkout), not the metadata.
  let quantity = parseInt(session.metadata?.quantity, 10) || 1
  try {
    const li = await stripe.checkout.sessions.listLineItems(session.id, { limit: 5 })
    const q = (li.data || []).reduce((a, l) => a + (l.quantity || 0), 0)
    if (q > 0) quantity = q
  } catch (e) {
    console.error('[sparkbridge-fulfil] line items failed, using metadata quantity:', e.message)
  }

  const purchasedAt = new Date((session.created || Math.floor(Date.now() / 1000)) * 1000)
  const keys = issueForPurchase({ sku, quantity, licensee, purchasedAt })
  const supportUntil = isoDate(supportUntilFrom(purchasedAt))
  const lines = [{ name: info.name, quantity, unit: info.unit }]
  const subject = `Your SparkBridge license: ${info.name}${quantity > 1 ? ` x ${quantity}` : ''}`
  const html = licenseEmailHtml({ licensee, lines, supportUntil })
  const attachments = keys.map((k) => ({ filename: k.filename, content: k.content, contentType: 'text/plain' }))

  if (!email) throw new Error(`sparkbridge fulfil: no customer email on ${session.id}`)
  await sendEmail({ to: email, bcc: biz.email, subject, html, attachments })
  console.log(`[sparkbridge-fulfil] ${quantity} key(s) for ${sku} sent to ${email} (${licensee})`)

  const results = { keys: keys.length }
  const side = []
  if (notifyAdmin) {
    side.push(notifyAdmin({
      source: 'SparkBridge checkout',
      customerName: licensee,
      customerEmail: email,
      amount: session.amount_total,
      subtotal: session.amount_subtotal || session.amount_total,
      tax: session.total_details?.amount_tax || 0,
      currency: session.currency,
      items: [{ description: `${info.name} (license key${quantity > 1 ? 's' : ''} emailed)`, amount: session.amount_total, quantity }],
      paidAt: session.created,
      ref: session.id,
    }).catch((e) => console.error('[sparkbridge-fulfil] admin notify failed:', e.message)))
  }
  if (findContactByEmail && upsertContact && addNote) {
    side.push((async () => {
      let c = await findContactByEmail(email)
      if (!c?.id) c = await upsertContact({ email, name: session.customer_details?.name || licensee })
      if (c?.id) await addNote(c.id, `[SPARKBRIDGE] ${info.name} x${quantity} $${((session.amount_total || 0) / 100).toFixed(2)} licensee="${licensee}" keys emailed, support through ${supportUntil}, session ${session.id}`)
    })().catch((e) => console.error('[sparkbridge-fulfil] hubspot failed:', e.message)))
  }
  await Promise.all(side)
  return results
}

module.exports = { fulfillSparkBridgeOrder, licenseeFrom }
