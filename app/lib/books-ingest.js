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

async function preloadCategoryRules() {
  const [rules, unknown] = await Promise.all([
    q(`SELECT cr.match_kind, cr.match_value, cr.priority, c.id, c.label
       FROM category_rules cr JOIN categories c ON c.id = cr.category_id
       WHERE cr.match_kind IN ('sku', 'stripe_type')
       ORDER BY cr.priority DESC`),
    getCategoryByLabel('Unknown'),
  ])
  const bySku = new Map()
  const byType = new Map()
  for (const rule of rules.rows) {
    const target = rule.match_kind === 'sku' ? bySku : byType
    if (!target.has(rule.match_value)) target.set(rule.match_value, { id: rule.id, label: rule.label })
  }
  return { bySku, byType, unknown }
}

function categorizeWithRules({ sku, type }, rules) {
  return (sku && rules.bySku.get(sku)) ||
    (type && rules.byType.get(type)) ||
    rules.unknown
}

async function insertTransactionsBatch(rows) {
  if (!rows.length) return 0
  const columns = ['source', 'external_id', 'occurred_at', 'amount_cents', 'type', 'description', 'customer_email', 'customer_name', 'sku', 'category_id', 'category_label', 'raw']
  const values = []
  const placeholders = rows.map((row, rowIndex) => {
    const offset = rowIndex * columns.length
    values.push(
      row.source, row.external_id, row.occurred_at, row.amount_cents, row.type,
      row.description, row.customer_email, row.customer_name, row.sku,
      row.category_id, row.category_label, row.raw
    )
    return `(${columns.map((_, i) => `$${offset + i + 1}`).join(',')})`
  })
  const result = await q(
    `INSERT INTO transactions (${columns.join(', ')}) VALUES ${placeholders.join(', ')}
     ON CONFLICT (source, external_id) DO NOTHING RETURNING external_id`,
    values
  )
  return result.rowCount
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
    const rules = await preloadCategoryRules()
    let starting_after
    do {
      const page = await stripe.balanceTransactions.list({
        limit: 100, created: { gte: cursor },
        ...(starting_after ? { starting_after } : {}),
        expand: ['data.source'],
      })
      const rows = page.data.map((btx) => {
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
        const cat = categorizeWithRules({ sku, type: btx.type }, rules)
        return {
          source: 'stripe',
          external_id: btx.id,
          occurred_at: new Date(btx.created * 1000),
          amount_cents: btx.net,
          type: btx.type,
          description,
          customer_email,
          customer_name,
          sku,
          category_id: cat?.id || null,
          category_label: cat?.label || 'Unknown',
          raw: btx,
        }
      })
      // One parameterized multi-row insert per Stripe page. The unique key
      // makes retries safe and RETURNING gives the true inserted count.
      added += await insertTransactionsBatch(rows)
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
