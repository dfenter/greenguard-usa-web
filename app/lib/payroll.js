// Payroll math — pure functions, no I/O, fully unit-tested.
//
// Everything monetary is an INTEGER NUMBER OF CENTS. Hours are decimal numbers
// rounded to 2 places. Nothing in here reads the database or the network, so
// `__tests__/payroll.test.js` can pin every number.
//
// Scope: single-state (Texas) in-house payroll for a handful of employees.
// Texas has no state income tax and no employee-side SUTA, so the employee
// deductions are federal income tax + FICA only.
//
// IMPORTANT — ANNUAL MAINTENANCE:
//   The constants in TAX_YEARS must be refreshed every January from
//   IRS Pub 15-T (withholding), IRS Notice/SSA press release (wage base),
//   and the TWC rate notice (SUTA experience rate). Each field below says
//   where its value comes from. When a year is missing we fall back to the
//   most recent year present and flag it on the computed result
//   (`taxYearFallback`) so the UI can warn instead of silently under-withholding.

// ── Tax-year constants ────────────────────────────────────────────────────
// Federal income-tax withholding uses the IRS Pub 15-T percentage method
// (Worksheet 1A) structure: annualize the wage, subtract the standard
// deduction, apply the annual brackets, subtract the Step-3 credits,
// divide back down by the number of pay periods.
//
// bracketsUpTo values are ANNUAL taxable amounts in cents.

const SINGLE = 'single'
const MARRIED = 'married'        // married filing jointly
const HEAD = 'head'              // head of household

const TAX_YEARS = {
  2025: {
    // IRS Rev. Proc. 2024-40 (2025 inflation adjustments)
    // NB: these are the PUB 15-T WITHHOLDING standard deductions
    // ($15,000/$30,000/$22,500). OBBBA later raised the *filing* standard
    // deduction for tax year 2025, but the IRS never reissued the 2025
    // Pub 15-T — do not "fix" these to the filing numbers.
    standardDeductionCents: { [SINGLE]: 1_500_000, [MARRIED]: 3_000_000, [HEAD]: 2_250_000 },
    brackets: {
      [SINGLE]: [
        [1_192_500, 0.10], [4_847_500, 0.12], [10_335_000, 0.22], [19_730_000, 0.24],
        [25_052_500, 0.32], [62_635_000, 0.35], [Infinity, 0.37],
      ],
      [MARRIED]: [
        [2_385_000, 0.10], [9_695_000, 0.12], [20_675_000, 0.22], [39_460_000, 0.24],
        [50_105_000, 0.32], [75_160_000, 0.35], [Infinity, 0.37],
      ],
      [HEAD]: [
        [1_700_000, 0.10], [6_485_000, 0.12], [10_335_000, 0.22], [19_730_000, 0.24],
        [25_050_000, 0.32], [62_635_000, 0.35], [Infinity, 0.37],
      ],
    },
    socialSecurityWageBaseCents: 17_610_000,   // SSA: $176,100 for 2025
    mileageRateCents: 70,                      // IRS standard rate 70.0¢/mi (2025)
    // Pub 15-T's annual schedules do NOT start at the full standard deduction:
    // single/MFS/HOH tables begin at (std ded − $8,600) and MFJ at
    // (std ded − $12,900). Cross-check: 2025 single = 15,000 − 8,600 = $6,400,
    // which is exactly where the published 10% row starts.
    allowanceBaselineCents: { [SINGLE]: 860_000, [MARRIED]: 1_290_000, [HEAD]: 860_000 },
  },
  2026: {
    // IRS Rev. Proc. 2025-32 (2026 inflation adjustments). VERIFY against the
    // 2026 Pub 15-T before the first live run of the year.
    standardDeductionCents: { [SINGLE]: 1_610_000, [MARRIED]: 3_220_000, [HEAD]: 2_415_000 },
    brackets: {
      [SINGLE]: [
        [1_240_000, 0.10], [5_040_000, 0.12], [10_570_000, 0.22], [20_177_500, 0.24],
        [25_622_500, 0.32], [64_060_000, 0.35], [Infinity, 0.37],
      ],
      [MARRIED]: [
        [2_480_000, 0.10], [10_080_000, 0.12], [21_140_000, 0.22], [40_355_000, 0.24],
        [51_245_000, 0.32], [76_870_000, 0.35], [Infinity, 0.37],
      ],
      [HEAD]: [
        [1_770_000, 0.10], [6_745_000, 0.12], [10_570_000, 0.22], [20_175_000, 0.24],
        [25_620_000, 0.32], [64_060_000, 0.35], [Infinity, 0.37],
      ],
    },
    socialSecurityWageBaseCents: 18_450_000,   // SSA: $184,500 for 2026
    mileageRateCents: 70,                      // update when the 2026 rate is published
    allowanceBaselineCents: { [SINGLE]: 860_000, [MARRIED]: 1_290_000, [HEAD]: 860_000 },
  },
}

