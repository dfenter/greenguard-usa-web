const {
  roundCents, roundHours, entryHours, elapsedHours, workweekStart, splitWorkweeks,
  computeEarnings, federalWithholdingCents, computeFicaCents, computePayrollItem,
  periodsPerYear, taxConfig, suggestPeriod, form941DueDate,
  SS_RATE, MEDICARE_RATE, FUTA_WAGE_BASE_CENTS, TX_SUTA_WAGE_BASE_CENTS,
  ADDL_MEDICARE_THRESHOLD_CENTS, TAX_YEARS, FEDERAL_MIN_WAGE_CENTS,
  TX_SUTA_DEFAULT_RATE,
} = require('../lib/payroll')

// $22.50/h non-exempt tech — the shape this system was built for.
const TECH = {
  id: 1,
  classification: 'employee',
  pay_type: 'hourly',
  pay_frequency: 'biweekly',
  hourly_rate_cents: 2250,
  per_stop_cents: 0,
  mileage_rate_cents: 0,
  ot_eligible: true,
  ot_threshold_hours: 40,
  filing_status: 'single',
  fed_withholding_mode: 'table',
}

const day = (date, hours, extra = {}) => ({ id: extra.id ?? Math.round(Math.random() * 1e6), work_date: date, hours, break_minutes: 0, stops: 0, miles: 0, ...extra })

// ── rounding ──────────────────────────────────────────────────────────────

describe('roundCents', () => {
  test('rounds half away from zero symmetrically', () => {
    expect(roundCents(10.5)).toBe(11)
    expect(roundCents(-10.5)).toBe(-11)
    expect(roundCents(0.4)).toBe(0)
    expect(roundCents(0)).toBe(0)
  })
  test('roundHours keeps 2 decimals', () => {
    expect(roundHours(7.129)).toBe(7.13)
    expect(roundHours('8')).toBe(8)
  })
})

// ── entryHours ────────────────────────────────────────────────────────────

describe('entryHours', () => {
  // `hours` is authoritative: clocking out writes it, a manual edit replaces
  // it, and both paths clear/refresh the other. If the clock pair could win,
  // the number the owner approves would not be the number payroll pays.
  test('the stored hours win over a stale clock pair', () => {
    const e = { clock_in: '2026-07-20T13:00:00Z', clock_out: '2026-07-20T21:30:00Z', break_minutes: 30, hours: 8.5 }
    expect(entryHours(e)).toBe(8) // 8.5 banked − 0.5 h break
  })
  test('a clock pair with no banked hours is the fallback', () => {
    const e = { clock_in: '2026-07-20T13:00:00Z', clock_out: '2026-07-20T21:30:00Z', break_minutes: 30, hours: null }
    expect(entryHours(e)).toBe(8)
  })
  test('a split day accumulates into hours (two shifts, one row)', () => {
    // clockOut ADDS elapsed time to whatever is banked, so 5 h + 3 h = 8 h.
    expect(entryHours({ hours: 8, break_minutes: 0, clock_in: null, clock_out: null })).toBe(8)
  })
  test('manual hours used when there is no clock pair', () => {
    expect(entryHours({ hours: 7.5, break_minutes: 0 })).toBe(7.5)
    expect(entryHours({ hours: '6.25', break_minutes: 15 })).toBe(6)
  })
  test('an open clock (no clock_out) contributes nothing yet', () => {
    expect(entryHours({ clock_in: '2026-07-20T13:00:00Z', clock_out: null })).toBe(0)
  })
  test('garbage and negatives clamp to zero', () => {
    expect(entryHours(null)).toBe(0)
    expect(entryHours({ hours: -5 })).toBe(0)
    expect(entryHours({ hours: 0.25, break_minutes: 60 })).toBe(0)
    expect(entryHours({ clock_in: 'nope', clock_out: 'also nope' })).toBe(0)
  })
  test('a shift that crosses midnight counts the real elapsed time', () => {
    // 4:00pm → 1:30am Chicago = 21:00Z → 06:30Z next day
    expect(elapsedHours('2026-07-20T21:00:00Z', '2026-07-21T06:30:00Z')).toBe(9.5)
  })
  test('a shift spanning the spring-forward DST jump counts real elapsed time', () => {
    // 2026-03-08 Chicago: 2am → 3am. 1:00am CST (07:00Z) → 9:00am CDT (14:00Z)
    // is 7 real hours even though the wall clock advanced 8.
    expect(elapsedHours('2026-03-08T07:00:00Z', '2026-03-08T14:00:00Z')).toBe(7)
  })
  test('elapsedHours refuses reversed or junk stamps', () => {
    expect(elapsedHours('2026-07-20T10:00:00Z', '2026-07-20T09:00:00Z')).toBe(0)
    expect(elapsedHours('nope', 'also nope')).toBe(0)
  })
})

// ── workweeks ─────────────────────────────────────────────────────────────

describe('workweekStart', () => {
  test('Sunday-start weeks', () => {
    expect(workweekStart('2026-07-22')).toBe('2026-07-19') // Wed → Sun
    expect(workweekStart('2026-07-19')).toBe('2026-07-19') // Sun → itself
    expect(workweekStart('2026-07-25')).toBe('2026-07-19') // Sat → same week
  })
  test('Monday-start weeks', () => {
    expect(workweekStart('2026-07-19', 1)).toBe('2026-07-13') // Sun belongs to prior week
    expect(workweekStart('2026-07-20', 1)).toBe('2026-07-20')
  })
  test('rejects a bad date', () => {
    expect(() => workweekStart('not-a-date')).toThrow()
  })
  test('tolerates a Date (node-postgres hands back local-midnight Dates)', () => {
    expect(workweekStart(new Date(2026, 6, 22))).toBe('2026-07-19')
  })
})

