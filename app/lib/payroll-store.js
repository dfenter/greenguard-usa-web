// Payroll persistence — every SQL statement the payroll/timesheet feature
// needs lives here so the API routes stay thin and the invariants are in one
// place. Pure math is in lib/payroll.js; this file does I/O only.
//
// Two conventions worth knowing:
//  1. DATE columns are always returned as 'YYYY-MM-DD' TEXT via to_char().
//     node-postgres parses `date` into a local-midnight Date, which round-trips
//     to the wrong day through toISOString() under some TZ offsets. Casting in
//     SQL removes the whole class of bug.
//  2. Money is BIGINT cents in the DB and arrives as a STRING from pg, so
//     every read goes through num() before it touches arithmetic.

const { q, getPool } = require('./db')
const {
  computePayrollItem, workweekStart, elapsedHours, FEDERAL_MIN_WAGE_CENTS, TX_SUTA_DEFAULT_RATE,
} = require('./payroll')
const biz = require('./business.config')

const BIZ_TZ = process.env.CALENDAR_TIMEZONE || 'America/Chicago'

// Every timesheet write runs inside a transaction that first declares WHO is
// doing it, so the database audit trigger can attribute the revision. Without
// this the trail still records the change — attributed to 'system' — which is
// why the actor is a hint to the trigger rather than something the trigger
// depends on.
async function withActor(actorEmail, fn) {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    // SET LOCAL, not SET: pooled connections are reused across requests, and a
    // leaked actor would mis-attribute someone else's edit.
    await client.query(`SELECT set_config('payroll.actor_email', $1, true)`, [String(actorEmail || 'system')])
    const out = await fn(client)
    await client.query('COMMIT')
    return out
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Today in the business timezone as YYYY-MM-DD (en-CA formats as ISO).
function today(tz = BIZ_TZ) {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz })
}

function isDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime())
}

// ── Settings ──────────────────────────────────────────────────────────────

const SETTINGS_COLS = `
  legal_name, ein, address, suta_rate::float8 AS suta_rate, twc_account,
  week_start_day, default_pay_frequency, mileage_rate_cents,
  updated_at`

async function getSettings() {
  const { rows } = await q(`SELECT ${SETTINGS_COLS} FROM payroll_settings WHERE id = 1`)
  const s = rows[0] || {}
  return {
    legalName: s.legal_name || process.env.NEXT_PUBLIC_BIZ_NAME || biz.name,
    ein: s.ein || null,
    address: s.address || null,
    sutaRate: s.suta_rate != null ? num(s.suta_rate) : TX_SUTA_DEFAULT_RATE,
    twcAccount: s.twc_account || null,
    weekStartDay: s.week_start_day != null ? num(s.week_start_day) : 0,
    defaultPayFrequency: s.default_pay_frequency || 'biweekly',
    mileageRateCents: s.mileage_rate_cents != null ? num(s.mileage_rate_cents) : 70,
  }
}

// Every settings value is clamped server-side. A SUTA rate of 50 (instead of
// 0.05) or a week_start_day of 99 both pass the column types and would quietly
// corrupt every future run, so the coercion lives here, not in the browser.
const SETTINGS_WRITABLE = {
  legal_name: ['legalName', (v) => (v ? String(v).slice(0, 200) : null)],
  ein: ['ein', (v) => (v ? String(v).slice(0, 32) : null)],
  address: ['address', (v) => (v ? String(v).slice(0, 300) : null)],
  twc_account: ['twcAccount', (v) => (v ? String(v).slice(0, 64) : null)],
  // The column CHECKs <= 0.2; clamping to 1 here would surface as a raw 23514.
  suta_rate: ['sutaRate', (v) => Math.min(0.2, Math.max(0, num(v)))],
  week_start_day: ['weekStartDay', (v) => Math.min(6, Math.max(0, Math.round(num(v))))],
  mileage_rate_cents: ['mileageRateCents', (v) => Math.min(1000, Math.max(0, Math.round(num(v))))],
  default_pay_frequency: ['defaultPayFrequency', (v) => (['weekly', 'biweekly', 'semimonthly', 'monthly'].includes(v) ? v : 'biweekly')],
}

async function updateSettings(patch) {
  const sets = []
  const args = []
  for (const [col, [key, coerce]] of Object.entries(SETTINGS_WRITABLE)) {
    if (patch[key] === undefined) continue
    args.push(coerce(patch[key]))
    sets.push(`${col} = $${args.length}`)
  }
  if (!sets.length) return getSettings()
  await q(`UPDATE payroll_settings SET ${sets.join(', ')}, updated_at = NOW() WHERE id = 1`, args)
  return getSettings()
}

// ── Employees ─────────────────────────────────────────────────────────────

const EMP_COLS = `
  id, email, name, phone, classification, pay_type, pay_frequency,
  hourly_rate_cents, salary_annual_cents, per_stop_cents, mileage_rate_cents,
  ot_eligible, exempt, fww, salary_hours_per_week::float8 AS salary_hours_per_week,
  ot_threshold_hours::float8 AS ot_threshold_hours,
  filing_status, w4_multiple_jobs, w4_dependents_credit_cents,
  w4_other_income_cents, w4_deductions_cents, w4_extra_withholding_cents,
  fed_withholding_mode, fed_flat_pct::float8 AS fed_flat_pct,
  suta_rate::float8 AS suta_rate,
  to_char(hired_on, 'YYYY-MM-DD') AS hired_on,
  to_char(terminated_on, 'YYYY-MM-DD') AS terminated_on,
  active, notes`

// Normalize a DB row into the shape lib/payroll.js expects (numbers, not
// strings) — this is the ONLY place employee rows are hydrated.
function hydrateEmployee(r) {
  if (!r) return null
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    phone: r.phone || null,
    classification: r.classification,
    pay_type: r.pay_type,
    pay_frequency: r.pay_frequency,
    hourly_rate_cents: num(r.hourly_rate_cents),
    salary_annual_cents: num(r.salary_annual_cents),
    per_stop_cents: num(r.per_stop_cents),
    mileage_rate_cents: num(r.mileage_rate_cents),
    ot_eligible: r.ot_eligible,
    exempt: r.exempt,
    fww: r.fww,
    salary_hours_per_week: num(r.salary_hours_per_week) || 40,
    ot_threshold_hours: num(r.ot_threshold_hours) || 40,
    filing_status: r.filing_status,
    w4_multiple_jobs: r.w4_multiple_jobs,
    w4_dependents_credit_cents: num(r.w4_dependents_credit_cents),
    w4_other_income_cents: num(r.w4_other_income_cents),
    w4_deductions_cents: num(r.w4_deductions_cents),
    w4_extra_withholding_cents: num(r.w4_extra_withholding_cents),
    fed_withholding_mode: r.fed_withholding_mode,
    fed_flat_pct: num(r.fed_flat_pct),
    suta_rate: r.suta_rate == null ? null : num(r.suta_rate),
    hired_on: r.hired_on || null,
    terminated_on: r.terminated_on || null,
    active: r.active,
    notes: r.notes || null,
  }
}

async function listEmployees({ activeOnly = false } = {}) {
  const { rows } = await q(
    `SELECT ${EMP_COLS} FROM employees
     ${activeOnly ? 'WHERE active = TRUE' : ''}
     ORDER BY active DESC, name`
  )
  return rows.map(hydrateEmployee)
}

async function getEmployeeById(id) {
  const { rows } = await q(`SELECT ${EMP_COLS} FROM employees WHERE id = $1`, [id])
  return hydrateEmployee(rows[0])
}

async function getEmployeeByEmail(email) {
  const { rows } = await q(`SELECT ${EMP_COLS} FROM employees WHERE LOWER(email) = LOWER($1)`, [email])
  return hydrateEmployee(rows[0])
}

const EMP_WRITABLE = {
  email: (v) => String(v).trim().toLowerCase(),
  name: (v) => String(v).trim(),
  phone: (v) => (v ? String(v).trim() : null),
  classification: (v) => (v === 'contractor' ? 'contractor' : 'employee'),
  pay_type: (v) => (v === 'salary' ? 'salary' : 'hourly'),
  pay_frequency: (v) => (['weekly', 'biweekly', 'semimonthly', 'monthly'].includes(v) ? v : 'biweekly'),
  hourly_rate_cents: (v) => Math.max(0, Math.round(num(v))),
  salary_annual_cents: (v) => Math.max(0, Math.round(num(v))),
  per_stop_cents: (v) => Math.max(0, Math.round(num(v))),
  mileage_rate_cents: (v) => Math.max(0, Math.round(num(v))),
  ot_eligible: (v) => Boolean(v),
  exempt: (v) => Boolean(v),
  // Fluctuating-workweek half-time overtime — only with a written agreement.
  fww: (v) => Boolean(v),
  salary_hours_per_week: (v) => Math.min(60, Math.max(1, num(v) || 40)),
  // Over 40 would be an FLSA violation; the column CHECKs it too.
  ot_threshold_hours: (v) => Math.min(40, Math.max(1, num(v) || 40)),
  filing_status: (v) => (['single', 'married', 'head'].includes(v) ? v : 'single'),
  w4_multiple_jobs: (v) => Boolean(v),
  w4_dependents_credit_cents: (v) => Math.max(0, Math.round(num(v))),
  w4_other_income_cents: (v) => Math.max(0, Math.round(num(v))),
  w4_deductions_cents: (v) => Math.max(0, Math.round(num(v))),
  w4_extra_withholding_cents: (v) => Math.max(0, Math.round(num(v))),
  fed_withholding_mode: (v) => (['table', 'flat', 'none'].includes(v) ? v : 'table'),
  fed_flat_pct: (v) => Math.min(100, Math.max(0, num(v))),
  suta_rate: (v) => (v === null || v === '' || v === undefined ? null : Math.min(0.2, Math.max(0, num(v)))),
  hired_on: (v) => (isDateStr(v) ? v : null),
  terminated_on: (v) => (isDateStr(v) ? v : null),
  active: (v) => Boolean(v),
  notes: (v) => (v ? String(v).slice(0, 4000) : null),
}

// Texas Payday Law: exempt staff may be paid monthly, everyone else must be
// paid at least twice a month.
function assertLawfulWithholding(input) {
  if (input.fed_withholding_mode === 'none' && input.classification !== 'contractor') {
    throw Object.assign(
      new Error('Zero federal withholding needs a W-4 exempt certification — use the IRS percentage method for a W-2 employee.'),
      { status: 400 }
    )
  }
}

function assertLawfulPayFrequency(input) {
  if (input.pay_frequency !== 'monthly') return
  const contractor = input.classification === 'contractor'
  if (!contractor && !input.exempt) {
    throw Object.assign(
      new Error('Texas requires non-exempt employees to be paid at least twice a month — pick weekly, biweekly or semimonthly.'),
      { status: 400 }
    )
  }
}