// Rates that have not moved in decades — safe as cross-year constants.
const SS_RATE = 0.062
const MEDICARE_RATE = 0.0145
const ADDL_MEDICARE_RATE = 0.009
const ADDL_MEDICARE_THRESHOLD_CENTS = 20_000_000   // $200,000, not indexed
const FUTA_RATE = 0.006                             // 6.0% less the 5.4% state credit
const FUTA_WAGE_BASE_CENTS = 700_000                // $7,000
const TX_SUTA_WAGE_BASE_CENTS = 900_000             // $9,000 (Texas)
const TX_SUTA_DEFAULT_RATE = 0.027                  // TWC new-employer rate; override per business

const PAY_FREQUENCIES = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
}

// Nominal calendar length of one pay period, used to prorate salary when a run
// covers less than a whole period.
const NOMINAL_PERIOD_DAYS = {
  weekly: 7,
  biweekly: 14,
  semimonthly: 15,
  monthly: 30,
}

const FILING_STATUSES = [SINGLE, MARRIED, HEAD]

// Federal minimum wage. Texas adopts it by reference (Tex. Lab. Code §62.051),
// so a piece-rate week has to be topped up to this before overtime is figured.
const FEDERAL_MIN_WAGE_CENTS = 725

function taxConfig(year) {
  const years = Object.keys(TAX_YEARS).map(Number).sort((a, b) => a - b)
  if (TAX_YEARS[year]) return { config: TAX_YEARS[year], fallbackYear: null }
  // A correction run for a PAST year must use that era's tables, so fall back
  // to the newest year at or below the one asked for; only a year older than
  // everything we know falls forward.
  const below = years.filter((y) => y < year)
  const use = below.length ? below[below.length - 1] : years[0]
  return { config: TAX_YEARS[use], fallbackYear: use }
}

// ── Rounding ──────────────────────────────────────────────────────────────
// Money: half-up on the absolute value so -0.5¢ and +0.5¢ round symmetrically
// (Math.round(-0.5) === -0 in JS, which would quietly favour one direction).
function roundCents(n) {
  const sign = n < 0 ? -1 : 1
  return sign * Math.round(Math.abs(n)) || 0   // `|| 0` normalizes -0
}

function roundHours(h) {
  return Math.round((Number(h) || 0) * 100) / 100
}

// ── Hours ─────────────────────────────────────────────────────────────────

// Elapsed hours between two clock stamps. Absolute elapsed time is the
// FLSA-correct answer across a DST change: an 11pm–7am shift is 7 hours on
// spring-forward and 9 on fall-back.
function elapsedHours(clockIn, clockOut) {
  const start = new Date(clockIn).getTime()
  const end = new Date(clockOut).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  return roundHours((end - start) / 3_600_000)
}

// Hours worked for one timesheet entry.
//
// `hours` is the single source of truth — clocking out writes it (adding to
// whatever was already banked, so a split shift accumulates), and a manual
// edit overwrites it. The clock pair is kept for the record and is only used
// as a fallback for rows that somehow have a pair but no hours. Anything else
// lets the number the owner approves differ from the number payroll pays.
function entryHours(entry) {
  if (entry == null) return 0
  const breakHours = (Number(entry.break_minutes) || 0) / 60
  const stored = Number(entry.hours)
  const gross = Number.isFinite(stored) && stored > 0
    ? stored
    : (entry.clock_in && entry.clock_out ? elapsedHours(entry.clock_in, entry.clock_out) : 0)
  if (gross <= 0) return 0
  return Math.max(0, roundHours(gross - breakHours))
}