describe('splitWorkweeks', () => {
  test('buckets by week and sums hours, stops and miles without float drift', () => {
    const weeks = splitWorkweeks([
      day('2026-07-20', 8, { stops: 5, miles: 40.1 }),
      day('2026-07-21', 8, { stops: 6, miles: 38.2 }),
      day('2026-07-27', 8, { stops: 4, miles: 12.3 }),
    ])
    expect(weeks).toHaveLength(2)
    expect(weeks[0].weekStart).toBe('2026-07-19')
    expect(weeks[0].hours).toBe(16)
    expect(weeks[0].stops).toBe(11)
    expect(weeks[0].miles).toBe(78.3)
    expect(weeks[1].weekStart).toBe('2026-07-26')
  })
})

// ── overtime ──────────────────────────────────────────────────────────────

describe('computeEarnings — FLSA overtime', () => {
  test('44 hours in one week ⇒ 4 OT hours at 1.5× total', () => {
    const entries = [
      day('2026-07-20', 9), day('2026-07-21', 9), day('2026-07-22', 9),
      day('2026-07-23', 9), day('2026-07-24', 8),
    ]
    const e = computeEarnings({ employee: TECH, entries })
    expect(e.totalHours).toBe(44)
    expect(e.regularHours).toBe(40)
    expect(e.otHours).toBe(4)
    // 44 × 22.50 straight time + 4 × 11.25 premium = 990 + 45 = 1035
    expect(e.basePayCents).toBe(99000)
    expect(e.otPremiumCents).toBe(4500)
    expect(e.basePayCents + e.otPremiumCents).toBe(103500)
    // Cross-check against the familiar formula.
    expect(40 * 2250 + 4 * 2250 * 1.5).toBe(103500)
  })

  test('OT is per workweek, NOT per pay period (38 + 44 owes 4 OT hours)', () => {
    const entries = [
      day('2026-07-20', 9.5), day('2026-07-21', 9.5), day('2026-07-22', 9.5), day('2026-07-23', 9.5),
      day('2026-07-27', 11), day('2026-07-28', 11), day('2026-07-29', 11), day('2026-07-30', 11),
    ]
    const e = computeEarnings({ employee: TECH, entries })
    expect(e.totalHours).toBe(82)
    expect(e.otHours).toBe(4)      // only week 2 went over 40
    expect(e.regularHours).toBe(78)
  })

  test('80 hours across two 40-hour weeks owes no overtime', () => {
    const entries = [
      ...[20, 21, 22, 23, 24].map((d) => day(`2026-07-${d}`, 8)),
      ...[27, 28, 29, 30, 31].map((d) => day(`2026-07-${d}`, 8)),
    ]
    const e = computeEarnings({ employee: TECH, entries })
    expect(e.otHours).toBe(0)
    expect(e.basePayCents).toBe(80 * 2250)
  })

  test('per-stop pay raises the OT premium via the blended regular rate', () => {
    const emp = { ...TECH, per_stop_cents: 500 }
    const entries = [
      day('2026-07-20', 11, { stops: 6 }), day('2026-07-21', 11, { stops: 6 }),
      day('2026-07-22', 11, { stops: 6 }), day('2026-07-23', 11, { stops: 6 }),
    ]
    const e = computeEarnings({ employee: emp, entries })
    expect(e.totalHours).toBe(44)
    expect(e.otHours).toBe(4)
    expect(e.piecePayCents).toBe(24 * 500)            // $120 of stop pay
    // blended rate = (44×22.50 + 120) / 44 = $25.227…/h ⇒ premium 4 × half that
    const blended = (44 * 2250 + 12000) / 44
    expect(e.otPremiumCents).toBe(Math.round(4 * blended * 0.5))
    expect(e.otPremiumCents).toBeGreaterThan(4500)     // strictly more than rate-only OT
  })

  test('a SALARIED NON-EXEMPT employee still earns an overtime premium', () => {
    // "Salaried" is not "exempt" — a service tech fails the FLSA duties test
    // at any salary, so 55 hours owes 15 hours of half-time premium.
    // Default (no fluctuating-workweek agreement): the salary is treated as
    // covering 40 hours, so hours 41-55 are owed a FULL time-and-a-half on
    // that rate — the salary never paid for them.
    const salaried = { ...TECH, pay_type: 'salary', salary_annual_cents: 5_200_000, pay_frequency: 'biweekly', exempt: false }
    const entries = [day('2026-07-20', 11), day('2026-07-21', 11), day('2026-07-22', 11), day('2026-07-23', 11), day('2026-07-24', 11)]
    const e = computeEarnings({ employee: salaried, entries, year: 2026 })
    expect(e.otHours).toBe(15)
    const weekly = Math.round(5_200_000 / 52)          // $1,000/week
    expect(e.otPremiumCents).toBe(Math.round(15 * (weekly / 40) * 1.5))   // 15 × $37.50
    expect(e.basePayCents).toBe(Math.round(5_200_000 / 26))
  })

  test('the half-time premium applies ONLY with an explicit fluctuating-workweek agreement', () => {
    // FWW requires a fixed salary, genuinely fluctuating hours and a clear
    // mutual understanding, so it takes a deliberate flag — it must never be
    // the silent default, because it pays a third of the standard premium.
    const base = { ...TECH, pay_type: 'salary', salary_annual_cents: 5_200_000, pay_frequency: 'biweekly', exempt: false }
    const entries = [day('2026-07-20', 11), day('2026-07-21', 11), day('2026-07-22', 11), day('2026-07-23', 11), day('2026-07-24', 11)]
    const weekly = Math.round(5_200_000 / 52)
    const fww = computeEarnings({ employee: { ...base, fww: true }, entries, year: 2026 })
    expect(fww.otPremiumCents).toBe(Math.round(15 * (weekly / 55) * 0.5))
    const standard = computeEarnings({ employee: base, entries, year: 2026 })
    expect(standard.otPremiumCents).toBeGreaterThan(fww.otPremiumCents)
  })

  test('an EXEMPT employee accrues no overtime and is paid per period', () => {
    const salaried = { ...TECH, pay_type: 'salary', salary_annual_cents: 5_200_000, pay_frequency: 'biweekly', exempt: true }
    const entries = [day('2026-07-20', 12), day('2026-07-21', 12), day('2026-07-22', 12), day('2026-07-23', 12), day('2026-07-24', 12)]
    const e = computeEarnings({ employee: salaried, entries, year: 2026 })
    expect(e.otHours).toBe(0)
    expect(e.otPremiumCents).toBe(0)
    expect(e.totalHours).toBe(60)                       // hours still tracked
    expect(e.basePayCents).toBe(Math.round(5_200_000 / 26))
  })

  test('minimum wage: a piece-rate week is topped up to $7.25/h', () => {
    const pieceworker = { ...TECH, hourly_rate_cents: 0, per_stop_cents: 2000 }
    const entries = [day('2026-07-20', 8, { stops: 2 }), day('2026-07-21', 8, { stops: 2 }),
                     day('2026-07-22', 8, { stops: 2 }), day('2026-07-23', 8, { stops: 2 }),
                     day('2026-07-24', 8, { stops: 2 })]
    const e = computeEarnings({ employee: pieceworker, entries, year: 2026 })
    expect(e.piecePayCents).toBe(10 * 2000)                              // $200 of stop pay
    expect(e.makeupPayCents).toBe(40 * FEDERAL_MIN_WAGE_CENTS - 20000)   // topped up to $290
    expect(e.piecePayCents + e.makeupPayCents).toBe(40 * FEDERAL_MIN_WAGE_CENTS)
  })

  test('minimum wage makeup raises the overtime regular rate too', () => {
    const pieceworker = { ...TECH, hourly_rate_cents: 0, per_stop_cents: 2000 }
    const entries = [day('2026-07-20', 11, { stops: 2 }), day('2026-07-21', 11, { stops: 2 }),
                     day('2026-07-22', 11, { stops: 2 }), day('2026-07-23', 11, { stops: 2 })]
    const e = computeEarnings({ employee: pieceworker, entries, year: 2026 })
    expect(e.otHours).toBe(4)
    // Floor is 44 × $7.25 = $319; regular rate is exactly the minimum wage.
    expect(e.otPremiumCents).toBe(Math.round(4 * FEDERAL_MIN_WAGE_CENTS * 0.5))
  })

  test('no makeup when the hourly rate already clears the minimum', () => {
    const e = computeEarnings({ employee: TECH, entries: [day('2026-07-20', 8)], year: 2026 })
    expect(e.makeupPayCents).toBe(0)
  })

  test('mileage above the IRS rate is split out as taxable wages', () => {
    const generous = { ...TECH, mileage_rate_cents: 85 }   // IRS rate is 70¢
    const e = computeEarnings({ employee: generous, entries: [day('2026-07-20', 8, { miles: 100 })], year: 2026 })
    expect(e.reimbursementCents).toBe(100 * 70)     // non-taxable portion
    expect(e.mileageExcessCents).toBe(100 * 15)     // taxable excess
  })

  test('mileage at or below the IRS rate is all non-taxable', () => {
    const e = computeEarnings({ employee: { ...TECH, mileage_rate_cents: 65 }, entries: [day('2026-07-20', 8, { miles: 100 })], year: 2026 })
    expect(e.reimbursementCents).toBe(6500)
    expect(e.mileageExcessCents).toBe(0)
  })

  test('an employee with no rate earns nothing rather than NaN', () => {
    const e = computeEarnings({ employee: { pay_type: 'hourly' }, entries: [day('2026-07-20', 8)] })
    expect(e.basePayCents).toBe(0)
    expect(e.otPremiumCents).toBe(0)
    expect(Number.isNaN(e.basePayCents)).toBe(false)
  })

  test('mileage reimbursement uses the per-employee rate', () => {
    const emp = { ...TECH, mileage_rate_cents: 70 }
    const e = computeEarnings({ employee: emp, entries: [day('2026-07-20', 8, { miles: 120.5 })] })
    expect(e.reimbursementCents).toBe(Math.round(120.5 * 70))
  })

  test('no entries ⇒ all zeros, no crash', () => {
    const e = computeEarnings({ employee: TECH, entries: [] })
    expect(e).toMatchObject({ totalHours: 0, otHours: 0, basePayCents: 0, reimbursementCents: 0 })
  })
})

