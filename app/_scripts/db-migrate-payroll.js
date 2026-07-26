#!/usr/bin/env node
// Payroll + timesheet schema. Idempotent — re-run any time. Run with:
//   cd app && node _scripts/db-migrate-payroll.js
//
// Kept separate from db-migrate.js (bookkeeping) so a payroll change never
// re-seeds the chart of accounts, but the two share the same database.
//
// Design notes:
//  - Employees are keyed by portal login email so a timesheet row can be
//    attributed from the session with no extra mapping table.
//  - Timesheet entries move open → submitted → approved → paid. Only
//    'approved' entries are eligible for a payroll run; finalizing a run
//    stamps payroll_run_id and flips them to 'paid', which is what makes
//    double-paying a week impossible.
//  - payroll_items stores the FULL computed paystub (every component, plus
//    the YTD snapshot used for wage-base caps). Historical stubs must never
//    change when a rate or a tax table changes, so nothing here is derived
//    at read time.

require('dotenv').config({ path: '.env' })
const { q } = require('../lib/db')

const SQL = `
-- Employees / crew. One row per person paid through the portal.
CREATE TABLE IF NOT EXISTS employees (
  id                SERIAL PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,          -- portal login email
  name              TEXT NOT NULL,
  phone             TEXT,
  classification    TEXT NOT NULL DEFAULT 'employee'
                      CHECK (classification IN ('employee','contractor')),
  pay_type          TEXT NOT NULL DEFAULT 'hourly'
                      CHECK (pay_type IN ('hourly','salary')),
  pay_frequency     TEXT NOT NULL DEFAULT 'biweekly'
                      CHECK (pay_frequency IN ('weekly','biweekly','semimonthly','monthly')),
  hourly_rate_cents INTEGER NOT NULL DEFAULT 0 CHECK (hourly_rate_cents >= 0),
  salary_annual_cents BIGINT NOT NULL DEFAULT 0 CHECK (salary_annual_cents >= 0),
  per_stop_cents    INTEGER NOT NULL DEFAULT 0 CHECK (per_stop_cents >= 0),
  mileage_rate_cents INTEGER NOT NULL DEFAULT 0 CHECK (mileage_rate_cents >= 0),
  ot_eligible       BOOLEAN NOT NULL DEFAULT TRUE,
  -- FLSA exempt is its OWN flag: "salaried" does not mean exempt, and a
  -- service technician fails the duties test at any salary.
  exempt            BOOLEAN NOT NULL DEFAULT FALSE,
  ot_threshold_hours NUMERIC(5,2) NOT NULL DEFAULT 40 CHECK (ot_threshold_hours > 0 AND ot_threshold_hours <= 40),
  -- Form W-4 inputs (2020+ form). Amounts in cents.
  filing_status     TEXT NOT NULL DEFAULT 'single'
                      CHECK (filing_status IN ('single','married','head')),
  w4_multiple_jobs  BOOLEAN NOT NULL DEFAULT FALSE,
  w4_dependents_credit_cents BIGINT NOT NULL DEFAULT 0,
  w4_other_income_cents      BIGINT NOT NULL DEFAULT 0,
  w4_deductions_cents        BIGINT NOT NULL DEFAULT 0,
  w4_extra_withholding_cents BIGINT NOT NULL DEFAULT 0,
  fed_withholding_mode TEXT NOT NULL DEFAULT 'table'
                      CHECK (fed_withholding_mode IN ('table','flat','none')),
  fed_flat_pct      NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (fed_flat_pct >= 0 AND fed_flat_pct <= 100),
  suta_rate         NUMERIC(6,4) CHECK (suta_rate IS NULL OR (suta_rate >= 0 AND suta_rate <= 0.2)),  -- NULL ⇒ business default
  hired_on          DATE,
  terminated_on     DATE,
  CHECK (terminated_on IS NULL OR hired_on IS NULL OR terminated_on >= hired_on),
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(active, name);

-- Payroll runs: one pay period, one pay date, N employees.
CREATE TABLE IF NOT EXISTS payroll_runs (
  id            SERIAL PRIMARY KEY,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  pay_date      DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','finalized','void')),
  tax_year      INTEGER NOT NULL,
  week_start_day SMALLINT NOT NULL DEFAULT 0,      -- 0 = Sunday
  gross_cents        BIGINT NOT NULL DEFAULT 0,
  employee_tax_cents BIGINT NOT NULL DEFAULT 0,
  employer_tax_cents BIGINT NOT NULL DEFAULT 0,
  net_cents          BIGINT NOT NULL DEFAULT 0,
  reimbursement_cents BIGINT NOT NULL DEFAULT 0,
  notes         TEXT,
  created_by    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at  TIMESTAMPTZ,
  finalized_by  TEXT,
  voided_at     TIMESTAMPTZ,
  voided_by     TEXT,
  posted_to_books BOOLEAN NOT NULL DEFAULT FALSE,
  CHECK (period_end >= period_start),
  -- Withholding tables and every wage base key off the pay date's year.
  CHECK (tax_year = EXTRACT(YEAR FROM pay_date)),
  CHECK (pay_date >= period_end),
  CHECK (week_start_day BETWEEN 0 AND 6)
);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_period ON payroll_runs(period_end DESC);
-- At most one live (non-void) run per exact period. Voided runs stay for audit.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_payroll_run_live_period
  ON payroll_runs(period_start, period_end) WHERE status <> 'void';

-- Timesheet entries. One row per employee per work date (clock or manual).
CREATE TABLE IF NOT EXISTS timesheet_entries (
  id              SERIAL PRIMARY KEY,
  employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  work_date       DATE NOT NULL,
  clock_in        TIMESTAMPTZ,
  clock_out       TIMESTAMPTZ,
  hours           NUMERIC(6,2) CHECK (hours IS NULL OR (hours >= 0 AND hours <= 24)),
  break_minutes   INTEGER NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
  stops           INTEGER NOT NULL DEFAULT 0 CHECK (stops >= 0),
  miles           NUMERIC(8,1) NOT NULL DEFAULT 0 CHECK (miles >= 0),
  notes           TEXT,
  source          TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('clock','manual')),
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','submitted','approved','paid')),
  payroll_run_id  INTEGER REFERENCES payroll_runs(id),
  submitted_at    TIMESTAMPTZ,
  approved_at     TIMESTAMPTZ,
  approved_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Either a clock pair or manual hours must eventually exist; an open
  -- clocked-in row legitimately has neither yet, so this is deliberately loose.
  CHECK (clock_out IS NULL OR clock_in IS NOT NULL),
  CHECK (clock_out IS NULL OR clock_out > clock_in)
);
CREATE INDEX IF NOT EXISTS idx_ts_emp_date ON timesheet_entries(employee_id, work_date DESC);
CREATE INDEX IF NOT EXISTS idx_ts_status   ON timesheet_entries(status, work_date DESC);
CREATE INDEX IF NOT EXISTS idx_ts_run      ON timesheet_entries(payroll_run_id);
-- One entry per employee per day keeps "today's hours" unambiguous and makes
-- the clock-in endpoint safely idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ts_emp_day ON timesheet_entries(employee_id, work_date);
-- At most one open clock (clocked in, not out) per employee.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ts_open_clock
  ON timesheet_entries(employee_id) WHERE clock_in IS NOT NULL AND clock_out IS NULL;

-- Computed paystubs. Immutable once its run is finalized.
CREATE TABLE IF NOT EXISTS payroll_items (
  id              SERIAL PRIMARY KEY,
  -- RESTRICT, not CASCADE: paystubs must survive 4 years (Reg. 31.6001-1).
  run_id          INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE RESTRICT,
  employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  employee_name   TEXT NOT NULL,                  -- snapshot: stubs outlive renames
  classification  TEXT NOT NULL,
  pay_frequency   TEXT NOT NULL,
  hourly_rate_cents INTEGER NOT NULL DEFAULT 0,   -- snapshot of the rate paid
  salary_annual_cents BIGINT NOT NULL DEFAULT 0,  -- snapshot of the salary basis
  regular_hours   NUMERIC(7,2) NOT NULL DEFAULT 0,
  ot_hours        NUMERIC(7,2) NOT NULL DEFAULT 0,
  stops           INTEGER NOT NULL DEFAULT 0,
  miles           NUMERIC(8,1) NOT NULL DEFAULT 0,
  base_pay_cents      BIGINT NOT NULL DEFAULT 0,
  piece_pay_cents     BIGINT NOT NULL DEFAULT 0,
  makeup_pay_cents    BIGINT NOT NULL DEFAULT 0,   -- minimum-wage top-up
  mileage_excess_cents BIGINT NOT NULL DEFAULT 0,  -- mileage above the IRS rate (taxable)
  ot_premium_cents    BIGINT NOT NULL DEFAULT 0,
  bonus_cents         BIGINT NOT NULL DEFAULT 0,
  reimbursement_cents BIGINT NOT NULL DEFAULT 0,          -- mileage (non-taxable)
  expense_reimbursement_cents BIGINT NOT NULL DEFAULT 0,  -- receipts (non-taxable)
  taxable_gross_cents BIGINT NOT NULL DEFAULT 0,
  gross_cents         BIGINT NOT NULL DEFAULT 0,
  fed_income_tax_cents        BIGINT NOT NULL DEFAULT 0,
  employee_ss_cents           BIGINT NOT NULL DEFAULT 0,
  employee_medicare_cents     BIGINT NOT NULL DEFAULT 0,
  employee_addl_medicare_cents BIGINT NOT NULL DEFAULT 0,
  employer_ss_cents           BIGINT NOT NULL DEFAULT 0,
  employer_medicare_cents     BIGINT NOT NULL DEFAULT 0,
  employer_futa_cents         BIGINT NOT NULL DEFAULT 0,
  employer_suta_cents         BIGINT NOT NULL DEFAULT 0,
  ss_wages_cents      BIGINT NOT NULL DEFAULT 0,
  futa_wages_cents    BIGINT NOT NULL DEFAULT 0,
  suta_wages_cents    BIGINT NOT NULL DEFAULT 0,
  other_deduction_cents BIGINT NOT NULL DEFAULT 0,
  other_deduction_label TEXT,
  employee_tax_cents  BIGINT NOT NULL DEFAULT 0,
  employer_tax_cents  BIGINT NOT NULL DEFAULT 0,
  net_cents           BIGINT NOT NULL DEFAULT 0 CHECK (net_cents >= 0),
  ytd_snapshot    JSONB NOT NULL DEFAULT '{}'::jsonb,                          -- YTD-before values used for caps
  detail          JSONB,                          -- per-workweek breakdown
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_pi_employee ON payroll_items(employee_id);

-- Expense claims / receipts. One row per receipt.
--
-- Two shapes of expense live here:
--   payment_method = 'personal' → the crew paid out of pocket; approving it
--     books the expense AND queues a non-taxable reimbursement on the next
--     payroll run (accountable plan, Pub 463 — not wages).
--   payment_method = 'company'  → paid on a company card; approving it only
--     books the expense. Nothing is owed back, so it never touches payroll.
CREATE TABLE IF NOT EXISTS expense_claims (
  id              SERIAL PRIMARY KEY,
  employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  incurred_on     DATE NOT NULL,
  amount_cents    BIGINT NOT NULL CHECK (amount_cents > 0),
  vendor          TEXT,
  description     TEXT NOT NULL,
  category_label  TEXT NOT NULL,                  -- books chart-of-accounts label
  category_id     INTEGER REFERENCES categories(id),
  payment_method  TEXT NOT NULL DEFAULT 'personal'
                    CHECK (payment_method IN ('personal','company')),
  receipt_url     TEXT,
  receipt_mime    TEXT,
  receipt_bytes   INTEGER,
  notes           TEXT,                           -- owner-side note
  status          TEXT NOT NULL DEFAULT 'submitted'
                    CHECK (status IN ('submitted','approved','rejected','paid','recorded')),
  rejected_reason TEXT,
  payroll_run_id  INTEGER REFERENCES payroll_runs(id),
  posted_to_books BOOLEAN NOT NULL DEFAULT FALSE,
  approved_at     TIMESTAMPTZ,
  approved_by     TEXT,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A company-card expense is never reimbursed, so it must never be attached
  -- to a payroll run.
  CHECK (payment_method = 'personal' OR payroll_run_id IS NULL),
  CHECK (status <> 'rejected' OR payroll_run_id IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_exp_emp   ON expense_claims(employee_id, incurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_exp_status ON expense_claims(status, incurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_exp_run   ON expense_claims(payroll_run_id);

-- Business-level payroll settings (single row, id = 1).
CREATE TABLE IF NOT EXISTS payroll_settings (
  id                SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  legal_name        TEXT,
  ein               TEXT,
  address           TEXT,
  suta_rate         NUMERIC(6,4) NOT NULL DEFAULT 0.0270 CHECK (suta_rate >= 0 AND suta_rate <= 0.2),
  twc_account       TEXT,
  week_start_day    SMALLINT NOT NULL DEFAULT 0 CHECK (week_start_day BETWEEN 0 AND 6),
  default_pay_frequency TEXT NOT NULL DEFAULT 'biweekly'
                      CHECK (default_pay_frequency IN ('weekly','biweekly','semimonthly','monthly')),
  mileage_rate_cents INTEGER NOT NULL DEFAULT 70 CHECK (mileage_rate_cents >= 0),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`