async function createEmployee(input) {
  assertLawfulPayFrequency(input)
  assertLawfulWithholding(input)
  const cols = []
  const vals = []
  const args = []
  for (const [col, coerce] of Object.entries(EMP_WRITABLE)) {
    if (input[col] === undefined) continue
    args.push(coerce(input[col]))
    cols.push(col)
    vals.push(`$${args.length}`)
  }
  if (!cols.includes('email') || !cols.includes('name')) {
    throw Object.assign(new Error('email and name are required'), { status: 400 })
  }
  const { rows } = await q(
    `INSERT INTO employees (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING ${EMP_COLS}`,
    args
  )
  return hydrateEmployee(rows[0])
}

async function updateEmployee(id, patch) {
  if (patch.pay_frequency !== undefined || patch.exempt !== undefined ||
      patch.classification !== undefined || patch.fed_withholding_mode !== undefined) {
    const current = await getEmployeeById(id)
    assertLawfulPayFrequency({ ...current, ...patch })
    assertLawfulWithholding({ ...current, ...patch })
  }
  const sets = []
  const args = []
  for (const [col, coerce] of Object.entries(EMP_WRITABLE)) {
    if (patch[col] === undefined) continue
    args.push(coerce(patch[col]))
    sets.push(`${col} = $${args.length}`)
  }
  if (!sets.length) return getEmployeeById(id)
  args.push(id)
  const { rows } = await q(
    `UPDATE employees SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${args.length} RETURNING ${EMP_COLS}`,
    args
  )
  return hydrateEmployee(rows[0])
}

// ── Timesheet entries ─────────────────────────────────────────────────────

const TS_COLS = `
  id, employee_id, to_char(work_date, 'YYYY-MM-DD') AS work_date,
  clock_in, clock_out, hours::float8 AS hours, break_minutes,
  stops, miles::float8 AS miles, notes, source, status, payroll_run_id,
  submitted_at, approved_at, approved_by, created_at, updated_at,
  deleted_at, deleted_by`

function hydrateEntry(r) {
  if (!r) return null
  return {
    id: r.id,
    employee_id: r.employee_id,
    work_date: r.work_date,
    clock_in: r.clock_in ? new Date(r.clock_in).toISOString() : null,
    clock_out: r.clock_out ? new Date(r.clock_out).toISOString() : null,
    hours: r.hours == null ? null : num(r.hours),
    break_minutes: num(r.break_minutes),
    stops: num(r.stops),
    miles: num(r.miles),
    notes: r.notes || null,
    source: r.source,
    status: r.status,
    payroll_run_id: r.payroll_run_id || null,
    submitted_at: r.submitted_at ? new Date(r.submitted_at).toISOString() : null,
    approved_at: r.approved_at ? new Date(r.approved_at).toISOString() : null,
    approved_by: r.approved_by || null,
    deleted_at: r.deleted_at ? new Date(r.deleted_at).toISOString() : null,
    deleted_by: r.deleted_by || null,
  }
}

async function listEntries({ employeeId, from, to, status, limit = 200, offset = 0, includeDeleted = false } = {}) {
  const args = []
  const where = includeDeleted ? [] : ['deleted_at IS NULL']
  if (employeeId) { args.push(employeeId); where.push(`employee_id = $${args.length}`) }
  if (isDateStr(from)) { args.push(from); where.push(`work_date >= $${args.length}::date`) }
  if (isDateStr(to)) { args.push(to); where.push(`work_date <= $${args.length}::date`) }
  if (status) {
    const list = Array.isArray(status) ? status : [status]
    args.push(list)
    where.push(`status = ANY($${args.length})`)
  }
  args.push(Math.min(5000, Math.max(1, num(limit) || 200)))
  args.push(Math.max(0, Math.round(num(offset))))
  const { rows } = await q(
    `SELECT ${TS_COLS} FROM timesheet_entries
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY work_date DESC, id DESC LIMIT $${args.length - 1} OFFSET $${args.length}`,
    args
  )
  return rows.map(hydrateEntry)
}

// Pull EVERY entry in a range, in pages. Exports must never silently truncate:
// a wage-and-hour audit reads the CSV as the complete record.
async function listAllEntries({ employeeId, from, to, status, pageSize = 1000, maxRows = 50_000 } = {}) {
  // Keyset (not OFFSET) paging: a clock-out landing mid-export shifts an
  // OFFSET window and would repeat or skip a row at the page boundary.
  const out = []
  let cursor = null
  while (out.length < maxRows) {
    const args = []
    const where = []
    if (employeeId) { args.push(employeeId); where.push(`employee_id = $${args.length}`) }
    if (isDateStr(from)) { args.push(from); where.push(`work_date >= $${args.length}::date`) }
    if (isDateStr(to)) { args.push(to); where.push(`work_date <= $${args.length}::date`) }
    if (status) { args.push(Array.isArray(status) ? status : [status]); where.push(`status = ANY($${args.length})`) }
    where.push('deleted_at IS NULL')
    if (cursor) {
      args.push(cursor.work_date, cursor.id)
      where.push(`(work_date, id) < ($${args.length - 1}::date, $${args.length}::int)`)
    }
    args.push(pageSize)
    const { rows } = await q(
      `SELECT ${TS_COLS} FROM timesheet_entries
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY work_date DESC, id DESC LIMIT $${args.length}`,
      args
    )
    const page = rows.map(hydrateEntry)
    out.push(...page)
    if (page.length < pageSize) return { entries: out, truncated: false }
    cursor = { work_date: page[page.length - 1].work_date, id: page[page.length - 1].id }
  }
  return { entries: out, truncated: true }
}

async function getEntry(id, { includeDeleted = false } = {}) {
  const { rows } = await q(
    `SELECT ${TS_COLS} FROM timesheet_entries
     WHERE id = $1 ${includeDeleted ? '' : 'AND deleted_at IS NULL'}`,
    [id]
  )
  return hydrateEntry(rows[0])
}

// Entries a run may pull in: approved, inside the period, not already claimed.
async function listPayableEntries({ periodStart, periodEnd, runId = null }) {
  const { rows } = await q(
    `SELECT ${TS_COLS} FROM timesheet_entries
     WHERE work_date >= $1::date AND work_date <= $2::date
       AND deleted_at IS NULL
       AND (
         (status = 'approved' AND payroll_run_id IS NULL)
         OR ($3::int IS NOT NULL AND payroll_run_id = $3::int)
       )
     ORDER BY employee_id, work_date`,
    [periodStart, periodEnd, runId]
  )
  return rows.map(hydrateEntry)
}

// A field the caller didn't send must not be zeroed — omitting `stops` from a
// notes-only save used to wipe the day's piece pay and mileage.
const optNum = (v, coerce) => (v === undefined || v === null || v === '' ? null : coerce(v))

// Manual hours OVERRIDE a clock pair by clearing it. lib/payroll.js prefers a
// clock pair when one exists, so leaving both behind would mean the number the
// owner approves is not the number payroll pays.
async function upsertEntry({ employeeId, workDate, hours, breakMinutes, stops, miles, notes, actorEmail = 'system' }) {
  if (!isDateStr(workDate)) throw Object.assign(new Error('work_date must be YYYY-MM-DD'), { status: 400 })
  const manualHours = optNum(hours, (v) => Math.min(24, Math.max(0, num(v))))
  const { rows } = await withActor(actorEmail, (client) => client.query(
    `INSERT INTO timesheet_entries
       (employee_id, work_date, hours, break_minutes, stops, miles, notes, source)
     VALUES ($1, $2::date, $3, COALESCE($4, 0), COALESCE($5, 0), COALESCE($6, 0), $7, 'manual')
     ON CONFLICT (employee_id, work_date) WHERE deleted_at IS NULL DO UPDATE SET
       hours = COALESCE($3, timesheet_entries.hours),
       -- a manual hours edit supersedes the clock pair for that day
       clock_in  = CASE WHEN $3 IS NULL THEN timesheet_entries.clock_in  ELSE NULL END,
       clock_out = CASE WHEN $3 IS NULL THEN timesheet_entries.clock_out ELSE NULL END,
       source    = CASE WHEN $3 IS NULL THEN timesheet_entries.source    ELSE 'manual' END,
       break_minutes = COALESCE($4, timesheet_entries.break_minutes),
       stops = COALESCE($5, timesheet_entries.stops),
       miles = COALESCE($6, timesheet_entries.miles),
       notes = COALESCE($7, timesheet_entries.notes),
       -- edited numbers need looking at again, even if already approved
       status = CASE WHEN timesheet_entries.status = 'paid' THEN 'paid' ELSE 'submitted' END,
       submitted_at = NOW(), approved_at = NULL, approved_by = NULL,
       updated_at = NOW()
     WHERE timesheet_entries.status <> 'paid' AND timesheet_entries.payroll_run_id IS NULL
     RETURNING ${TS_COLS}`,
    [
      employeeId, workDate,
      manualHours,
      optNum(breakMinutes, (v) => Math.max(0, Math.round(num(v)))),
      optNum(stops, (v) => Math.max(0, Math.round(num(v)))),
      optNum(miles, (v) => Math.max(0, Math.round(num(v) * 10) / 10)),
      notes === undefined || notes === null ? null : String(notes).slice(0, 2000),
    ]
  ))
  if (!rows[0]) throw Object.assign(new Error('That day is already in a payroll run and cannot be edited'), { status: 409 })
  return hydrateEntry(rows[0])
}

function tstamp(v) {
  if (v === null || v === undefined || v === '') return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) throw Object.assign(new Error('Invalid timestamp'), { status: 400 })
  return d.toISOString()
}

