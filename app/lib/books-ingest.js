// Stripe ledger ingest. Pulls charges, refunds, payouts, and balance
// transactions since the last ingest cursor and writes them into the
// transactions table. Idempotent via UNIQUE (source, external_id).
//
// Categorization order (highest priority wins):
//   1. SKU rule (priority 1000)
//   2. Stripe-type rule (priority 500)
//   3. LLM fallback via Gemini (Phase 2 — for now lands as Unknown)

const { q } = require('./db')
const { stripe } = require('./stripe')

async function getCategoryByLabel(label) {
  const r = await q('SELECT id, label FROM categories WHERE label = $1', [label])
  return r.rows[0] || null
}

async function lookupRuleSku(sku) {
  if (!sku) return null
  const r = await q(`SELECT c.id, c.label
                     FROM category_rules cr JOIN categories c ON c.id = cr.category_id
                     WHERE cr.match_kind = 'sku' AND cr.match_value = $1
                     ORDER BY cr.priority DESC LIMIT 1`, [sku])
  return r.rows[0] || null
}

async function lookupRuleType(type) {
  const r = await q(`SELECT c.id, c.label
                     FROM category_rules cr JOIN categories c ON c.id = cr.category_id
                     WHERE cr.match_kind = 'stripe_type' AND cr.match_value = $1
                     ORDER BY cr.priority DESC LIMIT 1`, [type])
  return r.rows[0] || null
}

async function categorize({ sku, type }) {
  if (sku) {
    const r = await lookupRuleSku(sku)
    if (r) return r
  }
  if (type) {
    const r = await lookupRuleType(type)
    if (r) return r
  }
  return await getCategoryByLabel('Unknown')
}

async function insertTx({ source, external_id, occurred_at, amount_cents, type, description, customer_email, customer_name, sku, raw }) {
  const cat = await categorize({ sku, type })
  await q(
    `INSERT INTO transactions
     (source, external_id, occurred_at, amount_cents, type, description, customer_email, customer_name, sku, category_id, category_label, raw)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (source, external_id) DO NOTHING`,
    [source, external_id, occurred_at, amount_cents, type, description, customer_email, customer_name, sku, cat?.id || null, cat?.label || 'Unknown', raw]
  )
}

async function ingestStripeBalanceTransactions({ daysBack = 365 } = {}) {
  // Use balance transactions as the canonical truth: they include charges,
  // refunds, fees, and payouts in one stream. Each btx has a `source` that
  // points back to the originating invoice/charge if we want detail.
  const run = await q(
    `INSERT INTO ingest_runs (source, started_at) VALUES ('stripe', NOW()) RETURNING id`
  )
  const runId = run.rows[0].id
  const cursor = Math.floor(Date.now() / 1000) - daysBack * 86400
  let added = 0

  try {
    let starting_after
    do {
      const page = await stripe.balanceTransactions.list({
        limit: 100, created: { gte: cursor },
        ...(starting_after ? { starting_after } : {}),
        expand: ['data.source'],
      })
      for (const btx of page.data) {
        const src = btx.source
        // Extract customer info + SKU from the source object when possible
        let customer_email = null, customer_name = null, sku = null, description = btx.description || ''
        if (src && typeof src === 'object') {
          if (src.object === 'charge' || src.object === 'payment') {
            customer_email = src.billing_details?.email || src.receipt_email || null
            customer_name  = src.billing_details?.name || null
            description    = src.description || description
          } else if (src.object === 'invoice') {
            customer_email = src.customer_email || null
            const lines = src.lines?.data || []
            const skuFromMeta = lines.find((l) => l.price?.metadata?.sku)?.price?.metadata?.sku
            if (skuFromMeta) sku = skuFromMeta
            description = src.description || lines[0]?.description || description
          }
        }
        await insertTx({
          source: 'stripe',
          external_id: btx.id,
          occurred_at: new Date(btx.created * 1000),
          amount_cents: btx.net,
          type: btx.type,
          description,
          customer_email,
          customer_name,
          sku,
          raw: btx,
        })
        added++
      }
      starting_after = page.has_more ? page.data[page.data.length - 1]?.id : null
    } while (starting_after)

    await q(`UPDATE ingest_runs SET finished_at=NOW(), rows_added=$1, ok=true WHERE id=$2`, [added, runId])
    return { ok: true, added }
  } catch (e) {
    await q(`UPDATE ingest_runs SET finished_at=NOW(), rows_added=$1, ok=false, error=$2 WHERE id=$3`, [added, e.message, runId])
    throw e
  }
}

module.exports = { ingestStripeBalanceTransactions, categorize }