// Payroll chart-of-accounts additions (books integration).
const PAYROLL_CATEGORIES = [
  ['Expense:Payroll:Wages',         'expense', 'Gross wages paid to employees'],
  ['Expense:Payroll:EmployerTaxes', 'expense', 'Employer FICA + FUTA + TX SUTA'],
  ['Expense:Payroll:Contractors',   'expense', '1099 contractor payments'],
  ['Expense:Payroll:Reimbursement', 'expense', 'Accountable-plan mileage/expense reimbursements'],
  ['Liability:PayrollTaxes',        'liability', 'Withheld + employer taxes owed to IRS/TWC'],
  // Common field-expense buckets so the receipt form has sane choices.
  ['Expense:Tools',                 'expense',  'Hand tools, small equipment'],
  ['Expense:Supplies',              'expense',  'Shop and truck supplies'],
  ['Expense:VehicleMaint',          'expense',  'Vehicle maintenance and repairs'],
  ['Expense:Meals',                 'expense',  'Meals (50% deductible — tag carefully)'],
  ['Expense:Parking',               'expense',  'Parking, tolls, gate fees'],
]

async function main() {
  console.log('Running payroll schema…')
  await q(SQL)

  // Backfill for databases created before a column existed. Each ALTER is
  // IF NOT EXISTS so this stays idempotent.
  const ADDITIVE = [
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS suta_rate NUMERIC(6,4)`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS exempt BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS posted_to_books BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS makeup_pay_cents BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS mileage_excess_cents BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS salary_annual_cents BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS expense_reimbursement_cents BIGINT NOT NULL DEFAULT 0`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS fww BOOLEAN NOT NULL DEFAULT FALSE`,
    // Finalizing only computes and records the run; the money still has to be
    // sent by hand. These track that separately so "paid" is never a guess.
    `ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS payments_sent_at TIMESTAMPTZ`,
    `ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS payments_sent_by TEXT`,
    `ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS taxes_deposited_at TIMESTAMPTZ`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary_hours_per_week NUMERIC(5,2) NOT NULL DEFAULT 40`,
    // One claim per uploaded photo: the application checks first, but only a
    // constraint stops two concurrent submissions of the same receipt.
    `CREATE UNIQUE INDEX IF NOT EXISTS uniq_expense_receipt_url
       ON expense_claims(employee_id, receipt_url)
       WHERE receipt_url IS NOT NULL AND status <> 'rejected'`,
  ]
  for (const sql of ADDITIVE) await q(sql)

  // Paystub retention: an earlier version of this table created run_id with
  // ON DELETE CASCADE, which would delete tax records with their run.
  const fk = await q(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
                      WHERE conrelid = 'payroll_items'::regclass AND conname = 'payroll_items_run_id_fkey'`)
  if (/ON DELETE CASCADE/i.test(fk.rows[0]?.def || '')) {
    console.log('Converting payroll_items.run_id FK to ON DELETE RESTRICT…')
    await q(`ALTER TABLE payroll_items DROP CONSTRAINT payroll_items_run_id_fkey`)
    await q(`ALTER TABLE payroll_items ADD CONSTRAINT payroll_items_run_id_fkey
             FOREIGN KEY (run_id) REFERENCES payroll_runs(id) ON DELETE RESTRICT`)
  }

  // A finalized stub is a tax record — freeze it. (Voiding a run marks the
  // RUN void; the stub itself never changes.)
  console.log('Installing immutability trigger…')
  await q(`
    CREATE OR REPLACE FUNCTION payroll_items_freeze() RETURNS trigger AS $$
    BEGIN
      -- Maintenance escape hatch: a session that has explicitly opted in
      -- (SET payroll.allow_purge = 'on') may remove history. Used only by
      -- _scripts/payroll-selftest.js to clean up after itself.
      IF COALESCE(current_setting('payroll.allow_purge', true), '') = 'on' THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
      END IF;
      IF TG_OP = 'UPDATE' AND NEW.run_id <> OLD.run_id THEN
        RAISE EXCEPTION 'a paystub cannot be moved between payroll runs';
      END IF;
      IF TG_OP = 'INSERT' THEN
        IF EXISTS (SELECT 1 FROM payroll_runs r WHERE r.id = NEW.run_id AND r.status <> 'draft') THEN
          RAISE EXCEPTION 'cannot add a paystub to a % run', (SELECT status FROM payroll_runs WHERE id = NEW.run_id);
        END IF;
        RETURN NEW;
      END IF;
      IF EXISTS (SELECT 1 FROM payroll_runs r WHERE r.id = OLD.run_id AND r.status <> 'draft') THEN
        RAISE EXCEPTION 'payroll_items row % belongs to a % run and is immutable',
          OLD.id, (SELECT status FROM payroll_runs WHERE id = OLD.run_id);
      END IF;
      -- BEFORE DELETE must return OLD; returning NULL would cancel the delete
      -- silently, so a draft's stubs could never be removed.
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END;
    $$ LANGUAGE plpgsql`)
  await q(`DROP TRIGGER IF EXISTS trg_payroll_items_freeze ON payroll_items`)
  await q(`CREATE TRIGGER trg_payroll_items_freeze
           BEFORE INSERT OR UPDATE OR DELETE ON payroll_items
           FOR EACH ROW EXECUTE FUNCTION payroll_items_freeze()`)

  console.log('Seeding payroll categories…')
  for (const [label, type, desc] of PAYROLL_CATEGORIES) {
    await q(
      `INSERT INTO categories (label, type, description) VALUES ($1,$2,$3)
       ON CONFLICT (label) DO NOTHING`,
      [label, type, desc]
    )
  }

  console.log('Ensuring settings row…')
  await q(`INSERT INTO payroll_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`)

  const counts = await q(`SELECT
    (SELECT COUNT(*) FROM employees) employees,
    (SELECT COUNT(*) FROM timesheet_entries) entries,
    (SELECT COUNT(*) FROM payroll_runs) runs,
    (SELECT COUNT(*) FROM payroll_items) items`)
  console.log('done.', counts.rows[0])
  process.exit(0)
}

main().catch((e) => { console.error('payroll migration failed:', e); process.exit(1) })