async function patchEntry(id, patch, { actorEmail = 'system' } = {}) {
  const WRITABLE = {
    hours: (v) => (v === null || v === '' ? null : Math.min(24, Math.max(0, num(v)))),
    break_minutes: (v) => Math.max(0, Math.round(num(v))),
    stops: (v) => Math.max(0, Math.round(num(v))),
    miles: (v) => Math.max(0, Math.round(num(v) * 10) / 10),
    notes: (v) => (v ? String(v).slice(0, 2000) : null),
    clock_in: tstamp,
    clock_out: tstamp,
  }
  const sets = []
  const args = []
  for (const [col, coerce] of Object.entries(WRITABLE)) {
    if (patch[col] === undefined) continue
    args.push(coerce(patch[col]))
    sets.push(`${col} = $${args.length}`)
  }
  if (!sets.length) return getEntry(id)

  // Keep `hours` and the clock pair from ever disagreeing: a clock edit
  // recomputes hours, an hours edit drops the clock pair.
  const touchedClock = patch.clock_in !== undefined || patch.clock_out !== undefined
  const touchedHours = patch.hours !== undefined
  if (touchedClock && !touchedHours) {
    // Postgres evaluates every SET expression against the PRE-UPDATE row, so
    // referencing clock_in/clock_out here would recompute from the old stamps
    // and leave `hours` stale. Resolve the new pair in JS and pass it in.
    const current = await getEntry(id)
    const newIn = patch.clock_in !== undefined ? tstamp(patch.clock_in) : current?.clock_in
    const newOut = patch.clock_out !== undefined ? tstamp(patch.clock_out) : current?.clock_out
    const gross = newIn && newOut ? elapsedHours(newIn, newOut) : null
    args.push(gross === null ? null : Math.min(24, gross))
    sets.push(`hours = COALESCE($${args.length}, hours)`)
  }
  if (false) {
    // GROSS elapsed time, capped — matching clockOut exactly. The break is
    // deducted once, later, by entryHours(); subtracting it here too would
    // take it twice. Correcting a clock pair replaces the day's hours, so
    // re-enter a split day's total manually instead of patching its stamps.
    sets.push(`hours = CASE
        WHEN clock_in IS NOT NULL AND clock_out IS NOT NULL
        THEN LEAST(24, ROUND(GREATEST(0, EXTRACT(EPOCH FROM (clock_out - clock_in)) / 3600.0)::numeric, 2))
        ELSE hours END`)
  } else if (touchedHours) {
    sets.push('clock_in = NULL', 'clock_out = NULL', `source = 'manual'`)
  }

  args.push(id)
  // Any edit sends the entry back to 'submitted' so the owner re-approves the
  // changed numbers instead of silently paying them.
  const { rows } = await withActor(actorEmail, (client) => client.query(
    `UPDATE timesheet_entries SET ${sets.join(', ')},
       status = 'submitted', submitted_at = NOW(),
       approved_at = NULL, approved_by = NULL,
       updated_at = NOW()
     WHERE id = $${args.length} AND deleted_at IS NULL AND status <> 'paid' AND payroll_run_id IS NULL
     RETURNING ${TS_COLS}`,
    args
  ))
  if (!rows[0]) throw Object.assign(new Error('Entry is locked by a payroll run'), { status: 409 })
  return hydrateEntry(rows[0])
}

// SOFT delete. A time card is a wage record the FLSA requires us to keep for
// two years, so the row is marked instead of removed and the audit trigger
// records who removed it. Live reads filter deleted_at IS NULL, and the partial
// unique index lets the same day be entered again afterwards.
async function deleteEntry(id, { actorEmail = 'system' } = {}) {
  const rows = await withActor(actorEmail, async (client) => {
    const res = await client.query(
      `UPDATE timesheet_entries
       SET deleted_at = NOW(), deleted_by = $2, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL AND status <> 'paid' AND payroll_run_id IS NULL
       RETURNING ${TS_COLS}`,
      [id, actorEmail]
    )
    return res.rows
  })
  if (!rows[0]) throw Object.assign(new Error('Entry is locked by a payroll run'), { status: 409 })
  return true
}

// The trail for one day (or one entry). Owner sees any; an employee sees theirs.
async function listEntryRevisions({ entryId = null, employeeId = null, workDate = null, limit = 100 } = {}) {
  const args = []
  const where = []
  if (entryId) { args.push(entryId); where.push(`entry_id = $${args.length}`) }
  if (employeeId) { args.push(employeeId); where.push(`employee_id = $${args.length}`) }
  if (isDateStr(workDate)) { args.push(workDate); where.push(`work_date = $${args.length}::date`) }
  if (!where.length) throw Object.assign(new Error('entryId or employeeId required'), { status: 400 })
  args.push(Math.min(500, Math.max(1, num(limit) || 100)))
  const { rows } = await q(
    `SELECT id, entry_id, employee_id, to_char(work_date,'YYYY-MM-DD') AS work_date,
            action, actor_email,
            hours_before::float8 AS hours_before, hours_after::float8 AS hours_after,
            status_before, status_after, created_at
     FROM timesheet_revisions
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC, id DESC
     LIMIT $${args.length}`,
    args
  )
  return rows.map((r) => ({
    id: String(r.id),
    entryId: r.entry_id,
    employeeId: r.employee_id,
    workDate: r.work_date,
    action: r.action,
    actorEmail: r.actor_email,
    hoursBefore: r.hours_before == null ? null : num(r.hours_before),
    hoursAfter: r.hours_after == null ? null : num(r.hours_after),
    statusBefore: r.status_before || null,
    statusAfter: r.status_after || null,
    at: r.created_at ? new Date(r.created_at).toISOString() : null,
  }))
}

async function setEntryStatus({ ids, status, actorEmail }) {
  if (!ids?.length) return []
  const stamp =
    status === 'submitted' ? `submitted_at = NOW(), approved_at = NULL, approved_by = NULL`
    : status === 'approved' ? `approved_at = NOW(), approved_by = $3`
    : `approved_at = NULL, approved_by = NULL`
  const args = status === 'approved' ? [ids, status, actorEmail] : [ids, status]
  // (actorEmail is also declared to the audit trigger below.)
  // A day that is still on the clock has no final hours yet. Approving it
  // would claim it into a run at 0 h AND block the tech from clocking out.
  const notRunning = status === 'approved'
    ? `AND NOT (clock_in IS NOT NULL AND clock_out IS NULL)`
    : ''
  const { rows } = await withActor(actorEmail, (client) => client.query(
    `UPDATE timesheet_entries SET status = $2, ${stamp}, updated_at = NOW()
     WHERE id = ANY($1) AND deleted_at IS NULL AND status <> 'paid'
       AND payroll_run_id IS NULL ${notRunning}
     RETURNING ${TS_COLS}`,
    args
  ))
  return rows.map(hydrateEntry)
}

// Clock in: creates (or reuses) today's entry and stamps clock_in.
async function clockIn({ employeeId, tz = BIZ_TZ, at = new Date(), actorEmail = 'system' }) {
  const workDate = at.toLocaleDateString('en-CA', { timeZone: tz })

  // A forgotten clock-out from an earlier day would otherwise hit the partial
  // unique index (one open clock per employee) and 500. Say what's wrong
  // instead — the UI turns this into a "close Thursday's shift" prompt.
  const stale = await getOpenClock(employeeId)
  if (stale && stale.work_date !== workDate) {
    throw Object.assign(
      new Error(`You're still clocked in from ${stale.work_date}. Clock out of that shift first, then fix the hours.`),
      { status: 409, code: 'STALE_CLOCK', workDate: stale.work_date }
    )
  }

  const { rows } = await withActor(actorEmail, (client) => client.query(
    `INSERT INTO timesheet_entries (employee_id, work_date, clock_in, source, status)
     VALUES ($1, $2::date, $3, 'clock', 'open')
     ON CONFLICT (employee_id, work_date) WHERE deleted_at IS NULL DO UPDATE SET
       -- Already clocked in (clock_out NULL) ⇒ keep the original stamp, so a
       -- double-tap is idempotent. Already clocked OUT ⇒ this is a SECOND
       -- shift: take the new stamp, because clock-out adds (now − clock_in) to
       -- the hours already banked. COALESCE here would re-count shift one.
       clock_in = CASE WHEN timesheet_entries.clock_out IS NULL
                       -- open clock ⇒ keep it; manual row with no clock ⇒ start one
                       THEN COALESCE(timesheet_entries.clock_in, EXCLUDED.clock_in)
                       ELSE EXCLUDED.clock_in END,
       clock_out = NULL,
       source = 'clock',
       -- reopening a day the owner already approved un-approves it, so the
       -- new hours can never ride in on the old approval
       status = CASE WHEN timesheet_entries.status = 'approved' THEN 'submitted' ELSE timesheet_entries.status END,
       approved_at = NULL, approved_by = NULL,
       updated_at = NOW()
     WHERE timesheet_entries.status <> 'paid'
       AND timesheet_entries.payroll_run_id IS NULL
     RETURNING ${TS_COLS}`,
    [employeeId, workDate, at.toISOString()]
  ))
  if (!rows[0]) {
    const existing = await getEntry(
      (await q(`SELECT id FROM timesheet_entries WHERE employee_id = $1 AND work_date = $2::date`, [employeeId, workDate])).rows[0]?.id
    )
    if (existing?.payroll_run_id || existing?.status === 'paid') {
      throw Object.assign(new Error(`${workDate} is already in payroll run #${existing.payroll_run_id} and can't be changed.`), { status: 409 })
    }
    throw Object.assign(
      new Error("Today's hours are locked — ask Dan to reopen them."),
      { status: 409 }
    )
  }
  return hydrateEntry(rows[0])
}

// Clock out: closes the open clock (which may belong to yesterday's date if
// the shift ran past midnight) and banks the elapsed hours.
async function clockOut({ employeeId, at = new Date(), actorEmail = 'system' }) {
  const { rows } = await withActor(actorEmail, (client) => client.query(
    `UPDATE timesheet_entries
     SET clock_out = $2,
         -- ADD this shift's elapsed time to whatever is already banked, so a
         -- split day (morning route + evening callout) accumulates. The break
         -- is deducted once, later, by lib/payroll.js entryHours().
         hours = LEAST(24, ROUND((COALESCE(hours, 0)
                   + EXTRACT(EPOCH FROM ($2::timestamptz - clock_in)) / 3600.0)::numeric, 2)),
         -- new hours always need (re-)approval, even if the day was approved
         -- while the clock was still running
         status = 'submitted',
         submitted_at = NOW(), approved_at = NULL, approved_by = NULL,
         updated_at = NOW()
     WHERE employee_id = $1 AND clock_in IS NOT NULL AND clock_out IS NULL
       AND deleted_at IS NULL AND status <> 'paid' AND payroll_run_id IS NULL
     RETURNING ${TS_COLS}`,
    [employeeId, at.toISOString()]
  ))
  if (!rows[0]) throw Object.assign(new Error('You are not clocked in'), { status: 409 })
  return hydrateEntry(rows[0])
}

async function getOpenClock(employeeId) {
  const { rows } = await q(
    `SELECT ${TS_COLS} FROM timesheet_entries
     WHERE employee_id = $1 AND clock_in IS NOT NULL AND clock_out IS NULL
       AND deleted_at IS NULL LIMIT 1`,
    [employeeId]
  )
  return hydrateEntry(rows[0])
}


// ── Expense claims / receipts ─────────────────────────────────────────────
// Lifecycle:
//   submitted → approved → paid       (personal card: booked, then reimbursed
//                                      on the next payroll run)
//   submitted → recorded              (company card: booked, nothing owed)
//   submitted → rejected              (with a reason the crew can see)
//
// Approving is what books the expense, at its own chart-of-accounts category.
// The payroll reimbursement is therefore NOT booked again as an expense — it is
// just cash going back to the employee — which is why postRunToBooks() only
// posts the mileage portion.

const EXP_COLS = `
  id, employee_id, to_char(incurred_on,'YYYY-MM-DD') AS incurred_on,
  amount_cents, vendor, description, category_label, category_id,
  payment_method, receipt_url, receipt_mime, receipt_bytes, notes,
  status, rejected_reason, payroll_run_id, posted_to_books,
  approved_at, approved_by, reviewed_at, created_at, updated_at`