// ── FICA ──────────────────────────────────────────────────────────────────

describe('computeFicaCents', () => {
  const gross = 200_000 // $2,000

  test('standard rates, employer matches', () => {
    const f = computeFicaCents({ taxableGrossCents: gross, year: 2026 })
    expect(f.employeeSsCents).toBe(Math.round(gross * SS_RATE))
    expect(f.employeeMedicareCents).toBe(Math.round(gross * MEDICARE_RATE))
    expect(f.employerSsCents).toBe(f.employeeSsCents)
    expect(f.employerMedicareCents).toBe(f.employeeMedicareCents)
    expect(f.employeeAddlMedicareCents).toBe(0)
  })

  test('Social Security stops at the wage base but Medicare does not', () => {
    const base = TAX_YEARS[2026].socialSecurityWageBaseCents
    const f = computeFicaCents({ taxableGrossCents: gross, year: 2026, ytd: { ssWagesCents: base - 50_000 } })
    expect(f.ssWagesCents).toBe(50_000)                       // only $500 of the $2,000 is taxable
    expect(f.employeeSsCents).toBe(Math.round(50_000 * SS_RATE))
    expect(f.employeeMedicareCents).toBe(Math.round(gross * MEDICARE_RATE)) // uncapped
  })

  test('past the wage base, Social Security is zero and never negative', () => {
    const base = TAX_YEARS[2026].socialSecurityWageBaseCents
    const f = computeFicaCents({ taxableGrossCents: gross, year: 2026, ytd: { ssWagesCents: base + 500_000 } })
    expect(f.ssWagesCents).toBe(0)
    expect(f.employeeSsCents).toBe(0)
  })

  test('additional Medicare kicks in only on wages above $200k YTD', () => {
    const justUnder = computeFicaCents({ taxableGrossCents: gross, year: 2026, ytd: { grossCents: ADDL_MEDICARE_THRESHOLD_CENTS - gross } })
    expect(justUnder.employeeAddlMedicareCents).toBe(0)

    const straddling = computeFicaCents({ taxableGrossCents: gross, year: 2026, ytd: { grossCents: ADDL_MEDICARE_THRESHOLD_CENTS - 50_000 } })
    expect(straddling.employeeAddlMedicareCents).toBe(Math.round(150_000 * 0.009))

    const fullyOver = computeFicaCents({ taxableGrossCents: gross, year: 2026, ytd: { grossCents: ADDL_MEDICARE_THRESHOLD_CENTS + 100_000 } })
    expect(fullyOver.employeeAddlMedicareCents).toBe(Math.round(gross * 0.009))
    // The 0.9% is employee-only — the employer never matches it.
    expect(fullyOver.employerMedicareCents).toBe(Math.round(gross * MEDICARE_RATE))
  })

  test('FUTA caps at $7,000 and SUTA at $9,000 of wages per year', () => {
    const first = computeFicaCents({ taxableGrossCents: 500_000, year: 2026, sutaRate: 0.027 })
    expect(first.futaWagesCents).toBe(500_000)
    expect(first.employerFutaCents).toBe(Math.round(500_000 * 0.006))
    expect(first.employerSutaCents).toBe(Math.round(500_000 * 0.027))

    const straddle = computeFicaCents({
      taxableGrossCents: 500_000, year: 2026, sutaRate: 0.027,
      ytd: { futaWagesCents: FUTA_WAGE_BASE_CENTS - 100_000, sutaWagesCents: TX_SUTA_WAGE_BASE_CENTS - 200_000 },
    })
    expect(straddle.futaWagesCents).toBe(100_000)
    expect(straddle.sutaWagesCents).toBe(200_000)

    const done = computeFicaCents({
      taxableGrossCents: 500_000, year: 2026, sutaRate: 0.027,
      ytd: { futaWagesCents: FUTA_WAGE_BASE_CENTS, sutaWagesCents: TX_SUTA_WAGE_BASE_CENTS },
    })
    expect(done.employerFutaCents).toBe(0)
    expect(done.employerSutaCents).toBe(0)
  })
})

