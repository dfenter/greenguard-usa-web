#!/usr/bin/env node
// One-shot migrator. Idempotent — re-run any time. Run with:
//   cd app && node _scripts/db-migrate.js
//
// Schema is intentionally small and tight. Each table maps to a real
// bookkeeping concept; no clever joins yet. Categories are stored both as
// rule and as denormalized label on the transaction so historical reads
// don't depend on rule survival.

require('dotenv').config({ path: '.env' })
const { q } = require('../lib/db')

const SQL = `
-- Categories: chart-of-accounts. label is the full dotted path
-- (Revenue:Biogents:Rental). type is the top-level bucket so we can
-- aggregate without parsing strings.
CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  label       TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL CHECK (type IN ('revenue','cogs','expense','asset','liability','equity','transfer','unknown')),
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rules: pattern-match transaction fields and assign a category. ordering
-- by priority DESC so specific rules beat broad ones.
CREATE TABLE IF NOT EXISTS category_rules (
  id          SERIAL PRIMARY KEY,
  match_kind  TEXT NOT NULL CHECK (match_kind IN ('sku','description_substring','stripe_type','vendor')),
  match_value TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  priority    INTEGER NOT NULL DEFAULT 100,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rules_match ON category_rules(match_kind, match_value);

-- Transactions: one row per Stripe charge/invoice/refund/payout, plus
-- manual entries. source/external_id are unique so re-ingesting is safe.
CREATE TABLE IF NOT EXISTS transactions (
  id              SERIAL PRIMARY KEY,
  source          TEXT NOT NULL,            -- 'stripe', 'manual', 'plaid', etc
  external_id     TEXT NOT NULL,            -- Stripe charge/invoice id, or 'manual-<uuid>'
  occurred_at     TIMESTAMPTZ NOT NULL,
  amount_cents    BIGINT NOT NULL,           -- signed: revenue positive, expenses negative
  currency        TEXT NOT NULL DEFAULT 'usd',
  type            TEXT NOT NULL,            -- 'charge', 'refund', 'fee', 'payout', 'invoice', 'manual'
  description     TEXT,
  customer_email  TEXT,
  customer_name   TEXT,
  sku             TEXT,                     -- if attributable to a SKU
  category_id     INTEGER REFERENCES categories(id),
  category_label  TEXT,                     -- denormalized for read speed + history
  raw             JSONB,                    -- full Stripe payload for forensics
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_tx_occurred ON transactions(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_tx_customer ON transactions(customer_email);
CREATE INDEX IF NOT EXISTS idx_tx_sku      ON transactions(sku);

-- Manual journal entries (cash purchases, owner contributions, etc.)
CREATE TABLE IF NOT EXISTS manual_entries (
  id           SERIAL PRIMARY KEY,
  occurred_at  TIMESTAMPTZ NOT NULL,
  amount_cents BIGINT NOT NULL,
  description  TEXT NOT NULL,
  category_id  INTEGER REFERENCES categories(id),
  receipt_url  TEXT,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mileage logs derived from route_plan_*.json files.
CREATE TABLE IF NOT EXISTS mileage_logs (
  id          SERIAL PRIMARY KEY,
  date        DATE NOT NULL UNIQUE,
  stops       INTEGER NOT NULL,
  miles       NUMERIC(8,2) NOT NULL,
  rate_cents  INTEGER NOT NULL,            -- IRS standard mileage rate × 100 (e.g. 67¢ = 67)
  source      TEXT NOT NULL DEFAULT 'route_plan',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cache of latest ingest run so the UI can show "last refreshed Xm ago".
CREATE TABLE IF NOT EXISTS ingest_runs (
  id          SERIAL PRIMARY KEY,
  source      TEXT NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  rows_added  INTEGER,
  ok          BOOLEAN,
  error       TEXT
);
CREATE INDEX IF NOT EXISTS idx_ingest_started ON ingest_runs(started_at DESC);

-- Per-appointment admin notes. Keyed by Google Calendar event ID since that's
-- our canonical event identifier across Cal.com + legacy Acuity bookings.
CREATE TABLE IF NOT EXISTS event_notes (
  id           SERIAL PRIMARY KEY,
  event_id     TEXT NOT NULL,
  customer_email TEXT,
  author_email TEXT NOT NULL,
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_notes_event ON event_notes(event_id, created_at DESC);

-- Appointments the owner marked as not needing an invoice (free follow-ups,
-- warranty visits, etc). Matched in pending-invoices by cal_booking_uid when
-- present, else by customer_email + service_date, else customer_name + date
-- for legacy events with no email.
CREATE TABLE IF NOT EXISTS dismissed_appointments (
  id               SERIAL PRIMARY KEY,
  cal_booking_uid  TEXT,
  customer_email   TEXT,
  customer_name    TEXT,
  service_date     TEXT NOT NULL,
  dismissed_by     TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dismissed_appt_date ON dismissed_appointments(service_date);
`