function hydrateExpense(r) {
  if (!r) return null
  return {
    id: r.id,
    employeeId: r.employee_id,
    incurredOn: r.incurred_on,
    categoryId: r.category_id || null,
    amountCents: num(r.amount_cents),
    vendor: r.vendor || null,
    description: r.description,
    categoryLabel: r.category_label,
    paymentMethod: r.payment_method,
    receiptUrl: r.receipt_url || null,
    receiptMime: r.receipt_mime || null,
    receiptBytes: r.receipt_bytes == null ? null : num(r.receipt_bytes),
    notes: r.notes || null,
    status: r.status,
    rejectedReason: r.rejected_reason || null,
    payrollRunId: r.payroll_run_id || null,
    postedToBooks: Boolean(r.posted_to_books),
    approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : null,
    approvedBy: r.approved_by || null,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    // Convenience for the UI: is this one still awaiting reimbursement?
    reimbursable: r.payment_method === 'personal',
  }
}

// A receipt URL may only ever point at our own blob storage. Without this a
// crew member could store `javascript:…` (which the owner then clicks in the
// review queue, executing with the owner's session) or an arbitrary host that
// serves something other than the receipt the deduction rests on.
function safeReceiptUrl(v) {
  if (v === null || v === undefined || v === '') return null
  let u
  try { u = new URL(String(v)) } catch { throw Object.assign(new Error('That receipt link is not a valid URL'), { status: 400 }) }
  // Suffix-matching `.blob.vercel-storage.com` accepted ANY Vercel tenant, so
  // a receipt link could point at storage we do not control. Pin the exact
  // host when BLOB_STORE_ID is configured, and refuse embedded credentials,
  // odd ports and paths outside our own receipts prefix.
  const storeId = (process.env.BLOB_STORE_ID || '').trim()
  const expectedHost = storeId
    ? `${storeId.replace(/^store_/, '').toLowerCase()}.public.blob.vercel-storage.com`
    : null
  const hostOk = expectedHost
    ? u.hostname.toLowerCase() === expectedHost
    : u.hostname.toLowerCase().endsWith('.public.blob.vercel-storage.com')
  const ok = u.protocol === 'https:' && hostOk && !u.username && !u.password && !u.port &&
    u.pathname.startsWith('/receipts/')
  if (!ok) {
    throw Object.assign(new Error('Receipts must be uploaded through the portal'), { status: 400 })
  }
  return `${u.origin}${u.pathname}`.slice(0, 500)
}

// The categories the receipt form offers — real expense/COGS buckets only, so
// a receipt never lands in a revenue or equity account.
async function listExpenseCategories() {
  const { rows } = await q(
    `SELECT label, type FROM categories
     WHERE type IN ('cogs','expense') AND label <> 'Expense:Mileage'
     ORDER BY label`
  )
  return rows.map((r) => ({ label: r.label, type: r.type }))
}

async function listExpenses({ employeeId, from, to, status, limit = 300 } = {}) {
  const args = []
  const where = []
  if (employeeId) { args.push(employeeId); where.push(`employee_id = $${args.length}`) }
  if (isDateStr(from)) { args.push(from); where.push(`incurred_on >= $${args.length}::date`) }
  if (isDateStr(to)) { args.push(to); where.push(`incurred_on <= $${args.length}::date`) }
  if (status) {
    args.push(Array.isArray(status) ? status : [status])
    where.push(`status = ANY($${args.length})`)
  }
  args.push(Math.min(1000, Math.max(1, num(limit) || 300)))
  const { rows } = await q(
    `SELECT ${EXP_COLS} FROM expense_claims
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY incurred_on DESC, id DESC LIMIT $${args.length}`,
    args
  )
  return rows.map(hydrateExpense)
}

async function getExpense(id) {
  const { rows } = await q(`SELECT ${EXP_COLS} FROM expense_claims WHERE id = $1`, [id])
  return hydrateExpense(rows[0])
}

// Locked once it is in a payroll run or already paid — same rule as timesheets.
function expenseLocked(claim) {
  return Boolean(claim && (claim.status === 'paid' || claim.payrollRunId))
}

async function createExpense({
  employeeId, incurredOn, amountCents, vendor, description, categoryLabel,
  paymentMethod = 'personal', receiptUrl = null, receiptMime = null, receiptBytes = null,
}) {
  if (!isDateStr(incurredOn)) throw Object.assign(new Error('Date must be YYYY-MM-DD'), { status: 400 })
  const cents = Math.round(num(amountCents))
  if (!(cents > 0)) throw Object.assign(new Error('Amount must be more than $0'), { status: 400 })
  if (!description || !String(description).trim()) {
    throw Object.assign(new Error('Say what the receipt was for'), { status: 400 })
  }
  if (!categoryLabel) throw Object.assign(new Error('Pick a category'), { status: 400 })

  // A future-dated receipt is a typo, not a claim.
  if (incurredOn > today()) throw Object.assign(new Error("That date is in the future"), { status: 400 })

  const cat = await q(`SELECT id, type FROM categories WHERE label = $1`, [categoryLabel])
  if (!cat.rows[0] || !['expense', 'cogs'].includes(cat.rows[0].type)) {
    throw Object.assign(new Error('That category cannot take an expense'), { status: 400 })
  }

  // A double-tap on a phone would otherwise file the same photo twice and be
  // reimbursed twice. The blob URL is unique per upload, so it identifies it.
  const safeUrl = safeReceiptUrl(receiptUrl)
  if (safeUrl) {
    const dupe = await q(
      `SELECT id, status FROM expense_claims
       WHERE employee_id = $1 AND receipt_url = $2 AND status <> 'rejected' LIMIT 1`,
      [employeeId, safeUrl]
    )
    if (dupe.rows[0]) {
      throw Object.assign(
        new Error(`That receipt photo is already filed (#${dupe.rows[0].id}, ${dupe.rows[0].status})`),
        { status: 409 }
      )
    }
  }

  const { rows } = await q(
    `INSERT INTO expense_claims
       (employee_id, incurred_on, amount_cents, vendor, description, category_label,
        category_id, payment_method, receipt_url, receipt_mime, receipt_bytes)
     VALUES ($1,$2::date,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING ${EXP_COLS}`,
    [
      employeeId, incurredOn, cents,
      vendor ? String(vendor).slice(0, 160) : null,
      String(description).slice(0, 1000),
      categoryLabel, cat.rows[0].id,
      paymentMethod === 'company' ? 'company' : 'personal',
      safeUrl, receiptMime ? String(receiptMime).slice(0, 100) : null,
      receiptBytes == null ? null : Math.min(64 * 1024 * 1024, Math.max(0, Math.round(num(receiptBytes)))),
    ]
  )
  return hydrateExpense(rows[0])
}

const EXP_WRITABLE = {
  incurred_on: (v) => (isDateStr(v) ? v : null),
  amount_cents: (v) => Math.max(1, Math.round(num(v))),
  vendor: (v) => (v ? String(v).slice(0, 160) : null),
  description: (v) => String(v || '').slice(0, 1000),
  category_label: (v) => String(v || ''),
  payment_method: (v) => (v === 'company' ? 'company' : 'personal'),
  receipt_url: safeReceiptUrl,
  receipt_mime: (v) => (v ? String(v).slice(0, 100) : null),
  receipt_bytes: (v) => (v == null ? null : Math.min(64 * 1024 * 1024, Math.max(0, Math.round(num(v))))),
}

// Editing a claim always sends it back to 'submitted' so a changed amount can
// never ride in on an earlier approval.
async function updateExpense(id, patch) {
  // The same validation createExpense applies — clamping instead of rejecting
  // turned a blanked amount field into a 1¢ claim.
  if (patch.amount_cents !== undefined && !(Math.round(num(patch.amount_cents)) > 0)) {
    throw Object.assign(new Error('Amount must be more than $0'), { status: 400 })
  }
  if (patch.description !== undefined && !String(patch.description).trim()) {
    throw Object.assign(new Error('Say what the receipt was for'), { status: 400 })
  }
  if (patch.incurred_on !== undefined) {
    if (!isDateStr(patch.incurred_on)) throw Object.assign(new Error('Date must be YYYY-MM-DD'), { status: 400 })
    if (patch.incurred_on > today()) throw Object.assign(new Error('That date is in the future'), { status: 400 })
    if (patch.incurred_on < '2024-01-01') throw Object.assign(new Error('That date is too far back'), { status: 400 })
  }

  const sets = []
  const args = []
  for (const [col, coerce] of Object.entries(EXP_WRITABLE)) {
    if (patch[col] === undefined) continue
    const val = coerce(patch[col])
    if (col === 'incurred_on' && val === null) continue
    args.push(val)
    sets.push(`${col} = $${args.length}`)
  }
  if (patch.category_label !== undefined) {
    const cat = await q(`SELECT id, type FROM categories WHERE label = $1`, [patch.category_label])
    if (!cat.rows[0] || !['expense', 'cogs'].includes(cat.rows[0].type)) {
      throw Object.assign(new Error('That category cannot take an expense'), { status: 400 })
    }
    args.push(cat.rows[0].id)
    sets.push(`category_id = $${args.length}`)
  }
  if (!sets.length) return getExpense(id)
  const before = await getExpense(id)
  args.push(id)
  const { rows } = await q(
    `UPDATE expense_claims SET ${sets.join(', ')},
       status = 'submitted', rejected_reason = NULL,
       approved_at = NULL, approved_by = NULL, updated_at = NOW()
     WHERE id = $${args.length} AND status <> 'paid' AND payroll_run_id IS NULL
     RETURNING ${EXP_COLS}`,
    args
  )
  if (!rows[0]) throw Object.assign(new Error('That receipt is already paid and cannot be edited'), { status: 409 })
  // An edited claim goes back to 'submitted', so its ledger entry (booked from
  // the OLD numbers) must come back out — re-approval posts the new figures.
  if (before?.postedToBooks) {
    await reverseExpenseInBooks(id).catch((e) => console.error('[expenses] un-book failed:', e.message))
    return getExpense(id)
  }
  return hydrateExpense(rows[0])
}

async function deleteExpense(id) {
  // Delete FIRST. Un-booking before the guarded delete meant a refused delete
  // (an already-paid receipt) still stripped the expense out of the ledger.
  const existing = await getExpense(id)
  const { rowCount } = await q(
    `DELETE FROM expense_claims WHERE id = $1 AND status <> 'paid' AND payroll_run_id IS NULL`,
    [id]
  )
  if (!rowCount) throw Object.assign(new Error('That receipt is already paid and cannot be deleted'), { status: 409 })
  if (existing?.postedToBooks) {
    await reverseExpenseInBooks(id).catch((e) => console.error('[expenses] un-book failed:', e.message))
  }
  return true
}

