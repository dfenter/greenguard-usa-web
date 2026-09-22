// Automation event log: the first-party record of what the automation did.
//
// Why this exists: /api/ops/proof used to reconstruct its weekly figures by
// counting the Gmail sent mailbox. That undercounts every Resend fallback send
// (those never appear in the sent mailbox) and cannot see anything that was
// only drafted. This table is written at the moment the work happens, by
// whichever path actually did it, so the count is the truth rather than an
// inference.
//
// Writers: this portal, plus the Python agent (dfenter/greenguard-agent,
// db.py record_event) against the same DATABASE_URL. Schema lives in
// scripts/migrate-ops-events.js; keep both in sync.
//
// Hard rule for every caller: recording an event must NEVER break the thing it
// is recording. recordEvent() swallows all errors and returns a boolean. A lost
// log row is acceptable; a reminder that failed to send because the log was
// down is not.

const { q } = require('./db')

// The event kinds the proof endpoint knows how to count. Kept as a closed set
// so a typo in a caller shows up as a rejected write in the logs rather than as
// a silently uncountable row.
const KINDS = {
  REMINDER_SENT: 'reminder_sent',
  FOLLOWUP_SENT: 'followup_sent',
  ROUTE_EMAILED: 'route_emailed',
  INVOICE_ISSUED: 'invoice_issued',
  INVOICE_PAID: 'invoice_paid',
  FAILED_CARD_RECOVERED: 'failed_card_recovered',
  PAYROLL_RUN: 'payroll_run',
}

const VALID_KINDS = new Set(Object.values(KINDS))

function currentBusinessId() {
  return process.env.BUSINESS_ID || process.env.NEXT_PUBLIC_BUSINESS_ID || 'greenguard'
}

// Records one automation event.
//
// kind        one of KINDS
// subjectRef  stable identifier of the thing acted on (calendar event id,
//             Stripe invoice id, payroll run id, route day label). Used for
//             idempotency: a second write with the same (kind, subjectRef) is
//             dropped by the partial unique index, which is what makes the
//             twice-triggered cron jobs and Stripe webhook redeliveries safe.
//             Pass null only when no such identifier exists.
// occurredAt  when the work happened (defaults to now)
// details     small JSON blob: channel ('gmail' | 'resend' | 'sms'), counts,
//             anything useful for later auditing. Never PII beyond what the
//             row already implies.
//
// Returns true if a row was written, false if it was a duplicate or the write
// failed. Never throws.
async function recordEvent({ kind, subjectRef = null, occurredAt = null, details = null, businessId = null } = {}) {
  try {
    if (!VALID_KINDS.has(kind)) {
      console.error(`[ops-events] refusing to record unknown kind: ${String(kind)}`)
      return false
    }

    const when = occurredAt ? new Date(occurredAt) : new Date()
    if (!Number.isFinite(when.getTime())) {
      console.error(`[ops-events] invalid occurredAt for ${kind}: ${String(occurredAt)}`)
      return false
    }

    const result = await q(
      `INSERT INTO ops_events (kind, business_id, occurred_at, subject_ref, details)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (kind, subject_ref) WHERE subject_ref IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        kind,
        businessId || currentBusinessId(),
        when.toISOString(),
        subjectRef,
        details ? JSON.stringify(details) : null,
      ]
    )
    return (result?.rowCount || 0) > 0
  } catch (err) {
    // Deliberately swallowed. See the header note.
    console.error(`[ops-events] record failed (${String(kind)}):`, err?.message)
    return false
  }
}

// Counts events of one kind since a timestamp.
//
// since accepts a Date, an ISO string, or UNIX SECONDS (the proof endpoint
// works in seconds, so accepting them avoids an easy unit mistake at the call
// site).
//
// Returns a number, or undefined if the count could not be taken. undefined is
// meaningful to the caller: it means "no answer", which is what lets the proof
// endpoint fall back to the Gmail path instead of publishing a false zero.
async function countEventsSince(kind, since, { businessId = null } = {}) {
  try {
    if (!VALID_KINDS.has(kind)) return undefined

    const when = normalizeSince(since)
    if (!when) return undefined

    const result = await q(
      `SELECT COUNT(*)::int AS n
       FROM ops_events
       WHERE business_id = $1 AND kind = $2 AND occurred_at >= $3`,
      [businessId || currentBusinessId(), kind, when.toISOString()]
    )
    const n = result?.rows?.[0]?.n
    return Number.isFinite(n) ? n : undefined
  } catch (err) {
    console.error(`[ops-events] count failed (${String(kind)}):`, err?.message)
    return undefined
  }
}

// Counts every known kind since a timestamp in ONE query.
//
// The proof endpoint needs several kinds at once; issuing one round trip per
// kind against a Neon database that may be cold is wasteful. Returns an object
// keyed by kind (only kinds that have rows appear), or undefined if the query
// failed. An empty object means "table reachable, no rows in the window", which
// is exactly the condition that must trigger the Gmail fallback.
async function countAllEventsSince(since, { businessId = null } = {}) {
  try {
    const when = normalizeSince(since)
    if (!when) return undefined

    const result = await q(
      `SELECT kind, COUNT(*)::int AS n
       FROM ops_events
       WHERE business_id = $1 AND occurred_at >= $2
       GROUP BY kind`,
      [businessId || currentBusinessId(), when.toISOString()]
    )
    const out = {}
    for (const row of result?.rows || []) {
      if (VALID_KINDS.has(row.kind) && Number.isFinite(row.n)) out[row.kind] = row.n
    }
    return out
  } catch (err) {
    console.error('[ops-events] count-all failed:', err?.message)
    return undefined
  }
}

function normalizeSince(since) {
  if (since instanceof Date) return Number.isFinite(since.getTime()) ? since : null
  if (typeof since === 'number' && Number.isFinite(since)) {
    // Heuristic: a plain UNIX-seconds timestamp for any date this business
    // could have operated in is far below the millisecond range, so values
    // under ~1e11 are seconds.
    const ms = since < 1e11 ? since * 1000 : since
    const d = new Date(ms)
    return Number.isFinite(d.getTime()) ? d : null
  }
  if (typeof since === 'string') {
    const d = new Date(since)
    return Number.isFinite(d.getTime()) ? d : null
  }
  return null
}

module.exports = {
  KINDS,
  recordEvent,
  countEventsSince,
  countAllEventsSince,
}
