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
// objects (camelCase payDate), not raw rows, so read payDate. A voided run did
// not happen, and the status the store writes is 'void' (see voidRun), not
// 'voided'. Drafts are not runs that were paid either.
async function computePayrollRunsYtd() {
  const { listRuns } = require('../../../lib/payroll-store')
  const runs = await listRuns({ limit: 200 })
  if (!Array.isArray(runs)) return undefined
  const year = String(new Date().getFullYear())
  return runs.filter(
    (r) => typeof r?.payDate === 'string' && r.payDate.startsWith(year) && r.status === 'finalized'
  ).length
}

// Invoices created in the trailing 7 days, excluding drafts (open, paid,
// uncollectible, void all count — a draft is not yet an issued invoice).
// Source: Stripe invoices.list with a `created` floor, using the raw `stripe`
// client exported by lib/stripe.js (no existing helper lists all statuses —
// the module's only list helpers are paid-only / open-only / draft-only).
async function computeInvoicesIssuedWeek(since) {
  const { stripe } = require('../../../lib/stripe')
  let count = 0
  for await (const inv of stripe.invoices.list({ created: { gte: since }, limit: 100 })) {
    if (inv.status !== 'draft') count++
    if (count > 5000) break
  }
  return count > 5000 ? undefined : count
}

// Invoices paid in the trailing 7 days, from the shared paid-invoice list.
function computeInvoicesPaidWeek(invoices) {
  if (!Array.isArray(invoices)) return undefined
  return invoices.length
}

// Failed-card invoices recovered (paid) in the trailing 7 days, from the same
// shared paid-invoice list, filtered to invoices carrying a payfail_*_at
// metadata marker (written by lib/payment-resurrection.js markStage()) whose
// timestamp — an ISO string, per markStage — falls inside the same 7-day
// window. A paid invoice with an in-window marker proves it failed and was
// recovered within the window being reported.
function computeFailedCardsRecoveredWeek(invoices, since) {
  if (!Array.isArray(invoices)) return undefined
  const sinceMs = since * 1000
  const nowMs = Date.now()
  return invoices.filter((inv) =>
    Object.entries(inv.metadata || {}).some(([k, v]) => {
      if (!k.startsWith('payfail_') || !v) return false
      const ts = Date.parse(v)
      return Number.isFinite(ts) && ts >= sinceMs && ts <= nowMs
    })
  ).length
}

// remindersSent: omitted. notify-queue.js (lib/notify-queue.js) is a
// transient KV job queue (1h TTL on job blobs), not a durable sent-log; there
// is no reminders table. Not reliably computable over a 7-day window.

// messagesDrafted: omitted. lib/gemini.js draft helpers (used by
// pages/api/admin/ai-draft.js) are stateless request/response — the drafted
// text is returned to the caller and never persisted anywhere.

// routesGenerated: omitted. lib/route-plan.js getLatestRoutePlan() only
// exposes the single latest plan + its generatedAt; there is no persisted
// history/log of optimizer runs to count over a trailing window.

// followUpsCompleted / quotesSent: omitted. Both are logged as HubSpot notes
// on individual contacts (pages/api/admin/send-quote.js addNote 'QUOTE-SENT',
// pages/api/cron/quote-followup.js addNote 'QUOTE-PAID'/'QUOTE-LOST') but
// lib/hubspot.js only exposes per-contact note reads (getContactNotes /
// getClientNotes) — there is no cross-contact note search/count by prefix or
// date range, so a 7-day total is not reliably computable without an
// unbounded full-CRM scan.

async function computeProof() {
  const out = { generatedAt: new Date().toISOString() }

  const jobs = [
    ['activeRecurring', computeActiveRecurring],
    ['visits30d', computeVisits30d],
    ['medianDaysToPaid', computeMedianDaysToPaid],
    ['lastClose', computeLastClose],
    ['payrollRunsYtd', computePayrollRunsYtd],
  ]

  const since = Math.floor((Date.now() - 7 * DAY_MS) / 1000)
  const { listAllInvoicesSince } = require('../../../lib/stripe')
  let paidInvoicesWeek
  try {
    paidInvoicesWeek = await listAllInvoicesSince(since)
  } catch {
    paidInvoicesWeek = undefined
  }

  const weekJobs = [
    ['invoicesIssued', () => computeInvoicesIssuedWeek(since)],
    ['invoicesPaid', () => computeInvoicesPaidWeek(paidInvoicesWeek)],
    ['failedCardsRecovered', () => computeFailedCardsRecoveredWeek(paidInvoicesWeek, since)],
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

  const weekResults = await Promise.allSettled(
    weekJobs.map(async ([key, fn]) => {
      try {
        const value = await fn()
        return [key, value]
      } catch {
        return [key, undefined]
      }
    })
  )

  const week = {}
  for (const r of weekResults) {
    if (r.status === 'fulfilled' && r.value) {
      const [key, value] = r.value
      if (value !== undefined && value !== null) week[key] = value
    }
  }
  if (Object.keys(week).length) out.week = week

  // ownerOfficeHoursWeek: omitted. No persisted record of owner office-hours
  // scheduling/attendance exists anywhere in this repo (grepped lib/ and
  // pages/api for office-hours/owner-hours patterns, none found).

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
      body = await cached('ops:proof:v4', 86400, computeProof)
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