// Approve (personal → 'approved', company card → 'recorded') and book it.
async function approveExpense({ id, actorEmail, notes = null }) {
  const claim = await getExpense(id)
  if (!claim) throw Object.assign(new Error('Receipt not found'), { status: 404 })
  if (expenseLocked(claim)) throw Object.assign(new Error('That receipt is already paid'), { status: 409 })

  const nextStatus = claim.paymentMethod === 'company' ? 'recorded' : 'approved'
  const { rows } = await q(
    `UPDATE expense_claims
     SET status = $2, approved_at = NOW(), approved_by = $3, reviewed_at = NOW(),
         rejected_reason = NULL, notes = COALESCE($4, notes), updated_at = NOW()
     WHERE id = $1 AND status <> 'paid' AND payroll_run_id IS NULL
     RETURNING ${EXP_COLS}`,
    [id, nextStatus, actorEmail, notes ? String(notes).slice(0, 1000) : null]
  )
  if (!rows[0]) throw Object.assign(new Error('That receipt is already paid'), { status: 409 })

  // Booking is separate and idempotent — a ledger hiccup must not block the
  // approval (and reimbursement) of a real receipt.
  await postExpenseToBooks(id).catch((e) => console.error('[expenses] books posting failed:', e.message))
  return getExpense(id)
}

async function rejectExpense({ id, actorEmail, reason }) {
  if (!reason || !String(reason).trim()) {
    throw Object.assign(new Error('Give a reason so they know what to fix'), { status: 400 })
  }
  const claim = await getExpense(id)
  if (!claim) throw Object.assign(new Error('Receipt not found'), { status: 404 })
  if (expenseLocked(claim)) throw Object.assign(new Error('That receipt is already paid'), { status: 409 })

  const { rows } = await q(
    `UPDATE expense_claims
     SET status = 'rejected', rejected_reason = $2, approved_at = NULL, approved_by = NULL,
         reviewed_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status <> 'paid' AND payroll_run_id IS NULL
     RETURNING ${EXP_COLS}`,
    [id, String(reason).slice(0, 500)]
  )
  if (!rows[0]) throw Object.assign(new Error('That receipt is already paid'), { status: 409 })
  // If it had already been booked, back it out — a rejected receipt is not an
  // expense of the business.
  if (claim.postedToBooks) await reverseExpenseInBooks(id).catch((e) => console.error('[expenses] reversal failed:', e.message))
  return getExpense(id)
}

// Books posting. `transactions` has UNIQUE (source, external_id), so this is
// safe to retry.
async function postExpenseToBooks(id) {
  const claim = await getExpense(id)
  if (!claim || !['approved', 'recorded', 'paid'].includes(claim.status)) {
    return { posted: false, reason: `receipt is ${claim ? claim.status : 'missing'}` }
  }
  const who = await getEmployeeById(claim.employeeId)
  const label = (`${claim.vendor ? `${claim.vendor} — ` : ''}${claim.description}` +
    ` (${who?.name || 'crew'}, ${claim.paymentMethod === 'company' ? 'company card' : 'reimbursable'})`).slice(0, 500)

  // UPSERT, not DO NOTHING. A claim that was booked, un-booked and approved
  // again (or edited) has to end up with the CURRENT amount, date and category;
  // DO NOTHING silently kept the first version — or nothing at all.
  const { rows } = await q(
    `INSERT INTO transactions
       (source, external_id, occurred_at, amount_cents, type, description, category_id, category_label)
     VALUES ('expense-claim', $1, $2::date, $3, 'manual', $4, $5, $6)
     ON CONFLICT (source, external_id) DO UPDATE SET
       occurred_at = EXCLUDED.occurred_at,
       amount_cents = EXCLUDED.amount_cents,
       description = EXCLUDED.description,
       category_id = EXCLUDED.category_id,
       category_label = EXCLUDED.category_label
     RETURNING id`,
    [`expense-claim-${claim.id}`, claim.incurredOn, -Math.abs(claim.amountCents), label,
     claim.categoryId, claim.categoryLabel]
  )
  if (!rows[0]) return { posted: false, reason: 'ledger write did not land' }
  await q(`UPDATE expense_claims SET posted_to_books = TRUE WHERE id = $1`, [claim.id])
  return { posted: true }
}

// Un-book a claim. The ledger row is generated FROM the claim, so it is removed
// rather than offset: an offsetting row leaves the original in place, and then a
// later re-approval can never replace it (the expense nets to zero forever).
async function reverseExpenseInBooks(id) {
  const { rowCount } = await q(
    `DELETE FROM transactions
     WHERE source = 'expense-claim'
       AND external_id IN ('expense-claim-' || $1, 'expense-claim-void-' || $1)`,
    [String(id)]
  )
  await q(`UPDATE expense_claims SET posted_to_books = FALSE WHERE id = $1`, [id])
  return { reversed: true, rows: rowCount }
}

// Approved, reimbursable, not yet attached to a run — what the next payroll run
// should pay back. Bounded by the period end so a receipt from next month
// doesn't jump into this run.
// Money owed / waiting, computed in SQL so a page cap can never make the KPI
// under-report.
async function expenseTotals() {
  const { rows } = await q(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'submitted' THEN amount_cents END), 0)::bigint AS awaiting_cents,
       COUNT(*) FILTER (WHERE status = 'submitted')::int AS awaiting_count,
       COALESCE(SUM(CASE WHEN status = 'approved' AND payment_method = 'personal'
                          AND payroll_run_id IS NULL THEN amount_cents END), 0)::bigint AS owed_cents,
       COUNT(*) FILTER (WHERE status = 'approved' AND payment_method = 'personal'
                          AND payroll_run_id IS NULL)::int AS owed_count
     FROM expense_claims`
  )
  const r = rows[0] || {}
  return {
    awaitingReviewCents: num(r.awaiting_cents),
    awaitingReviewCount: num(r.awaiting_count),
    owedToCrewCents: num(r.owed_cents),
    owedCount: num(r.owed_count),
  }
}

async function expenseTotalsForEmployee(employeeId) {
  const { rows } = await q(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'submitted' THEN amount_cents END), 0)::bigint AS awaiting_cents,
       COALESCE(SUM(CASE WHEN status = 'approved' AND payment_method = 'personal'
                          AND payroll_run_id IS NULL THEN amount_cents END), 0)::bigint AS owed_cents
     FROM expense_claims WHERE employee_id = $1`,
    [employeeId]
  )
  const r = rows[0] || {}
  return { awaitingReviewCents: num(r.awaiting_cents), owedToMeCents: num(r.owed_cents) }
}

async function listReimbursableExpenses({ periodEnd, runId = null }) {
  const { rows } = await q(
    `SELECT ${EXP_COLS} FROM expense_claims
     WHERE payment_method = 'personal'
       AND incurred_on <= $1::date
       AND (
         (status = 'approved' AND payroll_run_id IS NULL)
         OR ($2::int IS NOT NULL AND payroll_run_id = $2::int)
       )
     ORDER BY employee_id, incurred_on`,
    [periodEnd, runId]
  )
  return rows.map(hydrateExpense)
}

// ── Year-to-date (finalized runs only) ────────────────────────────────────
// Wage-base caps and the additional-Medicare threshold are YTD concepts, so
// this must never count draft or voided runs.
// `throughPayDate` bounds the sum so a reprinted March paystub shows March's
// YTD, not December's — and so wage-base caps are computed from the runs that
// actually precede this one, whatever order they were finalized in.
async function ytdTotals({ employeeId, year, excludeRunId = null, throughPayDate = null }) {
  const { rows } = await q(
    `SELECT
       COALESCE(SUM(pi.taxable_gross_cents), 0)::bigint AS gross_cents,
       COALESCE(SUM(pi.ss_wages_cents), 0)::bigint      AS ss_wages_cents,
       COALESCE(SUM(pi.futa_wages_cents), 0)::bigint    AS futa_wages_cents,
       COALESCE(SUM(pi.suta_wages_cents), 0)::bigint    AS suta_wages_cents,
       COALESCE(SUM(pi.fed_income_tax_cents), 0)::bigint AS fed_income_tax_cents,
       COALESCE(SUM(pi.employee_ss_cents + pi.employee_medicare_cents + pi.employee_addl_medicare_cents), 0)::bigint AS employee_fica_cents,
       COALESCE(SUM(pi.net_cents), 0)::bigint           AS net_cents,
       COALESCE(SUM(pi.reimbursement_cents), 0)::bigint AS reimbursement_cents,
       COALESCE(SUM(pi.employer_tax_cents), 0)::bigint  AS employer_tax_cents,
       COALESCE(SUM(pi.regular_hours + pi.ot_hours), 0)::float8 AS hours
     FROM payroll_items pi
     JOIN payroll_runs r ON r.id = pi.run_id
     WHERE pi.employee_id = $1
       AND r.status = 'finalized'
       AND EXTRACT(YEAR FROM r.pay_date) = $2
       AND ($3::int IS NULL OR pi.run_id <> $3::int)
       AND ($4::date IS NULL OR r.pay_date <= $4::date)`,
    [employeeId, year, excludeRunId, isDateStr(throughPayDate) ? throughPayDate : null]
  )
  const r = rows[0] || {}
  return {
    grossCents: num(r.gross_cents),
    ssWagesCents: num(r.ss_wages_cents),
    futaWagesCents: num(r.futa_wages_cents),
    sutaWagesCents: num(r.suta_wages_cents),
    fedIncomeTaxCents: num(r.fed_income_tax_cents),
    employeeFicaCents: num(r.employee_fica_cents),
    netCents: num(r.net_cents),
    reimbursementCents: num(r.reimbursement_cents),
    employerTaxCents: num(r.employer_tax_cents),
    hours: num(r.hours),
  }
}

// ── Runs ──────────────────────────────────────────────────────────────────

const RUN_COLS = `
  id, to_char(period_start,'YYYY-MM-DD') AS period_start,
  to_char(period_end,'YYYY-MM-DD') AS period_end,
  to_char(pay_date,'YYYY-MM-DD') AS pay_date,
  status, tax_year, week_start_day,
  gross_cents, employee_tax_cents, employer_tax_cents, net_cents, reimbursement_cents,
  notes, created_by, created_at, finalized_at, finalized_by, voided_at, voided_by,
  posted_to_books, payments_sent_at, payments_sent_by, taxes_deposited_at`

function hydrateRun(r) {
  if (!r) return null
  return {
    id: r.id,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    payDate: r.pay_date,
    status: r.status,
    taxYear: num(r.tax_year),
    weekStartDay: num(r.week_start_day),
    grossCents: num(r.gross_cents),
    employeeTaxCents: num(r.employee_tax_cents),
    employerTaxCents: num(r.employer_tax_cents),
    netCents: num(r.net_cents),
    reimbursementCents: num(r.reimbursement_cents),
    notes: r.notes || null,
    createdBy: r.created_by,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    finalizedAt: r.finalized_at ? new Date(r.finalized_at).toISOString() : null,
    finalizedBy: r.finalized_by || null,
    voidedAt: r.voided_at ? new Date(r.voided_at).toISOString() : null,
    voidedBy: r.voided_by || null,
    postedToBooks: Boolean(r.posted_to_books),
    paymentsSentAt: r.payments_sent_at ? new Date(r.payments_sent_at).toISOString() : null,
    paymentsSentBy: r.payments_sent_by || null,
    taxesDepositedAt: r.taxes_deposited_at ? new Date(r.taxes_deposited_at).toISOString() : null,
  }
}

