// CSV statement upload. Two actions:
//   action=preview → parse CSV, ask LLM to suggest a category per row,
//                    return rows for admin review (nothing written).
//   action=import  → write the (admin-reviewed) rows to the transactions
//                    table with source='csv'. Idempotent via a stable
//                    external_id hash so re-uploading the same statement
//                    is a no-op.

const crypto = require('crypto')
const { getSessionFromRequest, isOwnerEmail } = require('../../../lib/auth')
const { parseCsvStatement } = require('../../../lib/books-csv')
const { complete } = require('../../../lib/llm')
const { q } = require('../../../lib/db')
const biz = require('../../../lib/business.config')

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } }

function rowHash(r) {
  const key = `${r.occurred_at}|${r.amount_cents}|${(r.description || '').slice(0, 80)}`
  return 'csv-' + crypto.createHash('sha1').update(key).digest('hex').slice(0, 24)
}

async function suggestCategories(rows) {
  const cats = (await q(`SELECT id, label, type, description FROM categories ORDER BY type, label`)).rows
  const catByLabel = Object.fromEntries(cats.map((c) => [c.label, c]))
  const catList = cats.map((c) => `  - ${c.label} (${c.type})`).join('\n')

  // Batch up to 50 rows per LLM call to stay under token limits.
  const out = new Array(rows.length).fill(null)
  for (let start = 0; start < rows.length; start += 50) {
    const batch = rows.slice(start, start + 50)
    const txList = batch.map((r, i) => {
      const sign = r.amount_cents >= 0 ? '+' : '-'
      const dollars = (Math.abs(r.amount_cents) / 100).toFixed(2)
      return `${i + 1}. ${sign}$${dollars} ${(r.description || '').slice(0, 100)}`
    }).join('\n')

    const prompt = `Categorize credit-card / bank statement rows for a ${biz.industry} in ${biz.city}.
Positive amounts = money in, negative = money out. Pick the SINGLE BEST category for each.

CATEGORIES:
${catList}

ROWS:
${txList}

Return JSON: {"assignments":[{"i":1,"category":"<exact label>","confidence":0.0-1.0}, ...]}`

    try {
      const { text } = await complete({
        system: 'You are a bookkeeping classifier. Strict JSON only.',
        user: prompt,
        json: true,
        maxTokens: 4096,
      })
      const parsed = JSON.parse(text)
      for (const a of parsed.assignments || []) {
        const cat = catByLabel[a.category] || catByLabel['Unknown']
        const idx = start + (a.i - 1)
        if (idx >= 0 && idx < rows.length) {
          out[idx] = { label: cat.label, id: cat.id, confidence: a.confidence }
        }
      }
    } catch (e) {
      console.error('CSV suggest LLM failed:', e.message)
      // Fall through — rows without a suggestion just default to Unknown.
    }
  }
  return out.map((s) => s || { label: 'Unknown', id: catByLabel['Unknown']?.id, confidence: 0 })
}

async function importRows(rows) {
  let inserted = 0
  let skipped = 0
  for (const r of rows) {
    const ext = rowHash(r)
    const result = await q(
      `INSERT INTO transactions
       (source, external_id, occurred_at, amount_cents, type, description, category_id, category_label, raw)
       VALUES ('csv', $1, $2, $3, 'csv', $4, $5, $6, $7)
       ON CONFLICT (source, external_id) DO NOTHING`,
      [ext, r.occurred_at, r.amount_cents, r.description, r.category_id || null, r.category_label || 'Unknown', { original: r }]
    )
    if (result.rowCount > 0) inserted++
    else skipped++
  }
  return { inserted, skipped }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isOwnerEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const action = req.body?.action || 'preview'

  try {
    if (action === 'preview') {
      const { csv } = req.body || {}
      if (!csv) return res.status(400).json({ error: 'csv required' })
      const { rows, errors } = parseCsvStatement(csv)
      if (rows.length === 0) return res.status(200).json({ rows: [], errors, suggestions: [] })
      const suggestions = await suggestCategories(rows)
      return res.status(200).json({
        rows: rows.map((r, i) => ({ ...r, suggested: suggestions[i] })),
        errors,
      })
    }

    if (action === 'import') {
      const { rows } = req.body || {}
      if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'rows required' })
      const result = await importRows(rows)
      return res.status(200).json({ ok: true, ...result })
    }

    return res.status(400).json({ error: 'unknown action' })
  } catch (e) {
    console.error('books-upload-csv error:', e)
    return res.status(500).json({ error: e.message })
  }
}