// ── federal withholding ───────────────────────────────────────────────────

describe('federalWithholdingCents', () => {
  test('a wage below the annualized standard deduction withholds nothing', () => {
    const w = federalWithholdingCents({ taxableGrossCents: 20_000, employee: TECH, year: 2026, payFrequency: 'biweekly' })
    expect(w).toBe(0)
  })

  test('single, biweekly $1,800 — full Worksheet 1A, both subtractions', () => {
    const gross = 180_000
    const w = federalWithholdingCents({ taxableGrossCents: gross, employee: TECH, year: 2026, payFrequency: 'biweekly' })
    // IRS Pub 15-T Worksheet 1A — https://www.irs.gov/publications/p15t
    // Step 1: annualize $1,800 x 26 = $46,800
    //         line 1g subtracts $8,600 (Step 2 box NOT checked)
    //         => Adjusted Annual Wage Amount $38,200
    // Step 2: the 2026 Single standard schedule starts taxing at $7,500
    //         $38,200 − $7,500 = $30,700 into the brackets
    //           10% of the first $12,400          = $1,240
    //           12% of the remaining $18,300      = $2,196
    //         => $3,436/yr ÷ 26 = $132.15
    // Cross-check: 8,600 + 7,500 = 16,100 = the full 2026 single standard
    // deduction, so this must equal brackets($46,800 − $16,100)/26.
    const annual = 1_240_00 + 2_196_00
    expect(w).toBe(Math.round(annual / 26))
    expect(w).toBe(13_215)
  })

  test('the derived table offsets match the published Pub 15-T schedule starts', () => {
    // These are the STARTS of the published rows; Worksheet 1A line 1g takes
    // the rest of the standard deduction out before the table is applied.
    // The annual percentage-method tables do NOT begin at the full standard
    // deduction. Published first-bracket starts, 2025: single $6,400,
    // married $17,100, head of household $13,900. If these drift, withholding
    // is wrong for everyone — this is the canary for the whole method.
    const t = TAX_YEARS[2025]
    expect(t.standardDeductionCents.single - t.allowanceBaselineCents.single).toBe(640_000)
    expect(t.standardDeductionCents.married - t.allowanceBaselineCents.married).toBe(1_710_000)
    expect(t.standardDeductionCents.head - t.allowanceBaselineCents.head).toBe(1_390_000)
    // 2026: $16,100/$32,200/$24,150 less the same baselines.
    const u = TAX_YEARS[2026]
    expect(u.standardDeductionCents.single - u.allowanceBaselineCents.single).toBe(750_000)
    expect(u.standardDeductionCents.married - u.allowanceBaselineCents.married).toBe(1_930_000)
    expect(u.standardDeductionCents.head - u.allowanceBaselineCents.head).toBe(1_555_000)
  })

  // NOTE: this test previously asserted 19_585 and called it "the published
  // ~$195.85". That figure was never published anywhere — it was the output of
  // the implementation at the time, which omitted the Worksheet 1A line 1g
  // allowance. Labelling it "published" gave an unverified number the authority
  // of an IRS citation and actively defended the bug through two reviews.
  // Any test naming a figure "published" must carry its source URL.
  test('2026 single, biweekly $2,000 — Pub 15-T Worksheet 1A', () => {
    // https://www.irs.gov/publications/p15t
    // $2,000 x 26 = $52,000 annualized; − $8,600 (line 1g) = $43,400 adjusted;
    // − $7,500 (2026 Single table start) = $35,900 into the brackets:
    //   10% x $12,400 = $1,240 ; 12% x $23,500 = $2,820  => $4,060/yr
    // $4,060 ÷ 26 = $156.15
    const w = federalWithholdingCents({ taxableGrossCents: 200_000, employee: TECH, year: 2026, payFrequency: 'biweekly' })
    expect(w).toBe(15_615)
  })

  // The regression guard that would have caught this immediately. Every other
  // withholding test here is property-based (monotonic, married < single,
  // credits reduce) and is INVARIANT under a uniform offset — omitting a fixed
  // $8,600 leaves them all green. This one is not: it pins the total amount
  // subtracted before the brackets to the full standard deduction.
  test('IDENTITY: line 1g + table start must equal the full standard deduction', () => {
    for (const year of [2025, 2026]) {
      for (const status of ['single', 'married', 'head']) {
        const { standardDeductionCents, brackets } = TAX_YEARS[year]
        for (const annual of [2_000_000, 4_160_000, 7_800_000, 25_000_000]) {
          const gross = Math.round(annual / 26)
          const got = federalWithholdingCents({
            taxableGrossCents: gross,
            employee: { ...TECH, filing_status: status },
            year,
            payFrequency: 'biweekly',
          })
          // Annual liability on wage less the FULL standard deduction.
          let taxable = Math.max(0, gross * 26 - standardDeductionCents[status])
          let tax = 0
          let prev = 0
          for (const [cap, rate] of brackets[status]) {
            if (taxable <= prev) break
            tax += (Math.min(taxable, cap) - prev) * rate
            prev = cap
          }
          expect(got).toBe(Math.round(tax / 26))
        }
      }
    }
  })

  test('married filing jointly withholds less than single on the same wage', () => {
    const gross = 300_000
    const single = federalWithholdingCents({ taxableGrossCents: gross, employee: TECH, year: 2026 })
    const married = federalWithholdingCents({ taxableGrossCents: gross, employee: { ...TECH, filing_status: 'married' }, year: 2026 })
    expect(married).toBeLessThan(single)
  })

  test('withholding rises monotonically with pay', () => {
    const amounts = [100_000, 150_000, 250_000, 400_000, 1_000_000]
    const withheld = amounts.map((g) => federalWithholdingCents({ taxableGrossCents: g, employee: TECH, year: 2026 }))
    for (let i = 1; i < withheld.length; i++) expect(withheld[i]).toBeGreaterThan(withheld[i - 1])
  })

  test('dependents credit reduces withholding, extra withholding adds to it', () => {
    const base = federalWithholdingCents({ taxableGrossCents: 250_000, employee: TECH, year: 2026 })
    const withKids = federalWithholdingCents({ taxableGrossCents: 250_000, employee: { ...TECH, w4_dependents_credit_cents: 400_000 }, year: 2026 })
    expect(withKids).toBeLessThan(base)
    const withExtra = federalWithholdingCents({ taxableGrossCents: 250_000, employee: { ...TECH, w4_extra_withholding_cents: 5_000 }, year: 2026 })
    expect(withExtra).toBe(base + 5_000)
  })

  test('a large dependents credit floors at zero, never negative', () => {
    const w = federalWithholdingCents({ taxableGrossCents: 150_000, employee: { ...TECH, w4_dependents_credit_cents: 999_999_00 }, year: 2026 })
    expect(w).toBe(0)
  })

  test('W-4 Step 2 checkbox withholds more than the unchecked table', () => {
    const plain = federalWithholdingCents({ taxableGrossCents: 250_000, employee: TECH, year: 2026 })
    const twoJobs = federalWithholdingCents({ taxableGrossCents: 250_000, employee: { ...TECH, w4_multiple_jobs: true }, year: 2026 })
    expect(twoJobs).toBeGreaterThan(plain)
  })

  test('flat mode and none mode', () => {
    const flat = federalWithholdingCents({ taxableGrossCents: 200_000, employee: { ...TECH, fed_withholding_mode: 'flat', fed_flat_pct: 12 }, year: 2026 })
    expect(flat).toBe(24_000)
    const none = federalWithholdingCents({ taxableGrossCents: 200_000, employee: { ...TECH, fed_withholding_mode: 'none' }, year: 2026 })
    expect(none).toBe(0)
  })

  test('contractors never have income tax withheld', () => {
    const w = federalWithholdingCents({ taxableGrossCents: 500_000, employee: { ...TECH, classification: 'contractor' }, year: 2026 })
    expect(w).toBe(0)
  })

  test('pay frequency changes the per-period amount but not the annual total', () => {
    const weekly = federalWithholdingCents({ taxableGrossCents: 100_000, employee: { ...TECH, pay_frequency: 'weekly' }, year: 2026, payFrequency: 'weekly' })
    const biweekly = federalWithholdingCents({ taxableGrossCents: 200_000, employee: TECH, year: 2026, payFrequency: 'biweekly' })
    expect(Math.abs(weekly * 52 - biweekly * 26)).toBeLessThanOrEqual(52)
  })
})

