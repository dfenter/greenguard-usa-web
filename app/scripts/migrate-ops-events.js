#!/usr/bin/env node
// ops_events schema migration. CREATE TABLE IF NOT EXISTS only, never drops.
//
// Durable, first-party record of what the automation actually did. Replaces
// reconstructing counts from the Gmail sent mailbox, which undercounts Resend
// fallback sends (they never touch the sent mailbox) and is stateless for
// drafts.
//
// Writers are both this portal (lib/ops-events.js) and the Python agent repo
// dfenter/greenguard-agent (db.py record_event), pointed at the same
// DATABASE_URL. Keep the column set in sync with that repo's init_db().
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const { q } = require('../lib/db')

const TABLES = [
  {
    name: 'ops_events',
    sql: `CREATE TABLE IF NOT EXISTS ops_events (
      id bigserial primary key,
      kind text not null,
      business_id text not null default 'greenguard',
      occurred_at timestamptz not null default now(),
      subject_ref text,
      details jsonb,
      created_at timestamptz not null default now()
    )`,
  },
  {
    // The only read pattern is "count events of these kinds since T for this
    // tenant", so index exactly that.
    name: 'ops_events_kind_occurred_idx',
    sql: `CREATE INDEX IF NOT EXISTS ops_events_kind_occurred_idx
          ON ops_events (business_id, kind, occurred_at DESC)`,
  },
  {
    // Idempotency for the at-least-once callers. The reminder and follow-up
    // jobs fire from two hosts (Mac launchd + Render cron) and Stripe redelivers
    // webhooks, so the same logical event can be recorded twice. A partial
    // unique index on (kind, subject_ref) lets recordEvent() use
    // ON CONFLICT DO NOTHING while still allowing rows that carry no
    // subject_ref at all (those are not dedupable by definition).
    name: 'ops_events_kind_subject_uniq',
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS ops_events_kind_subject_uniq
          ON ops_events (kind, subject_ref)
          WHERE subject_ref IS NOT NULL`,
  },
]

async function main() {
  for (const t of TABLES) {
    await q(t.sql)
    console.log(`created (or already existed): ${t.name}`)
  }
  console.log('ops_events migration complete')
  process.exit(0)
}

main().catch((err) => {
  console.error('ops_events migration failed:', err.message)
  process.exit(1)
})
