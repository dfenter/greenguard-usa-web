// Natural-language book-keeping Q&A.
//
// 1. User question → Gemini with the ledger schema in context
// 2. Gemini returns: { sql: "<SELECT ...>", explanation: "..." }
// 3. We sanity-check the SQL (SELECT only, no semicolons after, LIMIT cap)
// 4. Execute in a read-only transaction
// 5. Return rows + Gemini's plain-English summary

const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { getPool } = require('../../../lib/db')
const { complete } = require('../../../lib/llm')

const SCHEMA_DOC = `
You query a Postgres database for a mosquito-control business. Only ever SELECT from these tables.

TABLE transactions
  id INTEGER PRIMARY KEY
  source TEXT                  -- 'stripe', 'manual'
  external_id TEXT             -- e.g. Stripe txn id
  occurred_at TIMESTAMPTZ
  amount_cents BIGINT          -- POSITIVE = inflow (revenue), NEGATIVE = outflow (fees, refunds, payouts). Divide by 100 for dollars.
  currency TEXT                -- 'usd'
  type TEXT                    -- 'charge','refund','fee','payout','adjustment', etc.
  description TEXT
  customer_email TEXT
  customer_name TEXT
  sku TEXT                     -- e.g. 'BG1','TANK-REFILL','CO2-ADDON'
  category_label TEXT          -- e.g. 'Revenue:Biogents:Rental', 'Expense:PaymentProcessing'

TABLE categories
  id INTEGER PRIMARY KEY
  label TEXT
  type TEXT                    -- 'revenue','cogs','expense','asset','liability','equity','transfer','unknown'

TABLE manual_entries
  id, occurred_at, amount_cents, description, category_id, receipt_url

TABLE mileage_logs
  id, date, stops, miles, rate_cents, source

CONVENTIONS:
- Money: SUM(amount_cents)/100.0 for dollar totals
- Revenue lines have positive amount_cents and category_label LIKE 'Revenue:%'
- Fees/expenses have negative amount_cents
- "MRR" = sum of last full month's category_label LIKE 'Revenue:%:Rental' subscriptions (Biogents/Mosqitter/Tank rentals)
- "Net" = sum of all amount_cents in window / 100
- Customers ranked by lifetime = GROUP BY customer_email, SUM(positive amounts only)

OUTPUT RULES:
- Always wrap dates in single quotes
- Always alias money columns clearly (e.g. revenue_usd)
- Cap with LIMIT 100 unless a smaller cap is more sensible
- DATE_TRUNC for monthly/weekly/daily rollups
- One single SELECT, no semicolon, no DML, no DDL
`.trim()

function sanitizeSql(sql) {
  if (!sql) throw new Error('No SQL generated')
  const trimmed = sql.trim().replace(/;\s*$/, '')
  if (!/^select\b/i.test(trimmed)) throw new Error('Only SELECT statements are allowed')
  // Block any clearly-mutating keywords just in case
  if (/\b(update|delete|insert|drop|alter|truncate|grant|copy|create|vacuum)\b/i.test(trimmed)) {
    throw new Error('Mutating statements not allowed')
  }
  // Hard cap with LIMIT if missing
  if (!/\blimit\s+\d+/i.test(trimmed)) return `${trimmed} LIMIT 100`
  return trimmed
}

async function runReadOnly(sql) {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN READ ONLY')
    const r = await client.query(sql)
    await client.query('COMMIT')
    return r
  } finally {
    client.release()
  }
}

async function summarize({ question, sql, rows }) {
  if (!rows.length) return "I couldn't find any matching transactions."
  const sample = JSON.stringify(rows.slice(0, 20), (_, v) => typeof v === 'bigint' ? Number(v) : v)
  const { text } = await complete({
    system: 'You are summarizing query results for a small-business owner. Be concise. Use plain dollar amounts. 1-3 short sentences.',
    user: `Question: ${question}\n\nSQL run:\n${sql}\n\nRows (up to 20):\n${sample}\n\nWrite a 1-3 sentence answer. If there are too many rows to summarize, give the headline numbers.`,
    maxTokens: 400,
  })
  return text.trim()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const { question } = req.body || {}
  if (!question || question.trim().length < 3) return res.status(400).json({ error: 'Need a question (3+ chars)' })

  try {
    // Step 1: ask the LLM for a SQL query.
    const planRes = await complete({
      system: SCHEMA_DOC + '\n\nRespond with strict JSON: { "sql": "<one SELECT>", "explanation": "<one line>" }',
      user: `Question from the business owner: ${question}\n\nWrite ONE Postgres SELECT query that answers it.`,
      json: true,
      maxTokens: 1024,
    })
    let plan
    try { plan = JSON.parse(planRes.text) } catch {
      return res.status(500).json({ error: 'LLM returned non-JSON: ' + planRes.text.slice(0, 200) })
    }
    const sql = sanitizeSql(plan.sql)
    // Step 2: run it
    const result = await runReadOnly(sql)
    // Step 3: have the LLM summarize
    const summary = await summarize({ question, sql, rows: result.rows })
    return res.status(200).json({
      sql,
      explanation: plan.explanation || '',
      rows: result.rows,
      rowCount: result.rowCount,
      summary,
    })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