describe('taxConfig fallback', () => {
  test('a known year is exact', () => {
    expect(taxConfig(2026).fallbackYear).toBeNull()
  })
  test('an unknown future year falls back to the latest table and says so', () => {
    const { config, fallbackYear } = taxConfig(2031)
    expect(fallbackYear).toBe(Math.max(...Object.keys(TAX_YEARS).map(Number)))
    expect(config.socialSecurityWageBaseCents).toBeGreaterThan(0)
  })
})

// ── full paystub ──────────────────────────────────────────────────────────

describe('computePayrollItem', () => {
  const entries = [
    day('2026-07-20', 8, { id: 1, miles: 60, stops: 5 }),
    day('2026-07-21', 8, { id: 2, miles: 55, stops: 6 }),
    day('2026-07-22', 8, { id: 3, miles: 61, stops: 5 }),
    day('2026-07-23', 8, { id: 4, miles: 48, stops: 4 }),
    day('2026-07-24', 8, { id: 5, miles: 52, stops: 5 }),
  ]
  const emp = { ...TECH, mileage_rate_cents: 70 }

  test('net = gross − employee taxes − other deductions, and the parts add up', () => {
    const item = computePayrollItem({ employee: emp, entries, year: 2026, ytd: {}, sutaRate: 0.027 })
    expect(item.totalHours).toBe(40)
    expect(item.otHours).toBe(0)
    expect(item.taxableGrossCents).toBe(40 * 2250)
    expect(item.reimbursementCents).toBe(Math.round(276 * 70))
    expect(item.grossCents).toBe(item.taxableGrossCents + item.reimbursementCents)
    expect(item.employeeTaxCents).toBe(
      item.fedIncomeTaxCents + item.employeeSsCents + item.employeeMedicareCents + item.employeeAddlMedicareCents
    )
    expect(item.netCents).toBe(item.grossCents - item.employeeTaxCents - item.otherDeductionCents)
    expect(item.totalCostCents).toBe(item.grossCents + item.employerTaxCents)
    expect(item.entryIds.sort()).toEqual([1, 2, 3, 4, 5])
  })

  test('mileage reimbursement is NOT taxed', () => {
    const withMiles = computePayrollItem({ employee: emp, entries, year: 2026 })
    const noMiles = computePayrollItem({ employee: { ...emp, mileage_rate_cents: 0 }, entries, year: 2026 })
    expect(withMiles.reimbursementCents).toBeGreaterThan(0)
    expect(withMiles.taxableGrossCents).toBe(noMiles.taxableGrossCents)
    expect(withMiles.fedIncomeTaxCents).toBe(noMiles.fedIncomeTaxCents)
    expect(withMiles.employeeSsCents).toBe(noMiles.employeeSsCents)
    // …but it does reach the employee's pocket.
    expect(withMiles.netCents - noMiles.netCents).toBe(withMiles.reimbursementCents)
  })

  test('a bonus is taxable wages', () => {
    const plain = computePayrollItem({ employee: emp, entries, year: 2026 })
    const bonused = computePayrollItem({ employee: emp, entries, year: 2026, bonusCents: 25_000 })
    expect(bonused.taxableGrossCents).toBe(plain.taxableGrossCents + 25_000)
    expect(bonused.employeeSsCents).toBeGreaterThan(plain.employeeSsCents)
  })

  test('other deductions reduce net but not taxable wages', () => {
    const item = computePayrollItem({ employee: emp, entries, year: 2026, otherDeductionCents: 5_000, otherDeductionLabel: 'uniform' })
    const plain = computePayrollItem({ employee: emp, entries, year: 2026 })
    expect(item.taxableGrossCents).toBe(plain.taxableGrossCents)
    expect(item.netCents).toBe(plain.netCents - 5_000)
    expect(item.otherDeductionLabel).toBe('uniform')
  })

  test('a 1099 contractor gets gross with no withholding and no employer tax', () => {
    const item = computePayrollItem({ employee: { ...emp, classification: 'contractor' }, entries, year: 2026 })
    expect(item.fedIncomeTaxCents).toBe(0)
    expect(item.employeeTaxCents).toBe(0)
    expect(item.employerTaxCents).toBe(0)
    expect(item.netCents).toBe(item.grossCents)
    expect(item.classification).toBe('contractor')
  })

  test('overtime week: employee owes FICA on the premium too', () => {
    const otEntries = [...entries, day('2026-07-25', 6, { id: 6 })]
    const item = computePayrollItem({ employee: emp, entries: otEntries, year: 2026 })
    expect(item.otHours).toBe(6)
    expect(item.taxableGrossCents).toBe(46 * 2250 + Math.round(6 * 2250 * 0.5))
    expect(item.employeeSsCents).toBe(Math.round(item.taxableGrossCents * SS_RATE))
  })

  test('an unknown tax year is flagged so the UI can warn', () => {
    const item = computePayrollItem({ employee: emp, entries, year: 2035 })
    expect(item.taxYearFallback).toBe(Math.max(...Object.keys(TAX_YEARS).map(Number)))
  })

  test('zero-hours period produces a clean zero stub', () => {
    const item = computePayrollItem({ employee: emp, entries: [], year: 2026 })
    expect(item.grossCents).toBe(0)
    expect(item.netCents).toBe(0)
    expect(item.employerTaxCents).toBe(0)
  })
})

