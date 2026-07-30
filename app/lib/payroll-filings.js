// Filing aggregation — pure functions, no I/O, unit-tested.
//
// Rolls FINALIZED payroll items up into the numbers the federal filings want:
//   Form 941 (quarterly), Form 940 (annual FUTA), W-2 boxes (annual, per
//   employee), and the EFTPS monthly deposit schedule.
//
// The portal still does not move money or transmit returns: these figures are
// what the owner types into EFTPS / the fillable 941 (which we pre-fill) /
// SSA Business Services Online. Every function here takes the flat rows from
// payroll-store.listFinalizedItemRows(): one row per paystub line, each row a
// hydrated payroll item plus its run's payDate / periodStart / periodEnd /
// taxesDepositedAt.
//
// Contractors (1099) are excluded from every employment-tax figure and
// surfaced separately so the owner remembers 1099-NEC season.

const { roundCents } = require('./payroll')

const SS_MEDICARE_COMBINED = { ss: 0.124, medicare: 0.029, addlMedicare: 0.009 }

// De minimis: a quarter with total 941 tax under $2,500 can be paid with the
// return instead of monthly deposits (Form 941 line 16, first checkbox).
const DE_MINIMIS_941_CENTS = 250_000

// FUTA is deposited quarterly only once the accumulated liability tops $500;
// below that it rides to the next quarter (or the annual Form 940).
const FUTA_DEPOSIT_THRESHOLD_CENTS = 50_000

const pad2 = (n) => String(n).padStart(2, '0')

const isEmployee = (r) => r.classification !== 'contractor'