// The FLSA workweek containing `dateStr` (YYYY-MM-DD), as a YYYY-MM-DD string.
// weekStartDay: 0 = Sunday (default, matches the GreenGuard route week).
function workweekStart(dateStr, weekStartDay = 0) {
  // Accept a Date too: node-postgres hands back DATE columns as local-midnight
  // Date objects, and toISOString() on one of those can shift a day. Read the
  // local calendar fields instead of round-tripping through UTC.
  const iso = dateStr instanceof Date
    ? `${dateStr.getFullYear()}-${String(dateStr.getMonth() + 1).padStart(2, '0')}-${String(dateStr.getDate()).padStart(2, '0')}`
    : String(dateStr).slice(0, 10)
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) throw new Error(`bad work_date: ${dateStr}`)
  const shift = (d.getUTCDay() - weekStartDay + 7) % 7
  d.setUTCDate(d.getUTCDate() - shift)
  return d.toISOString().slice(0, 10)
}

// Group entries into FLSA workweeks. Overtime is a WEEKLY concept — a
// biweekly pay period with 38 hours one week and 44 the next owes 4 hours of
// overtime, not zero, so this split has to happen before any pay math.
function splitWorkweeks(entries, weekStartDay = 0) {
  const byWeek = new Map()
  for (const e of entries) {
    const wk = workweekStart(e.work_date, weekStartDay)
    if (!byWeek.has(wk)) byWeek.set(wk, { weekStart: wk, hours: 0, stops: 0, milesTenths: 0, entryIds: [] })
    const bucket = byWeek.get(wk)
    bucket.hours = roundHours(bucket.hours + entryHours(e))
    bucket.stops += Number(e.stops) || 0
    // Miles accumulate in tenths to dodge float drift across many entries.
    bucket.milesTenths += Math.round((Number(e.miles) || 0) * 10)
    if (e.id != null) bucket.entryIds.push(e.id)
  }
  return [...byWeek.values()]
    .map((w) => ({ ...w, miles: w.milesTenths / 10 }))
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1))
}