// ── helpers ───────────────────────────────────────────────────────────────

describe('period helpers', () => {
  test('periodsPerYear', () => {
    expect(periodsPerYear('weekly')).toBe(52)
    expect(periodsPerYear('biweekly')).toBe(26)
    expect(periodsPerYear('semimonthly')).toBe(24)
    expect(periodsPerYear('monthly')).toBe(12)
    expect(periodsPerYear('nonsense')).toBe(26)
  })

  test('suggestPeriod covers whole days ending on the given date', () => {
    expect(suggestPeriod('2026-07-25', 'biweekly')).toEqual({ start: '2026-07-12', end: '2026-07-25' })
    expect(suggestPeriod('2026-07-25', 'weekly')).toEqual({ start: '2026-07-19', end: '2026-07-25' })
  })

  test('941 deposits are due the 15th, rolled off a weekend', () => {
    // 2026-08-15 is a Saturday, so a monthly depositor's date is Monday 17th.
    expect(form941DueDate('2026-07-31')).toBe('2026-08-17')
    expect(form941DueDate('2026-12-04')).toBe('2027-01-15')   // a Friday
    expect(form941DueDate('garbage')).toBeNull()
  })
})

// ── regressions from the adversarial review ───────────────────────────────

describe('W-4 Step 2 checkbox (Pub 15-T half-bracket schedules)', () => {
  // The Step 2 tables are the standard tables with every threshold and amount
  // halved: each of two jobs withholds half the tax on the combined income.
  test('matches the halved-schedule identity', () => {
    const gross = 230_769                      // ~$60k/yr biweekly
    const emp = { ...TECH, w4_multiple_jobs: true }
    const got = federalWithholdingCents({ taxableGrossCents: gross, employee: emp, year: 2026, payFrequency: 'biweekly' })

    // With the box checked, line 1g is -0- and the schedule carries the FULL
    // standard deduction, halved along with every threshold — equivalently,
    // tax the doubled wage and halve the result:
    //   2 × 5,999,994 − 1,610,000 std = 10,389,988 taxable
    //   10% of 1,240,000 = 124,000; 12% to 5,040,000 = 456,000;
    //   22% of the remaining 5,349,988 = 1,176,997 → 1,756,997, halved.
    const annualTax = 124_000 + 456_000 + 0.22 * (10_389_988 - 5_040_000)
    expect(got).toBe(Math.round(annualTax / 2 / 26))
    expect(got).toBe(33_788)   // the published Step 2 schedule figure
  })

  test('withholds roughly twice the single-job amount at the same wage', () => {
    const gross = 230_769
    const one = federalWithholdingCents({ taxableGrossCents: gross, employee: TECH, year: 2026 })
    const two = federalWithholdingCents({ taxableGrossCents: gross, employee: { ...TECH, w4_multiple_jobs: true }, year: 2026 })
    expect(two).toBeGreaterThan(one * 1.4)     // the old (inverted) formula gave LESS
  })
})

