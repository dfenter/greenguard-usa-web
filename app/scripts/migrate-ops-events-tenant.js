#!/usr/bin/env node
// ops_events multi-tenant key migration. Additive: creates indexes with
// IF NOT EXISTS, never drops a table or a column.
//
// The original schema (scripts/migrate-ops-events.js) deduped on
// (kind, subject_ref). That key is wrong the moment a second tenant writes to
// the same table: two businesses both record route_emailed with subject_ref
// 'Mon Sep 22', and the second write is silently dropped as a duplicate of the
// first. The idempotency key has to include the tenant.
//
// This migration:
//   1. creates the unique index on (business_id, kind, subject_ref)
//      WHERE subject_ref IS NOT NULL
//   2. drops the old (kind, subject_ref) index, which is now a cross-tenant
//      collision rather than a safety net
//   3. creates the tenant-first read index
//
// The DROP is guarded with IF EXISTS and is safe here because the table is
// near-empty (shipped 2026-09-22) and single-tenant, so no existing row can
// violate the wider key. If that ever stops being true, create the new index
// first, verify it, and only then drop.
//
// Keep in sync with lib/ops-events.js (ON CONFLICT target) and the Python agent
// repo dfenter/greenguard-agent db.py init_db().
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const { q } = require('../lib/db')

const STEPS = [
  {
    // New idempotency key. Same partial predicate as before: rows with no
    // subject_ref are not dedupable by definition and stay exempt.
    name: 'ops_events_tenant_kind_subject_uniq (create)',
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS ops_events_tenant_kind_subject_uniq
          ON ops_events (business_id, kind, subject_ref)
          WHERE subject_ref IS NOT NULL`,
  },
  {
    // Old single-tenant key. Dropped only after the replacement above exists.
    name: 'ops_events_kind_subject_uniq (drop)',
    sql: `DROP INDEX IF EXISTS ops_events_kind_subject_uniq`,
  },
  {
    // Read pattern: count events of a kind since T for one tenant.
    name: 'ops_events_tenant_kind_occurred_idx (create)',
    sql: `CREATE INDEX IF NOT EXISTS ops_events_tenant_kind_occurred_idx
          ON ops_events (business_id, kind, occurred_at DESC)`,
  },
]

async function main() {
  for (const step of STEPS) {
    await q(step.sql)
    console.log(`ok: ${step.name}`)
  }
  console.log('ops_events tenant migration complete')
  process.exit(0)
}

main().catch((err) => {
  console.error('ops_events tenant migration failed:', err.message)
  process.exit(1)
})