// Roll a YYYY-MM-DD off a weekend to the next business day. Federal holidays
// are NOT tracked — treat every due date here as a prompt, not an authority.
function rollWeekend(iso) {
  const d = new Date(`${iso}T00:00:00Z`)
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// ── Due dates ─────────────────────────────────────────────────────────────

// Monthly-schedule EFTPS deposit for a deposit month "YYYY-MM": 15th of the
// following month, rolled off weekends.
function depositDueDate(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01` : `${y}-${pad2(m + 1)}`
  return rollWeekend(`${next}-15`)
}

// Form 941 is due the last day of the month after the quarter ends.
function filing941DueDate(year, quarter) {
  const due = {
    1: `${year}-04-30`,
    2: `${year}-07-31`,
    3: `${year}-10-31`,
    4: `${year + 1}-01-31`,
  }[quarter]
  return rollWeekend(due)
}

// Form 940 and W-2/W-3 are both due January 31 of the following year.
function annualFilingDueDate(year) {
  return rollWeekend(`${year + 1}-01-31`)
}

// ── Row bucketing ─────────────────────────────────────────────────────────

function quarterOfPayDate(payDate) {
  return Math.floor((Number(payDate.slice(5, 7)) - 1) / 3) + 1
}

function rowsInQuarter(rows, year, quarter) {
  return rows.filter((r) => Number(r.payDate.slice(0, 4)) === year && quarterOfPayDate(r.payDate) === quarter)
}

// The federal deposit liability of one paystub: withheld income tax plus BOTH
// halves of Social Security and Medicare. FUTA/SUTA are separate systems and
// never part of a 941 deposit.
function rowFederalLiabilityCents(r) {
  if (!isEmployee(r)) return 0
  return (
    (r.fedIncomeTaxCents || 0) +
    (r.employeeSsCents || 0) + (r.employerSsCents || 0) +
    (r.employeeMedicareCents || 0) + (r.employerMedicareCents || 0) +
    (r.employeeAddlMedicareCents || 0)
  )
}

// ── Form 941 ──────────────────────────────────────────────────────────────

function aggregate941({ rows, year, quarter }) {
  const qRows = rowsInQuarter(rows, year, quarter).filter(isEmployee)

  // Line 1 wants a headcount for the pay period that CONTAINS the 12th of the
  // quarter's last month — not everyone paid during the quarter.
  const twelfth = `${year}-${pad2(quarter * 3)}-12`
  const line1 = new Set(
    qRows.filter((r) => r.periodStart <= twelfth && twelfth <= r.periodEnd).map((r) => r.employeeId)
  ).size

  const sum = (fn) => qRows.reduce((t, r) => t + (fn(r) || 0), 0)
  const line2 = sum((r) => r.taxableGrossCents)
  const line3 = sum((r) => r.fedIncomeTaxCents)
  const ssWages = sum((r) => r.ssWagesCents)
  const medicareWages = sum((r) => r.taxableGrossCents)
  // Additional-Medicare WAGES were never stored, only the tax — recover them.
  // Exact when the tax is 0 (always, under ~$200k/yr), pennies off otherwise.
  const addlWages = qRows.reduce(
    (t, r) => t + roundCents((r.employeeAddlMedicareCents || 0) / SS_MEDICARE_COMBINED.addlMedicare), 0)

  const line5a2 = roundCents(ssWages * SS_MEDICARE_COMBINED.ss)
  const line5c2 = roundCents(medicareWages * SS_MEDICARE_COMBINED.medicare)
  const line5d2 = roundCents(addlWages * SS_MEDICARE_COMBINED.addlMedicare)
  const line5e = line5a2 + line5c2 + line5d2
  const line6 = line3 + line5e

  // Line 7: the form computes FICA as wages × rate, but tax was actually
  // withheld per paycheck with per-paycheck rounding. The difference is the
  // "current quarter's adjustment for fractions of cents".
  const actualFicaCents = sum((r) =>
    (r.employeeSsCents || 0) + (r.employerSsCents || 0) +
    (r.employeeMedicareCents || 0) + (r.employerMedicareCents || 0) +
    (r.employeeAddlMedicareCents || 0))
  const line7 = actualFicaCents - line5e
  const line10 = line6 + line7
  const line12 = line10

  // Monthly liability breakdown (line 16 / Part 2), keyed month-1..3 of the
  // quarter by PAY DATE (constructive receipt: liability arises when paid).
  const months = [1, 2, 3].map((i) => {
    const mm = `${year}-${pad2((quarter - 1) * 3 + i)}`
    const mRows = qRows.filter((r) => r.payDate.slice(0, 7) === mm)
    return {
      month: mm,
      liabilityCents: mRows.reduce((t, r) => t + rowFederalLiabilityCents(r), 0),
      dueDate: depositDueDate(mm),
    }
  })

  const undeposited = qRows.filter((r) => !r.taxesDepositedAt)
  return {
    year, quarter,
    filingDueDate: filing941DueDate(year, quarter),
    line1, line2, line3,
    line5a1: ssWages, line5a2,
    line5c1: medicareWages, line5c2,
    line5d1: addlWages, line5d2,
    line5e, line6, line7, line10, line12,
    // Deposits: the tracker enforces deposit-per-run, so default line 13 to
    // the liability. The UI flags the assumption when a run is unconfirmed.
    line13: line12,
    balanceDueCents: 0,
    deMinimis: line12 < DE_MINIMIS_941_CENTS,
    months,
    totalLiabilityCents: months.reduce((t, m) => t + m.liabilityCents, 0),
    runsNotDeposited: [...new Set(undeposited.map((r) => r.runId))],
    hasActivity: qRows.length > 0,
  }
}

// ── EFTPS monthly deposit schedule (whole year) ───────────────────────────

function depositSchedule({ rows, year }) {
  const byMonth = new Map()
  for (const r of rows) {
    if (Number(r.payDate.slice(0, 4)) !== year || !isEmployee(r)) continue
    const mm = r.payDate.slice(0, 7)
    const m = byMonth.get(mm) || { month: mm, liabilityCents: 0, runIds: new Set(), undepositedRunIds: new Set() }
    m.liabilityCents += rowFederalLiabilityCents(r)
    m.runIds.add(r.runId)
    if (!r.taxesDepositedAt) m.undepositedRunIds.add(r.runId)
    byMonth.set(mm, m)
  }
  return [...byMonth.values()]
    .sort((a, b) => (a.month < b.month ? -1 : 1))
    .map((m) => ({
      month: m.month,
      liabilityCents: m.liabilityCents,
      dueDate: depositDueDate(m.month),
      runIds: [...m.runIds],
      deposited: m.undepositedRunIds.size === 0,
    }))
}

// ── Form 940 (annual FUTA) ────────────────────────────────────────────────

function aggregate940({ rows, year }) {
  const yRows = rows.filter((r) => Number(r.payDate.slice(0, 4)) === year && isEmployee(r))
  const sum = (fn) => yRows.reduce((t, r) => t + (fn(r) || 0), 0)
  const line3 = sum((r) => r.taxableGrossCents)           // total payments (accountable-plan reimbursements are not payments)
  const futaWages = sum((r) => r.futaWagesCents)          // line 7: taxable FUTA wages
  const line5 = line3 - futaWages                          // payments over the $7,000 base
  const line8 = roundCents(futaWages * 0.006)              // FUTA tax after the full state credit (Texas is not a credit-reduction state)
  const accruedCents = sum((r) => r.employerFutaCents)     // what the stubs actually accrued

  const quarterly = [1, 2, 3, 4].map((q) => ({
    quarter: q,
    liabilityCents: rowsInQuarter(yRows, year, q).reduce((t, r) => t + (r.employerFutaCents || 0), 0),
  }))
  return {
    year,
    filingDueDate: annualFilingDueDate(year),
    line3, line5, line7: futaWages, line8, accruedCents,
    quarterly,
    // Under $500 for the year, FUTA is simply paid with the Form 940.
    payWithReturn: line8 < FUTA_DEPOSIT_THRESHOLD_CENTS,
    hasActivity: yRows.length > 0,
  }
}

// ── W-2 boxes (annual, per employee) ──────────────────────────────────────

function aggregateW2({ rows, year }) {
  const employees = new Map()
  const contractors = new Map()
  for (const r of rows) {
    if (Number(r.payDate.slice(0, 4)) !== year) continue
    if (!isEmployee(r)) {
      const c = contractors.get(r.employeeId) || { employeeId: r.employeeId, name: r.employeeName, paidCents: 0 }
      c.paidCents += r.grossCents || 0
      contractors.set(r.employeeId, c)
      continue
    }
    const w = employees.get(r.employeeId) || {
      employeeId: r.employeeId, name: r.employeeName,
      box1: 0, box2: 0, box3: 0, box4: 0, box5: 0, box6: 0,
    }
    w.box1 += r.taxableGrossCents || 0                     // wages, tips, other comp
    w.box2 += r.fedIncomeTaxCents || 0                     // federal income tax withheld
    w.box3 += r.ssWagesCents || 0                          // social security wages
    w.box4 += r.employeeSsCents || 0                       // social security tax withheld
    w.box5 += r.taxableGrossCents || 0                     // Medicare wages
    w.box6 += (r.employeeMedicareCents || 0) + (r.employeeAddlMedicareCents || 0)
    employees.set(r.employeeId, w)
  }
  return {
    year,
    filingDueDate: annualFilingDueDate(year),
    w2s: [...employees.values()].sort((a, b) => a.name.localeCompare(b.name)),
    // 1099-NEC is owed to any contractor paid $600+ — outside this feature's
    // scope, listed so January doesn't forget them.
    contractors: [...contractors.values()].filter((c) => c.paidCents >= 60_000),
  }
}

module.exports = {
  DE_MINIMIS_941_CENTS,
  FUTA_DEPOSIT_THRESHOLD_CENTS,
  rollWeekend,
  depositDueDate,
  filing941DueDate,
  annualFilingDueDate,
  quarterOfPayDate,
  rowFederalLiabilityCents,
  aggregate941,
  depositSchedule,
  aggregate940,
  aggregateW2,
}
