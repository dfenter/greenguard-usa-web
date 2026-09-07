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
