// Fulfil a paid SparkBridge checkout: issue one signed key per gateway bought, email
// them to the buyer from admin@, copy the admin, and leave a HubSpot note.
// When the buyer names the gateway (optional checkout field) and buys one, the purchase is
// recorded as a grant and ONE combined key covering every active grant for that
// email + gateway pair is issued instead; earlier keys for the pair are marked superseded.
const crypto = require('crypto')
const { sendEmail } = require('./email')
const L = require('./sparkbridge-license')
const store = require('./sparkbridge-store')
const biz = require('./business.config')

const { skuInfo, issueForPurchase, licenseEmailHtml, supportUntilFrom, isoDate } = L

function licenseeFrom(session) {
  const f = (session.custom_fields || []).find((x) => x.key === 'licensee')
  return (f && f.text && f.text.value) || session.customer_details?.name || session.customer_details?.email || 'SparkBridge customer'
}

function gatewayFrom(session) {
  const f = (session.custom_fields || []).find((x) => x.key === 'gateway')
  return String((f && f.text && f.text.value) || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 100)
}

/**
 * Issue one combined key from the given grants, record it (superseding earlier keys for
 * the pair), and email it to the email of record with the admin copied. A store failure
 * while recording is logged and never blocks the email. Returns the issued key.
 */
async function sendCombinedKey({ email, gatewayDisplay, grants, reason, replaces }) {
  const key = L.issueCombinedKey({ grants, gatewayDisplay })
  const supportUntil = key.supportUntil ? isoDate(key.supportUntil) : ''
  try {
    await store.recordIssuedKey({
      email, gateway: gatewayDisplay, licensee: key.licensee, entitlements: key.entitlements,
      supportUntil: supportUntil || null,
      keySha256: crypto.createHash('sha256').update(key.content, 'utf8').digest('hex'), reason,
    })
  } catch (e) {
    console.error('[sparkbridge-fulfil] recordIssuedKey failed:', e.message)
  }
  const subject = reason === 'reissue'
    ? `Your combined SparkBridge license for gateway ${key.gatewayDisplay}`
    : `Your SparkBridge license: ${key.products.join(', ')} (gateway ${key.gatewayDisplay})`
  const html = L.combinedEmailHtml({
    licensee: key.licensee, products: key.products, supportUntil, gatewayDisplay: key.gatewayDisplay,
    replaces, reissue: reason === 'reissue',
  })
  await sendEmail({ to: email, bcc: biz.email, subject, html, attachments: [{ filename: key.filename, content: key.content, contentType: 'text/plain' }] })
  return { ...key, supportUntilIso: supportUntil }
}

async function fulfillSparkBridgeOrder({ session, stripe, notifyAdmin, addNote, findContactByEmail, upsertContact }) {
  const email = session.customer_details?.email || session.customer_email || ''
  const licensee = licenseeFrom(session)
  const sku = String(session.metadata?.sku || '').toLowerCase()
  const info = skuInfo(sku, { retired: true })
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
  let supportUntil = isoDate(supportUntilFrom(purchasedAt))
  if (!email) throw new Error(`sparkbridge fulfil: no customer email on ${session.id}`)

  // Combined path: a named gateway and a single-gateway purchase. Any store failure falls
  // back to the per-purchase key below so the customer always gets a key.
  const gateway = gatewayFrom(session)
  let combined = null
  if (gateway && quantity === 1) {
    let grants = null
    try {
      await store.recordGrant({
        email, gateway, licensee, sku, entitlements: info.entitlements, supportUntil, sessionId: session.id,
      })
      grants = await store.activeGrants(email, gateway)
    } catch (e) {
      console.error('[sparkbridge-fulfil] grant store failed, issuing per-purchase key:', e.message)
    }
    if (grants && grants.length) {
      combined = await sendCombinedKey({ email, gatewayDisplay: gateway, grants, reason: 'purchase', replaces: grants.length > 1 })
      supportUntil = combined.supportUntilIso || supportUntil
      console.log(`[sparkbridge-fulfil] combined key (${combined.products.join(', ')}) for gateway ${gateway} sent to ${email} (${licensee})`)
    }
  }

  let keyCount = 1
  if (!combined) {
    const keys = issueForPurchase({ sku, quantity, licensee, purchasedAt })
    const lines = [{ name: info.name, quantity, unit: info.unit }]
    const subject = `Your SparkBridge license: ${info.name}${quantity > 1 ? ` x ${quantity}` : ''}`
    const html = licenseEmailHtml({ licensee, lines, supportUntil })
    const attachments = keys.map((k) => ({ filename: k.filename, content: k.content, contentType: 'text/plain' }))
    await sendEmail({ to: email, bcc: biz.email, subject, html, attachments })
    console.log(`[sparkbridge-fulfil] ${quantity} key(s) for ${sku} sent to ${email} (${licensee})`)
    keyCount = keys.length
  }

  const results = { keys: keyCount, combined: Boolean(combined) }
  const gwNote = combined
    ? ` gateway="${gateway}" combined key (${combined.products.join(', ')})`
    : (gateway ? ` gateway="${gateway}"` : '')
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
      if (c?.id) await addNote(c.id, `[SPARKBRIDGE] ${info.name} x${quantity} $${((session.amount_total || 0) / 100).toFixed(2)} licensee="${licensee}"${gwNote} ${combined ? 'key' : 'keys'} emailed, support through ${supportUntil}, session ${session.id}`)
    })().catch((e) => console.error('[sparkbridge-fulfil] hubspot failed:', e.message)))
  }
  await Promise.all(side)
  return results
}

module.exports = { fulfillSparkBridgeOrder, licenseeFrom, gatewayFrom, sendCombinedKey }