const SEED_CATEGORIES = [
  // Revenue
  ['Revenue:Biogents:Rental',         'revenue',  'BG1/BG2/BG3 monthly trap rental'],
  ['Revenue:Mosqitter:Rental',        'revenue',  'Mosqitter Grand monthly rental'],
  ['Revenue:Mosqitter:Install',       'revenue',  'Mosqitter installation fees'],
  ['Revenue:Mosqitter:Service',       'revenue',  'Mosqitter service-call fees'],
  ['Revenue:Mosqitter:Troubleshoot',  'revenue',  'Mosqitter troubleshooting'],
  ['Revenue:Tanks:Refill',            'revenue',  'CO2 tank refill per-tank'],
  ['Revenue:Tanks:DeliveryFee',       'revenue',  'CO2 tank delivery fee'],
  ['Revenue:Tanks:HookupMaint',       'revenue',  'CO2 tank hookup & maintenance'],
  ['Revenue:Tanks:Rental',            'revenue',  'CO2-ADDON monthly tank rental'],
  ['Revenue:Barrier',                 'revenue',  'Barrier treatment service'],
  ['Revenue:Addons:Bait',             'revenue',  'BAIT / BG-SWEETSCENT'],
  ['Revenue:Addons:Other',            'revenue',  'Misc paid addons'],
  ['Revenue:Equipment:Install',       'revenue',  'Trap/timer install fees'],
  ['Revenue:Equipment:Sale',          'revenue',  'Sale of physical equipment'],
  ['Revenue:Other',                   'revenue',  'Catch-all revenue'],
  // COGS / expenses
  ['COGS:CO2',                        'cogs',     'CO2 gas refill from supplier'],
  ['COGS:Chemicals',                  'cogs',     'Barrier chemicals, bait packs'],
  ['COGS:Equipment',                  'cogs',     'Traps, timers, parts'],
  ['Expense:PaymentProcessing',       'expense',  'Stripe + other gateway fees'],
  ['Expense:Software',                'expense',  'SaaS: Cal.com, Resend, Vercel, etc.'],
  ['Expense:Marketing',               'expense',  'Ads, listings, marketing'],
  ['Expense:Fuel',                    'expense',  'Vehicle fuel'],
  ['Expense:Mileage',                 'expense',  'IRS-rate mileage deduction'],
  ['Expense:Insurance',               'expense',  'Liability, vehicle, etc.'],
  ['Expense:Office',                  'expense',  'Office supplies, dues'],
  ['Expense:Legal',                   'expense',  'Legal + professional services'],
  ['Expense:Other',                   'expense',  'Catch-all expense'],
  // Transfers / equity
  ['Transfer:Payout',                 'transfer', 'Stripe → bank payouts'],
  ['Equity:OwnerDraw',                'equity',   'Owner distributions'],
  ['Equity:OwnerContribution',        'equity',   'Owner contributions in'],
  ['Unknown',                         'unknown',  'Needs manual categorization'],
]