describe('degenerate inputs cannot create money', () => {
  const entries = [day('2026-07-20', 8, { id: 1 })]

  test('a negative bonus is ignored, not applied', () => {
    const item = computePayrollItem({ employee: TECH, entries, year: 2026, ytd: {}, bonusCents: -50_000 })
    expect(item.bonusCents).toBe(0)
    expect(item.taxableGrossCents).toBe(8 * 2250)
    expect(item.employeeMedicareCents).toBeGreaterThan(0)
  })

  test('negative taxable wages never produce negative FICA', () => {
    const f = computeFicaCents({ taxableGrossCents: -100_000, year: 2026, ytd: {} })
    expect(f.employeeMedicareCents).toBe(0)
    expect(f.employeeSsCents).toBe(0)
    expect(f.employerFutaCents).toBe(0)
  })

  test('a zero-wage period with W-4 extra withholding nets zero, not negative', () => {
    const emp = { ...TECH, w4_extra_withholding_cents: 5_000 }
    const item = computePayrollItem({ employee: emp, entries: [], year: 2026, ytd: {} })
    expect(item.fedIncomeTaxCents).toBe(0)
    expect(item.netCents).toBe(0)
  })

  test('a deduction cannot cut into the minimum wage or the overtime premium', () => {
    // 29 CFR 531.36. An 8-hour day at $22.50 grosses $180; the FLSA floor is
    // 8 × $7.25 = $58, so at most $180 − taxes − $58 may be deducted.
    const item = computePayrollItem({
      employee: TECH, entries, year: 2026, ytd: {},
      otherDeductionCents: 999_999, otherDeductionLabel: 'truck damage',
    })
    expect(item.minimumWageFloorCents).toBe(5_800)
    expect(item.netCents).toBeGreaterThanOrEqual(item.minimumWageFloorCents)
    expect(item.otherDeductionCents).toBe(item.grossCents - item.employeeTaxCents - 5_800)
    expect(item.deductionShortfallCents).toBe(999_999 - item.otherDeductionCents)
  })

  test('the overtime premium is protected from deductions too', () => {
    const otEntries = [
      day('2026-07-20', 9, { id: 1 }), day('2026-07-21', 9, { id: 2 }), day('2026-07-22', 9, { id: 3 }),
      day('2026-07-23', 9, { id: 4 }), day('2026-07-24', 8, { id: 5 }),
    ]
    const item = computePayrollItem({
      employee: TECH, entries: otEntries, year: 2026, ytd: {}, otherDeductionCents: 999_999,
    })
    expect(item.otHours).toBe(4)
    expect(item.netCents).toBeGreaterThanOrEqual(item.minimumWageFloorCents + item.otPremiumCents)
  })

  test('sutaRate: null falls back to the Texas default instead of zeroing SUTA', () => {
    const f = computeFicaCents({ taxableGrossCents: 300_000, year: 2026, ytd: {}, sutaRate: null })
    expect(f.employerSutaCents).toBe(Math.round(300_000 * TX_SUTA_DEFAULT_RATE))
  })

  test('omitted YTD is flagged so the caller knows caps were not applied', () => {
    const withYtd = computePayrollItem({ employee: TECH, entries, year: 2026, ytd: {} })
    const without = computePayrollItem({ employee: TECH, entries, year: 2026 })
    expect(withYtd.ytdMissing).toBe(false)
    expect(without.ytdMissing).toBe(true)
  })
})

describe('taxConfig picks the right era', () => {
  test('a past year uses that year, not the newest tables', () => {
    expect(taxConfig(2025).fallbackYear).toBeNull()
    expect(taxConfig(2025).config.socialSecurityWageBaseCents).toBe(17_610_000)
  })
  test('a year between known years falls BACK, never forward', () => {
    // Pretend 2027 is unknown: it must use 2026, not 2025.
    expect(taxConfig(2027).fallbackYear).toBe(2026)
    expect(taxConfig(2027).config.socialSecurityWageBaseCents).toBe(18_450_000)
  })
  test('a year older than every table falls forward to the oldest', () => {
    expect(taxConfig(2019).fallbackYear).toBe(Math.min(...Object.keys(TAX_YEARS).map(Number)))
  })
})

describe('taxable mileage excess flows into the paystub', () => {
  test('the excess is taxed while the IRS-rate portion is not', () => {
    const emp = { ...TECH, mileage_rate_cents: 85 }
    const entries = [day('2026-07-20', 8, { id: 1, miles: 100 })]
    const item = computePayrollItem({ employee: emp, entries, year: 2026, ytd: {} })
    expect(item.reimbursementCents).toBe(7000)
    expect(item.mileageExcessCents).toBe(1500)
    expect(item.taxableGrossCents).toBe(8 * 2250 + 1500)
    expect(item.grossCents).toBe(item.taxableGrossCents + 7000)
    expect(item.employeeSsCents).toBe(Math.round(item.taxableGrossCents * SS_RATE))
  })
})

// ── second round of review fixes ──────────────────────────────────────────

