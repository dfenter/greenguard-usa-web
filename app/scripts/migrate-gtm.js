#!/usr/bin/env node
// GTM portal schema migration — CREATE TABLE IF NOT EXISTS only. Never drops.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const { q } = require('../lib/db')

const TABLES = [
  {
    name: 'gtm_targets_state',
    sql: `CREATE TABLE IF NOT EXISTS gtm_targets_state (
      firm text primary key,
      vertical text,
      approved boolean default false,
      approved_by text,
      approved_at timestamptz,
      dan_notes text,
      status text,
      updated_at timestamptz default now()
    )`,
  },
  {
    name: 'gtm_scores',
    sql: `CREATE TABLE IF NOT EXISTS gtm_scores (
      firm text,
      email text,
      s1 int, s2 int, s3 int, s4 int, s5 int, s6 int, s7 int,
      total int,
      tier text,
      updated_at timestamptz default now(),
      primary key (firm, email)
    )`,
  },
  {
    name: 'gtm_deals',
    sql: `CREATE TABLE IF NOT EXISTS gtm_deals (
      firm text primary key,
      stage text,
      next_action text,
      next_date date,
      blockers text,
      target_date date,
      owner text,
      updated_at timestamptz default now()
    )`,
  },
  {
    name: 'gtm_touches',
    sql: `CREATE TABLE IF NOT EXISTS gtm_touches (
      id serial primary key,
      firm text,
      person text,
      touch int,
      channel text,
      sent_at timestamptz default now(),
      reply boolean default false,
      notes text
    )`,
  },
  {
    name: 'gtm_progress',
    sql: `CREATE TABLE IF NOT EXISTS gtm_progress (
      email text,
      item_id text,
      done boolean default false,
      done_at timestamptz,
      primary key (email, item_id)
    )`,
  },
  {
    name: 'gtm_settings',
    sql: `CREATE TABLE IF NOT EXISTS gtm_settings (
      key text primary key,
      value text,
      updated_at timestamptz default now()
    )`,
  },
  {
    name: 'gtm_call_reports',
    sql: `CREATE TABLE IF NOT EXISTS gtm_call_reports (
      id serial primary key,
      firm text,
      email text,
      contact_email text,
      payload jsonb,
      hubspot_contact_id text,
      hubspot_note_id text,
      hubspot_deal_id text,
      created_at timestamptz default now()
    )`,
  },
  {
    name: 'gtm_call_reports_add_deal_id',
    sql: `ALTER TABLE gtm_call_reports ADD COLUMN IF NOT EXISTS hubspot_deal_id text`,
  },
  {
    name: 'gtm_targets_state_add_product',
    sql: `ALTER TABLE gtm_targets_state ADD COLUMN IF NOT EXISTS product text NOT NULL DEFAULT 'sparkbridge'`,
  },
  {
    name: 'gtm_targets_state_product_firm_idx',
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS gtm_targets_state_product_firm_idx ON gtm_targets_state (product, firm)`,
  },
  {
    name: 'gtm_scores_add_product',
    sql: `ALTER TABLE gtm_scores ADD COLUMN IF NOT EXISTS product text NOT NULL DEFAULT 'sparkbridge'`,
  },
  {
    // gtm_scores' PK is (firm, email), which does not include product, so an
    // OPS score for a firm name that also exists in the SparkBridge list would
    // conflict onto the SparkBridge row and overwrite it. The score fields mean
    // different things per product, so this index is what makes the upsert in
    // targets/score.js able to key on (product, firm, email).
    name: 'gtm_scores_product_firm_email_idx',
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS gtm_scores_product_firm_email_idx ON gtm_scores (product, firm, email)`,
  },
  {
    // The index above is not sufficient on its own: the original PK
    // (firm, email) still forbids a second row for the same firm under a
    // different product, so scoring an OPS firm that shares a name with a
    // SparkBridge one would fail outright. Widen the PK to include product.
    // Guarded and non-destructive: it only fires when the narrow PK is still
    // in place, and rows keep their identity because every legacy row was
    // backfilled to product 'sparkbridge'.
    name: 'gtm_scores_pk_widen_to_product',
    sql: `DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'gtm_scores'::regclass AND contype = 'p'
            AND pg_get_constraintdef(oid) = 'PRIMARY KEY (firm, email)'
        ) THEN
          ALTER TABLE gtm_scores DROP CONSTRAINT gtm_scores_pkey;
          ALTER TABLE gtm_scores ADD CONSTRAINT gtm_scores_pkey PRIMARY KEY (product, firm, email);
        END IF;
      END $$`,
  },
  {
    name: 'gtm_deals_add_product',
    sql: `ALTER TABLE gtm_deals ADD COLUMN IF NOT EXISTS product text NOT NULL DEFAULT 'sparkbridge'`,
  },
  {
    name: 'gtm_deals_product_firm_idx',
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS gtm_deals_product_firm_idx ON gtm_deals (product, firm)`,
  },
  {
    name: 'gtm_touches_add_product',
    sql: `ALTER TABLE gtm_touches ADD COLUMN IF NOT EXISTS product text NOT NULL DEFAULT 'sparkbridge'`,
  },
  {
    name: 'gtm_progress_add_product',
    sql: `ALTER TABLE gtm_progress ADD COLUMN IF NOT EXISTS product text NOT NULL DEFAULT 'sparkbridge'`,
  },
  {
    // Same shape as gtm_scores: the PK (email, item_id) has no product, and the
    // two checklists are numbered independently, so their item ids collide by
    // construction. Without this index a tick on an OPS item would flip the
    // SparkBridge row with the same item id.
    name: 'gtm_progress_product_email_item_idx',
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS gtm_progress_product_email_item_idx ON gtm_progress (product, email, item_id)`,
  },
  {
    // Same reasoning as gtm_scores_pk_widen_to_product above.
    name: 'gtm_progress_pk_widen_to_product',
    sql: `DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'gtm_progress'::regclass AND contype = 'p'
            AND pg_get_constraintdef(oid) = 'PRIMARY KEY (email, item_id)'
        ) THEN
          ALTER TABLE gtm_progress DROP CONSTRAINT gtm_progress_pkey;
          ALTER TABLE gtm_progress ADD CONSTRAINT gtm_progress_pkey PRIMARY KEY (product, email, item_id);
        END IF;
      END $$`,
  },
  {
    name: 'gtm_call_reports_add_product',
    sql: `ALTER TABLE gtm_call_reports ADD COLUMN IF NOT EXISTS product text NOT NULL DEFAULT 'sparkbridge'`,
  },
  {
    name: 'gtm_library_rows_add_product',
    sql: `ALTER TABLE gtm_library_rows ADD COLUMN IF NOT EXISTS product text NOT NULL DEFAULT 'sparkbridge'`,
  },
  {
    name: 'gtm_weekly_reports_add_product',
    sql: `ALTER TABLE gtm_weekly_reports ADD COLUMN IF NOT EXISTS product text NOT NULL DEFAULT 'sparkbridge'`,
  },
  {
    name: 'gtm_settings_add_product',
    sql: `ALTER TABLE gtm_settings ADD COLUMN IF NOT EXISTS product text NOT NULL DEFAULT 'sparkbridge'`,
  },
  {
    name: 'gtm_library_rows',
    sql: `CREATE TABLE IF NOT EXISTS gtm_library_rows (
      id serial primary key,
      kind text,
      data jsonb,
      created_by text,
      created_at timestamptz default now()
    )`,
  },
  {
    name: 'gtm_weekly_reports',
    sql: `CREATE TABLE IF NOT EXISTS gtm_weekly_reports (
      id serial primary key,
      week_start date,
      email text,
      payload jsonb,
      created_at timestamptz default now()
    )`,
  },
]

async function main() {
  for (const t of TABLES) {
    await q(t.sql)
    console.log(`created (or already existed): ${t.name}`)
  }
  console.log('gtm migration complete')
  process.exit(0)
}

main().catch((err) => {
  console.error('gtm migration failed:', err.message)
  process.exit(1)
})