// The portal computes payroll; it does not move money. These two record what
// the owner actually did, so "the hours are marked paid" never stands in for
// "the employee was paid".
async function markRunPaymentsSent({ runId, actorEmail }) {
  const { rows } = await q(
    `UPDATE payroll_runs SET payments_sent_at = NOW(), payments_sent_by = $2
     WHERE id = $1 AND status = 'finalized' RETURNING ${RUN_COLS}`,
    [runId, actorEmail]
  )
  if (!rows[0]) throw Object.assign(new Error('Only a finalized run can be marked paid'), { status: 409 })
  return hydrateRun(rows[0])
}

async function markRunTaxesDeposited({ runId }) {
  const { rows } = await q(
    `UPDATE payroll_runs SET taxes_deposited_at = NOW()
     WHERE id = $1 AND status = 'finalized' RETURNING ${RUN_COLS}`,
    [runId]
  )
  if (!rows[0]) throw Object.assign(new Error('Only a finalized run can be marked deposited'), { status: 409 })
  return hydrateRun(rows[0])
}

async function listRuns({ limit = 24 } = {}) {
  const { rows } = await q(
    `SELECT ${RUN_COLS} FROM payroll_runs ORDER BY pay_date DESC, id DESC LIMIT $1`,
    [Math.min(200, Math.max(1, num(limit) || 24))]
  )
  return rows.map(hydrateRun)
}

const ITEM_COLS = `
  id, run_id, employee_id, employee_name, classification, pay_frequency,
  hourly_rate_cents, salary_annual_cents,
  regular_hours::float8 AS regular_hours, ot_hours::float8 AS ot_hours,
  stops, miles::float8 AS miles,
  base_pay_cents, piece_pay_cents, makeup_pay_cents, mileage_excess_cents,
  ot_premium_cents, bonus_cents,
  reimbursement_cents, expense_reimbursement_cents, taxable_gross_cents, gross_cents,
  fed_income_tax_cents, employee_ss_cents, employee_medicare_cents,
  employee_addl_medicare_cents, employer_ss_cents, employer_medicare_cents,
  employer_futa_cents, employer_suta_cents,
  ss_wages_cents, futa_wages_cents, suta_wages_cents,
  other_deduction_cents, other_deduction_label,
  employee_tax_cents, employer_tax_cents, net_cents,
  ytd_snapshot, detail`

// payroll_items and payroll_runs share seven column names (id, created_at,
// gross_cents, net_cents, reimbursement_cents, employee_tax_cents,
// employer_tax_cents), so every bare ITEM_COLS name is ambiguous once the two
// are joined. Qualify each select item with the items alias; the ::cast and
// `AS alias` tails are left alone so the returned keys don't change.
function qualifyItemCols(alias) {
  return ITEM_COLS.split(',')
    .map((col) => col.replace(/^(\s*)([a-z_][a-z0-9_]*)\b/i, `$1${alias}.$2`))
    .join(',')
}

function hydrateItem(r) {
  if (!r) return null
  const out = { id: r.id, runId: r.run_id, employeeId: r.employee_id, employeeName: r.employee_name }
  const NUMERIC = [
    'hourly_rate_cents', 'salary_annual_cents', 'regular_hours', 'ot_hours', 'stops', 'miles',
    'base_pay_cents', 'piece_pay_cents', 'makeup_pay_cents', 'mileage_excess_cents',
    'ot_premium_cents', 'bonus_cents',
    'reimbursement_cents', 'expense_reimbursement_cents', 'taxable_gross_cents', 'gross_cents',
    'fed_income_tax_cents', 'employee_ss_cents', 'employee_medicare_cents',
    'employee_addl_medicare_cents', 'employer_ss_cents', 'employer_medicare_cents',
    'employer_futa_cents', 'employer_suta_cents', 'ss_wages_cents',
    'futa_wages_cents', 'suta_wages_cents', 'other_deduction_cents',
    'employee_tax_cents', 'employer_tax_cents', 'net_cents',
  ]
  const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
  for (const col of NUMERIC) out[camel(col)] = num(r[col])
  out.classification = r.classification
  out.payFrequency = r.pay_frequency
  out.otherDeductionLabel = r.other_deduction_label || null
  out.ytd = r.ytd_snapshot || null
  out.detail = r.detail || null
  return out
}

// Every finalized paystub line for a year, flattened with its run's dates —
// the input shape for lib/payroll-filings.js (941/940/W-2/deposit rollups).
async function listFinalizedItemRows({ year }) {
  const { rows } = await q(
    `SELECT ${qualifyItemCols('pi')}
            , to_char(r.pay_date,'YYYY-MM-DD')     AS pay_date
            , to_char(r.period_start,'YYYY-MM-DD') AS period_start
            , to_char(r.period_end,'YYYY-MM-DD')   AS period_end
            , r.taxes_deposited_at
     FROM payroll_items pi
     JOIN payroll_runs r ON r.id = pi.run_id
     WHERE r.status = 'finalized' AND EXTRACT(YEAR FROM r.pay_date) = $1
     ORDER BY r.pay_date, pi.employee_name`,
    [year]
  )
  return rows.map((r) => ({
    ...hydrateItem(r),
    payDate: r.pay_date,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    taxesDepositedAt: r.taxes_deposited_at ? new Date(r.taxes_deposited_at).toISOString() : null,
  }))
}

async function getRunWithItems(runId) {
  const [{ rows: runRows }, { rows: itemRows }] = await Promise.all([
    q(`SELECT ${RUN_COLS} FROM payroll_runs WHERE id = $1`, [runId]),
    q(`SELECT ${ITEM_COLS} FROM payroll_items WHERE run_id = $1 ORDER BY employee_name`, [runId]),
  ])
  const run = hydrateRun(runRows[0])
  if (!run) return null
  return { run, items: itemRows.map(hydrateItem) }
}

// Compute (without persisting) what a run would pay. `adjustments` is keyed by
// employee id: { bonusCents, otherDeductionCents, otherDeductionLabel }.
async function previewRun({ periodStart, periodEnd, payDate, employeeIds = null, adjustments = {}, runId = null }) {
  if (!isDateStr(periodStart) || !isDateStr(periodEnd) || !isDateStr(payDate)) {
    throw Object.assign(new Error('periodStart, periodEnd and payDate must be YYYY-MM-DD'), { status: 400 })
  }
  if (periodEnd < periodStart) throw Object.assign(new Error('periodEnd is before periodStart'), { status: 400 })

  const settings = await getSettings()
  const taxYear = Number(payDate.slice(0, 4))
  const entries = await listPayableEntries({ periodStart, periodEnd, runId })
  const claims = await listReimbursableExpenses({ periodEnd, runId })
  const warnings = []

  const spanDays = Math.round(
    (new Date(`${periodEnd}T00:00:00Z`) - new Date(`${periodStart}T00:00:00Z`)) / 86_400_000
  ) + 1

  // Overtime is a WEEKLY concept, and a run only sees its own entries. If the
  // period cuts a workweek in half, that week's hours are split across two
  // runs and neither one sees 40+ — the overtime silently disappears.
  const dayAfterEnd = new Date(`${periodEnd}T00:00:00Z`)
  dayAfterEnd.setUTCDate(dayAfterEnd.getUTCDate() + 1)
  const endsCleanly = workweekStart(dayAfterEnd.toISOString().slice(0, 10), settings.weekStartDay) === dayAfterEnd.toISOString().slice(0, 10)
  if (workweekStart(periodStart, settings.weekStartDay) !== periodStart || !endsCleanly) {
    warnings.push(
      `This period doesn't line up with whole workweeks (weeks start ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][settings.weekStartDay]}). Hours in a split week are divided between two runs, so overtime for that week can be missed. Adjust the dates to start and end on workweek boundaries.`
    )
  }

  // Approved receipts are reimbursed on the next run even if the employee
  // logged no hours in the period, so they can create a row on their own.
  const claimsByEmployee = new Map()
  for (const c of claims) {
    if (employeeIds && !employeeIds.includes(c.employeeId)) continue
    if (!claimsByEmployee.has(c.employeeId)) claimsByEmployee.set(c.employeeId, [])
    claimsByEmployee.get(c.employeeId).push(c)
  }

  const byEmployee = new Map()
  for (const e of entries) {
    if (employeeIds && !employeeIds.includes(e.employee_id)) continue
    if (!byEmployee.has(e.employee_id)) byEmployee.set(e.employee_id, [])
    byEmployee.get(e.employee_id).push(e)
  }
  // Anyone with an approved receipt gets a row even with no hours and even if
  // they are now inactive — a final-paycheck reimbursement must not be lost.
  for (const claimEmployeeId of claimsByEmployee.keys()) {
    if (!byEmployee.has(claimEmployeeId)) byEmployee.set(claimEmployeeId, [])
  }

  // Salaried staff and adjustment-only payees are paid even with no entries.
  const allEmployees = await listEmployees({ activeOnly: true })
  for (const emp of allEmployees) {
    if (employeeIds && !employeeIds.includes(emp.id)) continue
    const adj = adjustments[emp.id] || adjustments[String(emp.id)] || {}
    const needsRow = emp.pay_type === 'salary' || num(adj.bonusCents) > 0 || claimsByEmployee.has(emp.id)
    if (needsRow && !byEmployee.has(emp.id)) byEmployee.set(emp.id, [])
  }

  const items = []
  for (const [employeeId, empEntries] of byEmployee) {
    const employee = allEmployees.find((e) => e.id === employeeId) || (await getEmployeeById(employeeId))
    if (!employee) continue
    const adj = adjustments[employeeId] || adjustments[String(employeeId)] || {}
    const ytd = await ytdTotals({ employeeId, year: taxYear, excludeRunId: runId, throughPayDate: payDate })

    // The federal percentage method annualizes by the employee's pay
    // frequency; a period that isn't roughly that long under-withholds.
    const nominalDays = { weekly: 7, biweekly: 14, semimonthly: 15, monthly: 30 }[employee.pay_frequency] || 14
    if (spanDays > nominalDays * 1.5 || spanDays <= nominalDays * 0.5) {
      warnings.push(
        `${employee.name} is set to ${employee.pay_frequency} pay, but this period covers ${spanDays} days — federal withholding is annualized from the frequency, and salary is prorated by period length. Fix the period or the employee's pay frequency.`
      )
    }

    const item = computePayrollItem({
      employee,
      entries: empEntries,
      year: taxYear,
      weekStartDay: settings.weekStartDay,
      ytd,
      sutaRate: employee.suta_rate != null ? employee.suta_rate : settings.sutaRate,
      // Bonuses only ever add pay. A negative "bonus" would invert the tax
      // math (negative withholding); money owed back belongs in a deduction.
      periodDays: spanDays,
      periodStart,
      periodEnd,
      expenseReimbursementCents: (claimsByEmployee.get(employeeId) || [])
        .reduce((sum, c) => sum + c.amountCents, 0),
      bonusCents: Math.max(0, Math.round(num(adj.bonusCents))),
      otherDeductionCents: Math.max(0, Math.round(num(adj.otherDeductionCents))),
      otherDeductionLabel: adj.otherDeductionLabel ? String(adj.otherDeductionLabel).slice(0, 120) : null,
    })
    // Nothing to pay and nothing to report — skip rather than emit a $0 stub.
    if (item.grossCents === 0 && item.totalHours === 0) continue
    items.push({
      ...item,
      expenseClaims: (claimsByEmployee.get(employeeId) || []).map((c) => ({
        id: c.id, incurredOn: c.incurredOn, vendor: c.vendor,
        description: c.description, amountCents: c.amountCents, categoryLabel: c.categoryLabel,
      })),
      employeeName: employee.name,
      employeeEmail: employee.email,
      hourlyRateCents: employee.hourly_rate_cents,
      salaryAnnualCents: employee.salary_annual_cents,
      ytd,
    })
  }
  items.sort((a, b) => a.employeeName.localeCompare(b.employeeName))

  const totals = items.reduce(
    (t, i) => ({
      grossCents: t.grossCents + i.grossCents,
      expenseReimbursementCents: t.expenseReimbursementCents + i.expenseReimbursementCents,
      employeeTaxCents: t.employeeTaxCents + i.employeeTaxCents,
      employerTaxCents: t.employerTaxCents + i.employerTaxCents,
      netCents: t.netCents + i.netCents,
      reimbursementCents: t.reimbursementCents + i.reimbursementCents,
      totalCostCents: t.totalCostCents + i.totalCostCents,
      // Labour cost excludes reimbursed receipts — those are already an expense
      // under their own category, so counting them here double-counts them.
      laborCostCents: t.laborCostCents + (i.grossCents - i.expenseReimbursementCents + i.employerTaxCents),
      hours: Math.round((t.hours + i.totalHours) * 100) / 100,
    }),
    {
      grossCents: 0, employeeTaxCents: 0, employerTaxCents: 0, netCents: 0,
      reimbursementCents: 0, expenseReimbursementCents: 0, totalCostCents: 0,
      laborCostCents: 0, hours: 0,
    }
  )

  const shortWithheld = items.find((i) => i.withholdingShortfallCents > 0)
  if (shortWithheld) {
    warnings.push(`${shortWithheld.employeeName}'s W-4 asks for more federal withholding than the check can cover — ${(shortWithheld.withholdingShortfallCents / 100).toFixed(2)} could not be withheld.`)
  }
  const minWagePayer = items.find((i) => i.makeupPayCents > 0)
  if (minWagePayer) {
    warnings.push(`${minWagePayer.employeeName}'s piece/hourly pay fell below the $7.25 federal minimum for the hours worked — a makeup payment was added.`)
  }
  const excessPayer = items.find((i) => i.mileageExcessCents > 0)
  if (excessPayer) {
    warnings.push(`${excessPayer.employeeName}'s mileage rate is above the IRS standard rate; the excess is being treated as taxable wages.`)
  }
  const fallbackYear = items.find((i) => i.taxYearFallback)?.taxYearFallback
  if (fallbackYear) {
    warnings.push(`No tax tables for ${taxYear} — withholding used the ${fallbackYear} tables. Update TAX_YEARS in lib/payroll.js before paying.`)
  }

  return { periodStart, periodEnd, payDate, taxYear, settings, items, totals, warnings }
}

