// LLM-powered categorizer for transactions that didn't match a rule.
// Sends a batch of Unknown transactions to Gemini with the chart of
// accounts and asks it to pick the best category for each. Writes back
// the assignment AND creates a new rule for the SKU/description so
// future ingests don't need the LLM.

const { q } = require('./db')
const { complete } = require('./llm')

const BATCH_SIZE = 25

async function getCategories() {
  const r = await q(`SELECT id, label, type, description FROM categories ORDER BY type, label`)
  return r.rows
}

async function getUncategorized(limit = BATCH_SIZE) {
  const r = await q(`
    SELECT id, occurred_at, amount_cents, type, description, customer_email, customer_name, sku
    FROM transactions
    WHERE category_label = 'Unknown' OR category_label IS NULL
    ORDER BY occurred_at DESC
    LIMIT $1
  `, [limit])
  return r.rows
}

async function applyCategorization(txId, category) {
  await q(
    `UPDATE transactions SET category_id = $1, category_label = $2 WHERE id = $3`,
    [category.id, category.label, txId]
  )
}

async function maybeAddRule({ kind, value, categoryId, priority = 800 }) {
  if (!value) return
  await q(
    `INSERT INTO category_rules (match_kind, match_value, category_id, priority)
     SELECT $1, $2, $3, $4
     WHERE NOT EXISTS (SELECT 1 FROM category_rules WHERE match_kind=$1 AND match_value=$2)`,
    [kind, value, categoryId, priority]
  )
}

function buildPrompt(categories, txs) {
  const catList = categories.map((c) => `  - ${c.label} (${c.type}): ${c.description || ''}`).join('\n')
  const txList = txs.map((t, i) => {
    const sign = t.amount_cents >= 0 ? '+' : '-'
    const dollars = (Math.abs(t.amount_cents) / 100).toFixed(2)
    return `${i + 1}. type=${t.type} amount=${sign}$${dollars} sku=${t.sku || '—'} customer=${t.customer_name || t.customer_email || '—'} desc=${(t.description || '').slice(0, 120)}`
  }).join('\n')

  return `You are categorizing financial transactions for a mosquito-control business in Austin, TX.
For each transaction below, pick the SINGLE BEST category from the list. Return a JSON object with an "assignments" array, one per input.

Each assignment must be: {"i": <1-indexed number>, "category": "<exact label from list>", "confidence": 0.0-1.0, "reason": "<one-line why>"}

If you genuinely can't tell, use "Unknown". Prefer specific revenue categories over Revenue:Other when the SKU or description hints at the service type.

CATEGORIES:
${catList}

TRANSACTIONS:
${txList}

Respond with valid JSON only.`
}

async function categorizeBatch({ limit = BATCH_SIZE, dryRun = false } = {}) {
  const categories = await getCategories()
  const catByLabel = Object.fromEntries(categories.map((c) => [c.label, c]))
  const txs = await getUncategorized(limit)
  if (txs.length === 0) return { processed: 0, assignments: [] }

  const prompt = buildPrompt(categories, txs)
  const { text, model } = await complete({
    system: 'You are a bookkeeping classification assistant. Return strict JSON.',
    user: prompt,
    json: true,
    maxTokens: 4096,
  })

  let parsed
  try { parsed = JSON.parse(text) } catch {
    throw new Error('LLM returned non-JSON: ' + text.slice(0, 200))
  }

  const results = []
  for (const a of (parsed.assignments || [])) {
    const tx = txs[a.i - 1]
    if (!tx) continue
    const cat = catByLabel[a.category] || catByLabel['Unknown']
    results.push({ tx_id: tx.id, sku: tx.sku, category: cat.label, confidence: a.confidence, reason: a.reason })
    if (!dryRun) {
      await applyCategorization(tx.id, cat)
      // If we're confident and there's a SKU, add a rule so we never ask
      // the LLM again about this SKU.
      if (a.confidence >= 0.8 && tx.sku) {
        await maybeAddRule({ kind: 'sku', value: tx.sku, categoryId: cat.id, priority: 800 })
      }
    }
  }
  return { processed: results.length, model, assignments: results }
}

module.exports = { categorizeBatch, getUncategorized }