// ── Earnings ──────────────────────────────────────────────────────────────
// Overtime uses the FLSA "regular rate" method: piece pay (per-stop bonuses)
// counts toward the regular rate, so OT is a 0.5× PREMIUM on the blended
// rate rather than a flat 1.5× of the base hourly rate. With no piece pay
// this collapses to the familiar 1.5× — see the tests.
function computeEarnings({ employee, entries, weekStartDay = 0, year = new Date().getFullYear(), periodDays = null }) {
  const emp = employee || {}
  // Exempt is its OWN flag. "Salaried" does not mean exempt — a salaried
  // service tech fails the FLSA duties test at any salary and still earns
  // overtime, computed on the fluctuating-workweek half-time basis.
  const exempt = Boolean(emp.exempt)
  const otEligible = emp.ot_eligible !== false && !exempt
  const otThreshold = emp.ot_threshold_hours == null ? 40 : Math.min(40, Number(emp.ot_threshold_hours))
  const salaried = emp.pay_type === 'salary'
  const hourly = Number(emp.hourly_rate_cents) || 0
  const perStop = Number(emp.per_stop_cents) || 0
  const mileageRate = Number(emp.mileage_rate_cents) || 0
  const weeklySalaryCents = salaried ? roundCents((Number(emp.salary_annual_cents) || 0) / 52) : 0

  const weeks = splitWorkweeks(entries || [], weekStartDay).map((wk) => {
    const otHours = otEligible ? roundHours(Math.max(0, wk.hours - otThreshold)) : 0
    const regularHours = roundHours(wk.hours - otHours)

    // Straight-time earnings for the week. Salary covers all hours worked;
    // hourly + piece pay are additive.
    const wagePayCents = salaried ? weeklySalaryCents : roundCents(wk.hours * hourly)
    const piecePayCents = salaried ? 0 : roundCents(wk.stops * perStop)

    // Minimum-wage makeup: a piece-heavy (or rate-less) week has to reach
    // $7.25 × hours before overtime is figured on top of it.
    const floorCents = roundCents(wk.hours * FEDERAL_MIN_WAGE_CENTS)
    const makeupPayCents = wk.hours > 0 ? Math.max(0, floorCents - (wagePayCents + piecePayCents)) : 0

    // Blended regular rate = all straight-time earnings ÷ all hours worked.
    const straightCents = wagePayCents + piecePayCents + makeupPayCents
    const regularRateCents = wk.hours > 0 ? straightCents / wk.hours : 0
    const otPremiumCents = roundCents(otHours * regularRateCents * 0.5)

    return {
      weekStart: wk.weekStart,
      hours: wk.hours,
      regularHours,
      otHours,
      stops: wk.stops,
      miles: wk.miles,
      basePayCents: wagePayCents,
      piecePayCents,
      makeupPayCents,
      otPremiumCents,
      regularRateCents: roundCents(regularRateCents),
      entryIds: wk.entryIds,
    }
  })

  const sum = (fn) => weeks.reduce((acc, w) => acc + fn(w), 0)
  const totalHours = roundHours(sum((w) => w.hours))
  const miles = Math.round(sum((w) => w.miles) * 10) / 10

  // Exempt salaried staff earn the same amount regardless of hours, so their
  // base pay is the period slice of the annual salary rather than the sum of
  // whole weeks. Non-exempt salaried get the same base plus the OT premium.
  //
  // `periodDays` prorates it: two half-length runs over the same fortnight
  // must not each pay a full biweekly salary. Without it (a bare
  // computeEarnings call) the full period slice is assumed.
  const nominalDays = NOMINAL_PERIOD_DAYS[emp.pay_frequency] || NOMINAL_PERIOD_DAYS.biweekly
  const proration = periodDays && periodDays > 0 ? Math.min(1, periodDays / nominalDays) : 1
  const salaryPeriodCents = salaried
    ? roundCents(((Number(emp.salary_annual_cents) || 0) / periodsPerYear(emp.pay_frequency)) * proration)
    : 0

  const basePayCents = salaried ? salaryPeriodCents : sum((w) => w.basePayCents)
  const piecePayCents = sum((w) => w.piecePayCents)
  const makeupPayCents = sum((w) => w.makeupPayCents)
  const otPremiumCents = sum((w) => w.otPremiumCents)

  // Mileage paid at or below the IRS standard rate is an accountable-plan
  // reimbursement (not wages). Anything above it IS wages (Pub 15 §5).
  const { config } = taxConfig(year)
  const irsRate = config.mileageRateCents
  const reimbursementCents = roundCents(miles * Math.min(mileageRate, irsRate))
  const mileageExcessCents = roundCents(miles * Math.max(0, mileageRate - irsRate))

  return {
    weeks,
    totalHours,
    regularHours: roundHours(sum((w) => w.regularHours)),
    otHours: roundHours(sum((w) => w.otHours)),
    stops: sum((w) => w.stops),
    miles,
    basePayCents,
    piecePayCents,
    makeupPayCents,
    otPremiumCents,
    reimbursementCents,
    mileageExcessCents,
  }
}

function periodsPerYear(frequency) {
  return PAY_FREQUENCIES[frequency] || PAY_FREQUENCIES.biweekly
}

// ── Federal income tax withholding ────────────────────────────────────────

function bracketTaxCents(taxableAnnualCents, brackets) {
  let tax = 0
  let lower = 0
  for (const [ceiling, rate] of brackets) {
    if (taxableAnnualCents <= lower) break
    const slice = Math.min(taxableAnnualCents, ceiling) - lower
    tax += slice * rate
    lower = ceiling
  }
  return tax
}