// Any non-void run whose period overlaps [start, end]. Salary and bonus rows
// carry no timesheet entries, so the entry-claiming guard can't catch a second
// run over the same days — this can.
async function overlappingRuns({ periodStart, periodEnd, excludeRunId = null, client = null }) {
  const run = client ? client.query.bind(client) : q
  const { rows } = await run(
    `SELECT id, to_char(period_start,'YYYY-MM-DD') AS period_start,
            to_char(period_end,'YYYY-MM-DD') AS period_end, status
     FROM payroll_runs
     WHERE status <> 'void'
       AND period_start <= $2::date AND period_end >= $1::date
       AND ($3::int IS NULL OR id <> $3::int)
     ORDER BY period_start
     FOR UPDATE`,
    [periodStart, periodEnd, excludeRunId]
  )
  return rows
}

// Persist a draft run: writes the run header, the paystub rows, and claims the
// timesheet entries. All inside one transaction so a failure can't half-claim
// a week of work.
async function createRun({ periodStart, periodEnd, payDate, employeeIds = null, adjustments = {}, notes = null, createdBy }) {
  // Check for an overlapping run BEFORE pricing anything: an overlapping
  // period has already had its entries claimed, so the preview would come
  // back empty and report "no approved time" instead of the real problem.
  // Overtime is weekly. If the period cuts a workweek that actually contains
  // hours, those hours are divided across two runs and neither sees 40+, so
  // the premium silently disappears. Warning was not enough — refuse.
  const check = await previewRun({ periodStart, periodEnd, payDate, employeeIds, adjustments })
  const splitWeek = check.warnings.find((w) => w.includes("don't line up with whole workweeks"))
  if (splitWeek && check.items.some((i) => i.totalHours > 0)) {
    throw Object.assign(
      new Error(`${splitWeek} Adjust the dates before creating this run — overtime for the split week would be missed.`),
      { status: 400 }
    )
  }
  // A year with no tax tables must not be paid from another year's numbers.
  const fallback = check.items.find((i) => i.taxYearFallback)
  if (fallback) {
    throw Object.assign(
      new Error(`No tax tables for ${check.taxYear}. Add them to TAX_YEARS in lib/payroll.js before running this payroll.`),
      { status: 400 }
    )
  }

  const earlyClash = await overlappingRuns({ periodStart, periodEnd })
  if (earlyClash.length) {
    const c = earlyClash[0]
    throw Object.assign(
      new Error(`Run #${c.id} (${c.period_start} – ${c.period_end}, ${c.status}) already covers part of that period. Void it first or pick different dates.`),
      { status: 409 }
    )
  }

  const preview = await previewRun({ periodStart, periodEnd, payDate, employeeIds, adjustments })
  if (!preview.items.length) throw Object.assign(new Error('No approved timesheet entries in that period'), { status: 400 })

  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    await client.query(`SELECT set_config('payroll.actor_email', $1, true)`, [String(createdBy || 'system')])
    // FOR UPDATE can't lock rows that don't exist yet, so two simultaneous
    // creates of DIFFERENT overlapping periods would both pass the check below
    // (and each pay the same salary/bonus). One advisory lock serializes all
    // run creation — it is a once-per-payday operation, so contention is free.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('payroll_run_create'))`)

    // Overlap check inside the transaction, with any conflicting rows locked.
    const clash = await overlappingRuns({ periodStart, periodEnd, client })
    if (clash.length) {
      const c = clash[0]
      throw Object.assign(
        new Error(`Run #${c.id} (${c.period_start} – ${c.period_end}, ${c.status}) already covers part of that period. Void it first or pick different dates.`),
        { status: 409 }
      )
    }

    const { rows: runRows } = await client.query(
      `INSERT INTO payroll_runs
         (period_start, period_end, pay_date, status, tax_year, week_start_day,
          gross_cents, employee_tax_cents, employer_tax_cents, net_cents, reimbursement_cents,
          notes, created_by)
       VALUES ($1::date,$2::date,$3::date,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING ${RUN_COLS}`,
      [
        periodStart, periodEnd, payDate, preview.taxYear, preview.settings.weekStartDay,
        preview.totals.grossCents, preview.totals.employeeTaxCents, preview.totals.employerTaxCents,
        preview.totals.netCents,
        preview.totals.reimbursementCents + preview.totals.expenseReimbursementCents,
        notes, createdBy,
      ]
    )
    const run = hydrateRun(runRows[0])

    for (const item of preview.items) {
      await client.query(
        `INSERT INTO payroll_items
           (run_id, employee_id, employee_name, classification, pay_frequency, hourly_rate_cents,
            regular_hours, ot_hours, stops, miles,
            base_pay_cents, piece_pay_cents, ot_premium_cents, bonus_cents, reimbursement_cents,
            taxable_gross_cents, gross_cents, fed_income_tax_cents,
            employee_ss_cents, employee_medicare_cents, employee_addl_medicare_cents,
            employer_ss_cents, employer_medicare_cents, employer_futa_cents, employer_suta_cents,
            ss_wages_cents, futa_wages_cents, suta_wages_cents,
            other_deduction_cents, other_deduction_label,
            employee_tax_cents, employer_tax_cents, net_cents, ytd_snapshot, detail,
            makeup_pay_cents, mileage_excess_cents, salary_annual_cents,
            expense_reimbursement_cents)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                 $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39)`,
        [
          run.id, item.employeeId, item.employeeName, item.classification, item.payFrequency,
          item.hourlyRateCents, item.regularHours, item.otHours, item.stops, item.miles,
          item.basePayCents, item.piecePayCents, item.otPremiumCents, item.bonusCents,
          item.reimbursementCents, item.taxableGrossCents, item.grossCents, item.fedIncomeTaxCents,
          item.employeeSsCents, item.employeeMedicareCents, item.employeeAddlMedicareCents,
          item.employerSsCents, item.employerMedicareCents, item.employerFutaCents, item.employerSutaCents,
          item.ssWagesCents, item.futaWagesCents, item.sutaWagesCents,
          item.otherDeductionCents, item.otherDeductionLabel,
          item.employeeTaxCents, item.employerTaxCents, item.netCents,
          JSON.stringify(item.ytd || {}),
          JSON.stringify({
            weeks: item.weeks,
            taxYearFallback: item.taxYearFallback,
            deductionShortfallCents: item.deductionShortfallCents || 0,
            withholdingShortfallCents: item.withholdingShortfallCents || 0,
            periodDays: item.periodDays || null,
            // Substantiation for the accountable plan: which receipts this
            // reimbursement covered. A void clears payroll_run_id, so without
            // this the link would be gone.
            expenseClaims: item.expenseClaims || [],
          }),
          item.makeupPayCents, item.mileageExcessCents, item.salaryAnnualCents || 0,
          item.expenseReimbursementCents || 0,
        ]
      )
      // Claim the receipts this stub reimburses, same re-check as the hours.
      const claimIds = (item.expenseClaims || []).map((c) => c.id)
      if (claimIds.length) {
        const { rowCount } = await client.query(
          `UPDATE expense_claims SET payroll_run_id = $1, updated_at = NOW()
           WHERE id = ANY($2) AND status = 'approved' AND payroll_run_id IS NULL`,
          [run.id, claimIds]
        )
        if (rowCount !== claimIds.length) {
          throw Object.assign(
            new Error('An expense receipt changed while the run was being created — try again'),
            { status: 409 }
          )
        }
      }

      // Claim exactly the entries this stub was computed from. The WHERE
      // re-checks the claim conditions, so a concurrent run cannot steal them.
      if (item.entryIds.length) {
        const { rowCount } = await client.query(
          `UPDATE timesheet_entries SET payroll_run_id = $1, updated_at = NOW()
           WHERE id = ANY($2) AND status = 'approved' AND payroll_run_id IS NULL`,
          [run.id, item.entryIds]
        )
        if (rowCount !== item.entryIds.length) {
          throw Object.assign(
            new Error('Timesheet entries changed while the run was being created — try again'),
            { status: 409 }
          )
        }
      }
    }

    await client.query('COMMIT')
    return getRunWithItems(run.id)
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    if (err.constraint === 'uniq_payroll_run_live_period' || err.code === '23P01') {
      throw Object.assign(new Error('A payroll run already exists for that period'), { status: 409 })
    }
    throw err
  } finally {
    client.release()
  }
}