describe('salary is prorated to the period actually paid', () => {
  const salaried = {
    ...TECH, pay_type: 'salary', salary_annual_cents: 5_200_000,
    pay_frequency: 'biweekly', exempt: true,
  }
  const week = [day('2026-07-20', 8), day('2026-07-21', 8), day('2026-07-22', 8), day('2026-07-23', 8), day('2026-07-24', 8)]

  test('a full 14-day period pays the whole biweekly slice', () => {
    const e = computeEarnings({ employee: salaried, entries: week, year: 2026, periodStart: '2026-06-01', periodEnd: '2026-06-14' })
    expect(e.basePayCents).toBe(Math.round(5_200_000 / 26))
  })

  test('a 7-day period pays half — two of them cannot pay the fortnight twice', () => {
    const half = computeEarnings({ employee: salaried, entries: week, year: 2026, periodStart: '2026-06-01', periodEnd: '2026-06-07' })
    expect(half.basePayCents).toBe(Math.round((5_200_000 / 26) * 0.5))
    const other = computeEarnings({ employee: salaried, entries: [], year: 2026, periodStart: '2026-06-08', periodEnd: '2026-06-14' })
    expect(half.basePayCents + other.basePayCents).toBe(Math.round(5_200_000 / 26))
  })

  test('a catch-up run covering two periods pays TWO installments', () => {
    // Capping at one installment here silently swallowed a whole paycheck.
    const e = computeEarnings({
      employee: salaried, entries: week, year: 2026,
      periodStart: '2026-06-01', periodEnd: '2026-06-28',    // 28 days = 2 biweekly periods
    })
    expect(e.basePayCents).toBe(Math.round((5_200_000 / 26) * 2))
  })

  test('a calendar month pays exactly one monthly salary, February included', () => {
    // days/30 proration underpaid February by $333 on a $60k salary.
    const monthly = { ...TECH, pay_type: 'salary', salary_annual_cents: 6_000_000, pay_frequency: 'monthly', exempt: true }
    const feb = computeEarnings({ employee: monthly, entries: [], year: 2026, periodStart: '2026-02-01', periodEnd: '2026-02-28' })
    expect(feb.basePayCents).toBe(Math.round(6_000_000 / 12))
    const jul = computeEarnings({ employee: monthly, entries: [], year: 2026, periodStart: '2026-07-01', periodEnd: '2026-07-31' })
    expect(jul.basePayCents).toBe(Math.round(6_000_000 / 12))
  })
})

describe('withholding can never exceed the paycheck', () => {
  const entries = [day('2026-07-20', 8, { id: 1 })]   // $180 gross at $22.50/h

  test('an oversized W-4 4(c) amount is capped and the shortfall reported', () => {
    const emp = { ...TECH, w4_extra_withholding_cents: 50_000 }   // asks for $500
    const item = computePayrollItem({ employee: emp, entries, year: 2026, ytd: {} })
    const fica = item.employeeSsCents + item.employeeMedicareCents + item.employeeAddlMedicareCents
    expect(item.fedIncomeTaxCents).toBe(item.grossCents - fica)   // took what was there
    expect(item.withholdingShortfallCents).toBeGreaterThan(0)
    expect(item.netCents).toBe(0)
    // The stub only ever claims tax that was really withheld.
    expect(item.employeeTaxCents).toBe(item.grossCents)
    expect(item.fedIncomeTaxCents + item.withholdingShortfallCents).toBe(50_000 + expectedTableTax(emp))
  })

  function expectedTableTax(emp) {
    return federalWithholdingCents({
      taxableGrossCents: 18_000, employee: { ...emp, w4_extra_withholding_cents: 0 }, year: 2026,
    })
  }

  test('a normal check withholds the full requested amount', () => {
    const emp = { ...TECH, w4_extra_withholding_cents: 2_500 }
    const entries2 = [day('2026-07-20', 8, { id: 1 }), day('2026-07-21', 8, { id: 2 }),
                      day('2026-07-22', 8, { id: 3 }), day('2026-07-23', 8, { id: 4 }), day('2026-07-24', 8, { id: 5 })]
    const item = computePayrollItem({ employee: emp, entries: entries2, year: 2026, ytd: {} })
    expect(item.withholdingShortfallCents).toBe(0)
    expect(item.netCents).toBeGreaterThan(0)
  })
})

// ── expense reimbursement (receipts) ──────────────────────────────────────

describe('approved receipts are reimbursed without being taxed', () => {
  const entries = [
    day('2026-07-20', 8, { id: 1 }), day('2026-07-21', 8, { id: 2 }),
    day('2026-07-22', 8, { id: 3 }), day('2026-07-23', 8, { id: 4 }), day('2026-07-24', 8, { id: 5 }),
  ]

  test('a receipt adds to gross and net but to no tax line', () => {
    const plain = computePayrollItem({ employee: TECH, entries, year: 2026, ytd: {} })
    const withReceipt = computePayrollItem({
      employee: TECH, entries, year: 2026, ytd: {}, expenseReimbursementCents: 4_599,
    })
    expect(withReceipt.expenseReimbursementCents).toBe(4_599)
    expect(withReceipt.taxableGrossCents).toBe(plain.taxableGrossCents)
    expect(withReceipt.fedIncomeTaxCents).toBe(plain.fedIncomeTaxCents)
    expect(withReceipt.employeeSsCents).toBe(plain.employeeSsCents)
    expect(withReceipt.employerTaxCents).toBe(plain.employerTaxCents)
    // …and it reaches the employee's pocket in full.
    expect(withReceipt.grossCents).toBe(plain.grossCents + 4_599)
    expect(withReceipt.netCents).toBe(plain.netCents + 4_599)
  })

  test('mileage and receipts are reported separately', () => {
    const item = computePayrollItem({
      employee: { ...TECH, mileage_rate_cents: 70 },
      entries: [day('2026-07-20', 8, { id: 1, miles: 40 })],
      year: 2026, ytd: {}, expenseReimbursementCents: 2_000,
    })
    expect(item.reimbursementCents).toBe(2_800)          // 40 mi × 70¢
    expect(item.expenseReimbursementCents).toBe(2_000)
    expect(item.grossCents).toBe(item.taxableGrossCents + 2_800 + 2_000)
  })

  test('a negative reimbursement is ignored', () => {
    const item = computePayrollItem({ employee: TECH, entries, year: 2026, ytd: {}, expenseReimbursementCents: -5_000 })
    expect(item.expenseReimbursementCents).toBe(0)
  })

  test('a reimbursement-only check (no hours) still pays out', () => {
    const item = computePayrollItem({ employee: TECH, entries: [], year: 2026, ytd: {}, expenseReimbursementCents: 4_599 })
    expect(item.taxableGrossCents).toBe(0)
    expect(item.employeeTaxCents).toBe(0)
    expect(item.netCents).toBe(4_599)
  })
})