// SKU → category rules (priority 1000 — very specific).
const SKU_RULES = [
  ['BG1', 'Revenue:Biogents:Rental'],
  ['BG2', 'Revenue:Biogents:Rental'],
  ['BG3', 'Revenue:Biogents:Rental'],
  ['MQ-RENT', 'Revenue:Mosqitter:Rental'],
  ['MQ-SVC',  'Revenue:Mosqitter:Service'],
  ['MQ-INST', 'Revenue:Mosqitter:Install'],
  ['MQ-TSHOOT', 'Revenue:Mosqitter:Troubleshoot'],
  ['TANK-REFILL', 'Revenue:Tanks:Refill'],
  ['TANK-DELIVERY-FEE', 'Revenue:Tanks:DeliveryFee'],
  ['TANK-HOOKUP-MAINT', 'Revenue:Tanks:HookupMaint'],
  ['CO2-ADDON', 'Revenue:Tanks:Rental'],
  ['BARRIER', 'Revenue:Barrier'],
  ['BAIT', 'Revenue:Addons:Bait'],
  ['BG-SWEETSCENT', 'Revenue:Addons:Bait'],
  ['TANK-STRAPS', 'Revenue:Addons:Other'],
  ['WKD-SURCH', 'Revenue:Addons:Other'],
  ['TRAP-INSTALL', 'Revenue:Equipment:Install'],
  ['TIMER-INSTALL', 'Revenue:Equipment:Install'],
  ['TRAP-MAINT-1', 'Revenue:Equipment:Install'],
  ['TRAP-MAINT-2', 'Revenue:Equipment:Install'],
  ['OWN-BG', 'Revenue:Equipment:Install'],
  ['OWN-MQ', 'Revenue:Equipment:Install'],
  ['TANK1', 'Revenue:Tanks:Refill'],
  ['TANK2', 'Revenue:Tanks:Refill'],
  ['TANK3', 'Revenue:Tanks:Refill'],
  ['TANK4', 'Revenue:Tanks:Refill'],
  ['TANK6', 'Revenue:Tanks:Refill'],
  ['TANK10', 'Revenue:Tanks:Refill'],
]

// Stripe-type rules (priority 500 — broad).
const TYPE_RULES = [
  ['fee', 'Expense:PaymentProcessing'],
  ['payout', 'Transfer:Payout'],
  ['refund', 'Revenue:Other'],   // Negative amount handled at write time
]

async function main() {
  console.log('Running schema…')
  await q(SQL)
  console.log('Seeding categories…')
  for (const [label, type, desc] of SEED_CATEGORIES) {
    await q(`INSERT INTO categories (label, type, description) VALUES ($1,$2,$3)
             ON CONFLICT (label) DO NOTHING`, [label, type, desc])
  }
  // Map labels → ids
  const { rows } = await q('SELECT id, label FROM categories')
  const idByLabel = Object.fromEntries(rows.map((r) => [r.label, r.id]))

  console.log('Seeding rules…')
  for (const [sku, label] of SKU_RULES) {
    await q(`INSERT INTO category_rules (match_kind, match_value, category_id, priority)
             SELECT 'sku', $1, $2, 1000
             WHERE NOT EXISTS (SELECT 1 FROM category_rules WHERE match_kind='sku' AND match_value=$1)`,
            [sku, idByLabel[label]])
  }
  for (const [type, label] of TYPE_RULES) {
    await q(`INSERT INTO category_rules (match_kind, match_value, category_id, priority)
             SELECT 'stripe_type', $1, $2, 500
             WHERE NOT EXISTS (SELECT 1 FROM category_rules WHERE match_kind='stripe_type' AND match_value=$1)`,
            [type, idByLabel[label]])
  }

  const counts = await q(`SELECT
    (SELECT COUNT(*) FROM categories) cats,
    (SELECT COUNT(*) FROM category_rules) rules,
    (SELECT COUNT(*) FROM transactions) txs`)
  console.log('done.', counts.rows[0])
  process.exit(0)
}

main().catch((e) => { console.error('migration failed:', e); process.exit(1) })