async function finalizeRun({ runId, actorEmail }) {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    // Same lock as createRun: two runs finalizing at once would each read a
    // year-to-date total that excludes the other and both charge Social
    // Security past the wage base (or both miss the additional-Medicare step).
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('payroll_run_create'))`)
    await client.query(`SELECT set_config('payroll.actor_email', $1, true)`, [String(actorEmail || 'system')])
    const { rows } = await client.query(
      `SELECT id, status FROM payroll_runs WHERE id = $1 FOR UPDATE`,
      [runId]
    )
    if (!rows[0]) throw Object.assign(new Error('Run not found'), { status: 404 })
    if (rows[0].status !== 'draft') {
      throw Object.assign(new Error(`Run is ${rows[0].status}, not draft`), { status: 409 })
    }

    // The wage-base caps in this draft were computed when it was created. If
    // another run has been finalized since (or out of pay-date order), those
    // caps are stale and finalizing would over- or under-tax. Refuse rather
    // than quietly pay the wrong numbers.
    const { rows: stubs } = await client.query(
      `SELECT pi.employee_id, pi.employee_name, pi.ytd_snapshot,
              to_char(r.pay_date,'YYYY-MM-DD') AS pay_date, r.tax_year
       FROM payroll_items pi JOIN payroll_runs r ON r.id = pi.run_id
       WHERE pi.run_id = $1`,
      [runId]
    )
    for (const stub of stubs) {
      const fresh = await ytdTotals({
        employeeId: stub.employee_id,
        year: stub.tax_year,
        excludeRunId: runId,
        throughPayDate: stub.pay_date,
      })
      const stored = stub.ytd_snapshot || {}
      const drifted = ['ssWagesCents', 'futaWagesCents', 'sutaWagesCents', 'grossCents']
        .some((k) => num(stored[k]) !== num(fresh[k]))
      if (drifted) {
        throw Object.assign(
          new Error(`Year-to-date totals for ${stub.employee_name} changed after this draft was built (another run was finalized). Void this draft and create it again so the wage-base caps are right.`),
          { status: 409 }
        )
      }
    }
    await client.query(
      `UPDATE payroll_runs SET status = 'finalized', finalized_at = NOW(), finalized_by = $2 WHERE id = $1`,
      [runId, actorEmail]
    )
    await client.query(
      `UPDATE timesheet_entries SET status = 'paid', updated_at = NOW() WHERE payroll_run_id = $1`,
      [runId]
    )
    await client.query(
      `UPDATE expense_claims SET status = 'paid', updated_at = NOW() WHERE payroll_run_id = $1`,
      [runId]
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
  // Books posting is deliberately outside the transaction: a bookkeeping
  // hiccup must not roll back a finalized payroll. It is idempotent and
  // retryable via postRunToBooks().
  await postRunToBooks(runId).catch((e) => console.error('[payroll] books posting failed:', e.message))
  return getRunWithItems(runId)
}

async function voidRun({ runId, actorEmail }) {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('payroll_run_create'))`)
    await client.query(`SELECT set_config('payroll.actor_email', $1, true)`, [String(actorEmail || 'system')])
    const { rows } = await client.query(
      `SELECT id, status, posted_to_books FROM payroll_runs WHERE id = $1 FOR UPDATE`,
      [runId]
    )
    if (!rows[0]) throw Object.assign(new Error('Run not found'), { status: 404 })
    if (rows[0].status === 'void') throw Object.assign(new Error('Run is already void'), { status: 409 })
    const wasFinalized = rows[0].status === 'finalized'

    await client.query(
      `UPDATE payroll_runs SET status = 'void', voided_at = NOW(), voided_by = $2 WHERE id = $1`,
      [runId, actorEmail]
    )
    // Release the work so it can be paid on a corrected run.
    await client.query(
      `UPDATE timesheet_entries
       SET payroll_run_id = NULL, status = 'approved', updated_at = NOW()
       WHERE payroll_run_id = $1`,
      [runId]
    )
    // Same for receipts: back to 'approved' and awaiting the next run. Their
    // books entries stay — the expense was real, only the reimbursement moved.
    await client.query(
      `UPDATE expense_claims
       SET payroll_run_id = NULL, status = 'approved', updated_at = NOW()
       WHERE payroll_run_id = $1`,
      [runId]
    )

    if (wasFinalized) {
      // Reverse the book entries rather than deleting them — the ledger keeps
      // both sides so a void is visible in the P&L history. Driven off the
      // rows that actually exist (not the posted_to_books flag, which can lag
      // a partial post), and self-idempotent via ON CONFLICT.
      // occurred_at mirrors the original so the reversal lands in the same
      // accounting period, not whenever the void happened to be clicked.
      await client.query(
        `INSERT INTO transactions
           (source, external_id, occurred_at, amount_cents, type, description, category_id, category_label)
         SELECT 'payroll', 'payroll-void-' || $1 || '-' || t.external_id, t.occurred_at,
                -t.amount_cents, 'manual',
                'VOID: ' || t.description, t.category_id, t.category_label
         FROM transactions t
         WHERE t.source = 'payroll' AND t.external_id LIKE 'payroll-run-' || $1 || '-%'
         ON CONFLICT (source, external_id) DO NOTHING`,
        [String(runId)]
      )
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
  return getRunWithItems(runId)
}

// ── Books integration ─────────────────────────────────────────────────────
// Posts a finalized run into the bookkeeping ledger as expense transactions.
// Idempotent: transactions has UNIQUE (source, external_id).
//
// Wage expense is TAXABLE GROSS (withholding is the employee's money, not an
// extra expense), plus employer taxes, plus non-taxable reimbursements.
async function postRunToBooks(runId) {
  const data = await getRunWithItems(runId)
  if (!data || data.run.status !== 'finalized') return { posted: false, reason: 'not finalized' }
  const { run, items } = data

  const buckets = [
    {
      label: 'Expense:Payroll:Wages',
      key: 'wages',
      cents: items.filter((i) => i.classification === 'employee').reduce((s, i) => s + i.taxableGrossCents, 0),
      desc: `Payroll wages ${run.periodStart}–${run.periodEnd}`,
    },
    {
      label: 'Expense:Payroll:Contractors',
      key: 'contractors',
      cents: items.filter((i) => i.classification === 'contractor').reduce((s, i) => s + i.taxableGrossCents, 0),
      desc: `Contractor pay ${run.periodStart}–${run.periodEnd}`,
    },
    {
      label: 'Expense:Payroll:EmployerTaxes',
      key: 'taxes',
      cents: items.reduce((s, i) => s + i.employerTaxCents, 0),
      desc: `Employer payroll taxes ${run.periodStart}–${run.periodEnd}`,
    },
    {
      label: 'Expense:Payroll:Reimbursement',
      key: 'reimb',
      cents: items.reduce((s, i) => s + i.reimbursementCents, 0),
      // Mileage only: receipts were already booked at their own category when
      // they were approved, so posting them here would double-count them.
      desc: `Mileage reimbursement ${run.periodStart}–${run.periodEnd}`,
    },
  ].filter((b) => b.cents > 0)

  const { rows: catRows } = await q(`SELECT id, label FROM categories WHERE label = ANY($1)`, [buckets.map((b) => b.label)])
  const catId = Object.fromEntries(catRows.map((r) => [r.label, r.id]))

  // One transaction, with the run locked and its status re-checked inside it.
  // Otherwise a concurrent void could commit between the status read above and
  // the inserts, leaving un-reversed expense rows in the ledger forever.
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const { rows: guard } = await client.query(
      `SELECT status FROM payroll_runs WHERE id = $1 FOR UPDATE`, [run.id]
    )
    if (guard[0]?.status !== 'finalized') {
      await client.query('ROLLBACK')
      return { posted: false, reason: `run is ${guard[0]?.status || 'missing'}` }
    }
    for (const b of buckets) {
      await client.query(
        `INSERT INTO transactions
           (source, external_id, occurred_at, amount_cents, type, description, category_id, category_label)
         VALUES ('payroll', $1, $2::date, $3, 'manual', $4, $5, $6)
         ON CONFLICT (source, external_id) DO NOTHING`,
        [`payroll-run-${run.id}-${b.key}`, run.payDate, -Math.abs(b.cents), b.desc, catId[b.label] || null, b.label]
      )
    }
    await client.query(`UPDATE payroll_runs SET posted_to_books = TRUE WHERE id = $1`, [run.id])
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
  return { posted: true, buckets: buckets.length }
}

module.exports = {
  BIZ_TZ,
  today,
  isDateStr,
  num,
  getSettings,
  updateSettings,
  listEmployees,
  getEmployeeById,
  getEmployeeByEmail,
  createEmployee,
  updateEmployee,
  listEntries,
  listAllEntries,
  listExpenses,
  listExpenseCategories,
  getExpense,
  createExpense,
  updateExpense,
  deleteExpense,
  approveExpense,
  rejectExpense,
  postExpenseToBooks,
  reverseExpenseInBooks,
  listReimbursableExpenses,
  expenseTotals,
  expenseTotalsForEmployee,
  expenseLocked,
  getEntry,
  listPayableEntries,
  upsertEntry,
  patchEntry,
  deleteEntry,
  listEntryRevisions,
  withActor,
  setEntryStatus,
  clockIn,
  clockOut,
  getOpenClock,
  ytdTotals,
  listRuns,
  listFinalizedItemRows,
  overlappingRuns,
  markRunPaymentsSent,
  markRunTaxesDeposited,
  getRunWithItems,
  previewRun,
  createRun,
  finalizeRun,
  voidRun,
  postRunToBooks,
}
