// Public, read-only aggregate endpoint for the marketing site's /proof page.
// Aggregates ONLY, never returns PII (no names, emails, phones, addresses,
// no per-customer rows). Every source is independently try/caught; a figure
// that cannot be reliably computed is OMITTED, never guessed or zeroed.

const { cached } = require('../../../lib/cache')

const ALLOWED_ORIGINS = [
  'https://ops.greenguard-usa.com',
  'https://www.greenguard-usa.com',
  'https://greenguard-usa.com',
  'https://new.greenguard-usa.com',
]

const DAY_MS = 24 * 60 * 60 * 1000

function median(nums) {
  if (!nums.length) return undefined
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

// Active recurring customers. The honest source is the CRM, since this business
// invoices one-time (no live Stripe subscriptions to count).
async function computeActiveRecurring() {
  const { countContactsByProperty } = require('../../../lib/hubspot')
  const count = await countContactsByProperty('customer_status', 'active')
  if (!Number.isFinite(count) || count <= 0) return undefined
  return count
}

// Visits completed in the trailing 30 days, from GCal bookings.
//
// Uses the PAGINATED fetch deliberately. The plain range helper caps at a
// single 250-event page with no pageToken loop, so a busy month would be
// silently truncated and this page would publish a capped number as fact.
// The paginated variant follows every page and throws past its safety cap,
// which makes an over-large window an OMITTED key rather than a false one.
async function computeVisits30d() {
  const { getBookingsForDateRangePaginated: getBookingsForDateRange } = require('../../../lib/gcal')
  const now = new Date()
  const start = new Date(now.getTime() - 30 * DAY_MS)
  const bookings = await getBookingsForDateRange(start.toISOString(), now.toISOString())
  if (!Array.isArray(bookings)) return undefined
  const completed = bookings.filter((b) => b.startTime && new Date(b.startTime).getTime() <= now.getTime())
  return completed.length
}

// Median days from invoice creation to payment, over invoices paid in the
// last 90 days.
async function computeMedianDaysToPaid() {
  const { listAllInvoicesSince } = require('../../../lib/stripe')
  const since = Math.floor((Date.now() - 90 * DAY_MS) / 1000)
  const invoices = await listAllInvoicesSince(since)
  if (!Array.isArray(invoices) || !invoices.length) return undefined
  const days = invoices
    .filter((inv) => inv.status === 'paid' && inv.status_transitions?.paid_at && inv.created)
    .map((inv) => (inv.status_transitions.paid_at - inv.created) / 86400)
    .filter((d) => Number.isFinite(d) && d >= 0)
  if (!days.length) return undefined
  const m = median(days)
  return m === undefined ? undefined : Math.round(m * 10) / 10
}

// Last closed month, derived honestly from categorized bookkeeping
// transactions. There is no explicit close-log table, so only report a month
// once it is fully in the past (complete) and has categorized rows.
async function computeLastClose() {
  const { q } = require('../../../lib/db')
  const result = await q(
    `SELECT to_char(date_trunc('month', occurred_at), 'YYYY-MM') AS ym
     FROM transactions
     WHERE category_label IS NOT NULL
     GROUP BY 1
     ORDER BY 1 DESC
     LIMIT 3`,
    []
  )
  const rows = result?.rows || []
  if (!rows.length) return undefined
  const now = new Date()
  const currentYm = now.toISOString().slice(0, 7)
  // Most recent categorized month that is strictly before the current month.
  const candidate = rows.find((r) => r.ym && r.ym < currentYm)
  return candidate ? candidate.ym : undefined
}

// Payroll runs paid in the current calendar year. listRuns returns HYDRATED
// objects (camelCase payDate), not raw rows, so read payDate. Voided runs do
// not count as runs that happened.
async function computePayrollRunsYtd() {
  const { listRuns } = require('../../../lib/payroll-store')
  const runs = await listRuns({ limit: 200 })
  if (!Array.isArray(runs)) return undefined
  const year = String(new Date().getFullYear())
  return runs.filter(
    (r) => typeof r?.payDate === 'string' && r.payDate.startsWith(year) && r.status !== 'voided'
  ).length
}

async function computeProof() {
  const out = { generatedAt: new Date().toISOString() }

  const jobs = [
    ['activeRecurring', computeActiveRecurring],
    ['visits30d', computeVisits30d],
    ['medianDaysToPaid', computeMedianDaysToPaid],
    ['lastClose', computeLastClose],
    ['payrollRunsYtd', computePayrollRunsYtd],
  ]

  const results = await Promise.allSettled(
    jobs.map(async ([key, fn]) => {
      try {
        const value = await fn()
        return [key, value]
      } catch {
        return [key, undefined]
      }
    })
  )

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      const [key, value] = r.value
      if (value !== undefined && value !== null) out[key] = value
    }
  }

  // reminderShare: no reliable sent-reminder record exists (no reminders
  // table / sent-log found), so this key is intentionally always omitted.

  return out
}

module.exports = async function handler(req, res) {
  try {
    const origin = req.headers?.origin || ''
    if (ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }

    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400')

    let body
    try {
      body = await cached('ops:proof:v2', 86400, computeProof)
    } catch {
      body = { generatedAt: new Date().toISOString() }
    }
    if (!body || typeof body !== 'object') body = { generatedAt: new Date().toISOString() }

    res.status(200).json(body)
  } catch {
    try {
      res.status(200).json({ generatedAt: new Date().toISOString() })
    } catch {
      // Absolute last resort. Nothing more we can safely do without risking
      // a throw from res itself.
    }
  }
}