// Pub 15-T percentage method, Worksheet 1A. Returns cents withheld for ONE
// pay period. `mode`:
//   'table' — the W-4 driven percentage method (default)
//   'flat'  — a flat percentage of taxable gross (some owners prefer this)
//   'none'  — no federal income tax (used for 1099 contractors)
function federalWithholdingCents({ taxableGrossCents, employee, year, payFrequency }) {
  const emp = employee || {}
  const mode = emp.fed_withholding_mode || 'table'
  const extra = Number(emp.w4_extra_withholding_cents) || 0
  if (emp.classification === 'contractor' || mode === 'none') return 0
  // Nothing to withhold from — the W-4 4(c) extra amount must not create a
  // negative paycheck on a zero-wage period.
  if (taxableGrossCents <= 0) return 0
  if (mode === 'flat') {
    const pct = Number(emp.fed_flat_pct) || 0
    return Math.max(0, roundCents(taxableGrossCents * (pct / 100)) + extra)
  }

  const { config } = taxConfig(year)
  const status = FILING_STATUSES.includes(emp.filing_status) ? emp.filing_status : SINGLE
  const periods = periodsPerYear(payFrequency || emp.pay_frequency)

  const annualWage = taxableGrossCents * periods
  const otherIncome = Number(emp.w4_other_income_cents) || 0
  const itemized = Number(emp.w4_deductions_cents) || 0
  const multipleJobs = Boolean(emp.w4_multiple_jobs)

  // The amount the published schedules subtract before the brackets apply.
  // See allowanceBaselineCents above — it is NOT the whole standard deduction.
  const tableDeduction =
    config.standardDeductionCents[status] - (config.allowanceBaselineCents?.[status] || 0)

  // W-4 Step 2 checkbox: Pub 15-T's "Step 2 Checkbox" schedules are the
  // standard schedules with every threshold and tax amount HALVED. That is
  // the same as taxing double the wage and halving the result — i.e. each of
  // two jobs withholds half the tax on the couple's combined income.
  const adjusted = annualWage + otherIncome - itemized
  const scale = multipleJobs ? 2 : 1
  const taxable = Math.max(0, scale * adjusted - tableDeduction)
  const tentative = bracketTaxCents(taxable, config.brackets[status]) / scale

  const credits = Number(emp.w4_dependents_credit_cents) || 0
  const annualTax = Math.max(0, tentative - credits)
  return Math.max(0, roundCents(annualTax / periods) + extra)
}

// ── FICA + employer taxes ─────────────────────────────────────────────────
// The YTD figures cap Social Security, additional Medicare, FUTA and SUTA at
// their wage bases. They must come from FINALIZED payroll items only.
function computeFicaCents({ taxableGrossCents, ytd = {}, year, sutaRate }) {
  const { config } = taxConfig(year)
  const ytdData = ytd || {}
  // `null` means "use the business default" (employees.suta_rate is nullable),
  // and a default parameter would not catch it.
  const rate = Number(sutaRate ?? TX_SUTA_DEFAULT_RATE)
  // Never tax a negative wage — that would mint money via negative deductions.
  const wages = Math.max(0, Number(taxableGrossCents) || 0)
  const ytdSs = Number(ytdData.ssWagesCents) || 0
  const ytdGross = Number(ytdData.grossCents) || 0   // YTD *taxable* wages
  const ytdFuta = Number(ytdData.futaWagesCents) || 0
  const ytdSuta = Number(ytdData.sutaWagesCents) || 0
  const taxableGross = wages

  const ssWages = Math.max(0, Math.min(taxableGross, config.socialSecurityWageBaseCents - ytdSs))
  const ssCents = roundCents(ssWages * SS_RATE)
  const medicareCents = roundCents(taxableGross * MEDICARE_RATE)

  // Additional Medicare: employee-only 0.9% on wages above $200k YTD.
  const overThreshold = Math.max(0, (ytdGross + taxableGross) - ADDL_MEDICARE_THRESHOLD_CENTS)
  const addlWages = Math.max(0, Math.min(taxableGross, overThreshold))
  const addlMedicareCents = roundCents(addlWages * ADDL_MEDICARE_RATE)

  const futaWages = Math.max(0, Math.min(taxableGross, FUTA_WAGE_BASE_CENTS - ytdFuta))
  const sutaWages = Math.max(0, Math.min(taxableGross, TX_SUTA_WAGE_BASE_CENTS - ytdSuta))

  return {
    ssWagesCents: ssWages,
    employeeSsCents: ssCents,
    employeeMedicareCents: medicareCents,
    employeeAddlMedicareCents: addlMedicareCents,
    employerSsCents: ssCents,                                  // employer matches SS
    employerMedicareCents: medicareCents,                      // and Medicare (never the 0.9%)
    futaWagesCents: futaWages,
    employerFutaCents: roundCents(futaWages * FUTA_RATE),
    sutaWagesCents: sutaWages,
    employerSutaCents: roundCents(sutaWages * rate),
  }
}

// ── One employee, one pay period ──────────────────────────────────────────
// Returns the full paystub shape stored in payroll_items.
function computePayrollItem({
  employee,
  entries,
  year,
  weekStartDay = 0,
  ytd,
  sutaRate,
  bonusCents = 0,
  otherDeductionCents = 0,
  otherDeductionLabel = null,
  periodDays = null,
  expenseReimbursementCents = 0,
}) {
  const emp = employee || {}
  const earnings = computeEarnings({ employee: emp, entries, weekStartDay, year, periodDays })
  // A bonus only ever adds pay; money owed back to the business is a
  // deduction. Allowing a negative here would invert every tax line.
  const bonus = Math.max(0, roundCents(Number(bonusCents) || 0))

  // Taxable gross excludes mileage paid at or below the IRS rate — that is an
  // accountable-plan reimbursement, not wages (Pub 463). Anything paid ABOVE
  // the IRS rate is wages and is included here.
  const taxableGrossCents = Math.max(0,
    earnings.basePayCents + earnings.piecePayCents + earnings.makeupPayCents +
    earnings.otPremiumCents + bonus + earnings.mileageExcessCents)
  // Approved receipts are paid back through the same check. Like mileage at or
  // below the IRS rate, an accountable-plan reimbursement is NOT wages, so it
  // adds to gross/net without touching a single tax line.
  const expenseReimb = Math.max(0, roundCents(Number(expenseReimbursementCents) || 0))
  const grossCents = taxableGrossCents + earnings.reimbursementCents + expenseReimb

  const contractor = emp.classification === 'contractor'
  const { fallbackYear } = taxConfig(year)
  // Wage-base caps are meaningless without year-to-date figures. Flag a
  // caller that forgot them rather than silently re-taxing the first $7,000.
  const ytdMissing = ytd === undefined || ytd === null

  const fed = federalWithholdingCents({ taxableGrossCents, employee: emp, year, payFrequency: emp.pay_frequency })
  const fica = contractor
    ? {
        ssWagesCents: 0, employeeSsCents: 0, employeeMedicareCents: 0, employeeAddlMedicareCents: 0,
        employerSsCents: 0, employerMedicareCents: 0, futaWagesCents: 0, employerFutaCents: 0,
        sutaWagesCents: 0, employerSutaCents: 0,
      }
    : computeFicaCents({ taxableGrossCents, ytd: ytd || {}, year, sutaRate })

  // Taxes can never exceed the paycheck. FICA is statutory so it comes first;
  // income-tax withholding (which can be inflated by a big W-4 4(c) amount)
  // absorbs the shortfall, and the amount NOT withheld is reported so the
  // stub and the 941 only ever claim tax that was really taken.
  const ficaCents = fica.employeeSsCents + fica.employeeMedicareCents + fica.employeeAddlMedicareCents
  // Withholding and deductions come out of WAGES only. An accountable-plan
  // reimbursement is the employee's own money coming back — it must not be
  // consumed by a large W-4 4(c) amount or a garnishment.
  const roomForFed = Math.max(0, taxableGrossCents - ficaCents)
  const fedWithheldCents = Math.min(fed, roomForFed)
  const withholdingShortfallCents = fed - fedWithheldCents
  const employeeTaxCents = ficaCents + fedWithheldCents

  // A voluntary deduction can never push a paycheck negative — take what's
  // left after taxes and report the shortfall so it can be carried forward.
  const requestedDed = Math.max(0, roundCents(Number(otherDeductionCents) || 0))
  const availableForDed = Math.max(0, taxableGrossCents - employeeTaxCents)
  const otherDed = Math.min(requestedDed, availableForDed)
  const deductionShortfallCents = requestedDed - otherDed

  const netCents = Math.max(0, grossCents - employeeTaxCents - otherDed)
  const employerTaxCents =
    fica.employerSsCents + fica.employerMedicareCents + fica.employerFutaCents + fica.employerSutaCents

  return {
    employeeId: emp.id ?? null,
    classification: contractor ? 'contractor' : 'employee',
    payFrequency: emp.pay_frequency || 'biweekly',
    taxYear: year,
    taxYearFallback: fallbackYear,           // non-null ⇒ tables are from another year
    ytdMissing,                              // true ⇒ wage-base caps were not applied
    periodDays,                              // null ⇒ salary not prorated
    exempt: Boolean(emp.exempt),
    weeks: earnings.weeks,
    regularHours: earnings.regularHours,
    otHours: earnings.otHours,
    totalHours: earnings.totalHours,
    stops: earnings.stops,
    miles: earnings.miles,
    basePayCents: earnings.basePayCents,
    piecePayCents: earnings.piecePayCents,
    makeupPayCents: earnings.makeupPayCents,          // minimum-wage top-up
    otPremiumCents: earnings.otPremiumCents,
    bonusCents: bonus,
    reimbursementCents: earnings.reimbursementCents,  // mileage, non-taxable
    expenseReimbursementCents: expenseReimb,          // receipts, non-taxable
    mileageExcessCents: earnings.mileageExcessCents,  // taxable (over IRS rate)
    taxableGrossCents,
    grossCents,
    fedIncomeTaxCents: fedWithheldCents,
    withholdingShortfallCents,        // requested by the W-4 but not takeable
    ...fica,
    otherDeductionCents: otherDed,
    deductionShortfallCents,
    otherDeductionLabel: otherDed > 0 ? otherDeductionLabel : null,
    employeeTaxCents,
    employerTaxCents,
    netCents,
    totalCostCents: grossCents + employerTaxCents,
    // What this person costs as LABOUR: reimbursed receipts are already an
    // expense under their own category, so they are excluded here.
    laborCostCents: grossCents - expenseReimb + employerTaxCents,
    entryIds: earnings.weeks.flatMap((w) => w.entryIds),
  }
}

// ── Helpers for the UI / API layer ────────────────────────────────────────

function fmtUsd(cents) {
  const n = (Number(cents) || 0) / 100
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

// Default pay period ending on `pay_date`, given a frequency. Used to
// pre-fill the run form; the owner can always override the dates.
function suggestPeriod(endDateStr, frequency = 'biweekly') {
  const end = new Date(`${endDateStr}T00:00:00Z`)
  if (Number.isNaN(end.getTime())) throw new Error(`bad date: ${endDateStr}`)
  const y = end.getUTCFullYear()
  const m = end.getUTCMonth()
  const d = end.getUTCDate()
  const iso = (dt) => dt.toISOString().slice(0, 10)

  // Semimonthly and monthly periods are calendar-anchored, not N days back:
  // the 1st–15th and the 16th–month-end, or the whole month.
  if (frequency === 'monthly') return { start: iso(new Date(Date.UTC(y, m, 1))), end: endDateStr }
  if (frequency === 'semimonthly') {
    return { start: iso(new Date(Date.UTC(y, m, d > 15 ? 16 : 1))), end: endDateStr }
  }
  const days = frequency === 'weekly' ? 7 : 14
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - (days - 1))
  return { start: iso(start), end: endDateStr }
}

// Federal deposit-schedule reminder: a monthly depositor owes 941 taxes by
// the 15th of the following month. Returns the due date for a pay date.
function form941DueDate(payDateStr) {
  const d = new Date(`${payDateStr}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  const due = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 15))
  return due.toISOString().slice(0, 10)
}

module.exports = {
  // constants
  TAX_YEARS,
  PAY_FREQUENCIES,
  NOMINAL_PERIOD_DAYS,
  FILING_STATUSES,
  SS_RATE,
  MEDICARE_RATE,
  ADDL_MEDICARE_RATE,
  ADDL_MEDICARE_THRESHOLD_CENTS,
  FUTA_RATE,
  FUTA_WAGE_BASE_CENTS,
  TX_SUTA_WAGE_BASE_CENTS,
  TX_SUTA_DEFAULT_RATE,
  FEDERAL_MIN_WAGE_CENTS,
  // math
  roundCents,
  roundHours,
  entryHours,
  elapsedHours,
  workweekStart,
  splitWorkweeks,
  computeEarnings,
  federalWithholdingCents,
  computeFicaCents,
  computePayrollItem,
  periodsPerYear,
  taxConfig,
  // helpers
  fmtUsd,
  suggestPeriod,
  form941DueDate,
}
