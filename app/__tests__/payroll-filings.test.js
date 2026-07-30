// Filing aggregation — every number here is pinned by hand.
const {
  aggregate941, aggregate940, aggregateW2, depositSchedule,
  depositDueDate, filing941DueDate, annualFilingDueDate, rowFederalLiabilityCents,
} = require('../lib/payroll-filings')

// One finalized paystub row (the listFinalizedItemRows shape), Zeke-sized:
// $1,600 biweekly gross, plain FICA, some withholding.
let nextRun = 100
function row(over = {}) {
  const taxable = over.taxableGrossCents ?? 160_000
  return {
    runId: over.runId ?? nextRun++,
    employeeId: 7,
    employeeName: 'Zeke Baranovicht',
    classification: 'employee',
    payDate: '2026-07-24',
    periodStart: '2026-07-05',
    periodEnd: '2026-07-18',
    taxesDepositedAt: '2026-08-01T00:00:00.000Z',
    taxableGrossCents: taxable,
    grossCents: taxable,
    fedIncomeTaxCents: 13_000,
    ssWagesCents: taxable,
    employeeSsCents: Math.round(taxable * 0.062),
    employerSsCents: Math.round(taxable * 0.062),
    employeeMedicareCents: Math.round(taxable * 0.0145),
    employerMedicareCents: Math.round(taxable * 0.0145),
    employeeAddlMedicareCents: 0,
    futaWagesCents: 0,
    employerFutaCents: 0,
    ...over,
  }
}

describe('due dates', () => {
  test('monthly deposit rolls off weekends', () => {
    expect(depositDueDate('2026-07')).toBe('2026-08-17') // Aug 15 2026 is a Saturday
    expect(depositDueDate('2026-08')).toBe('2026-09-15') // Tuesday, no roll
    expect(depositDueDate('2026-10')).toBe('2026-11-16') // Nov 15 2026 is a Sunday
    expect(depositDueDate('2026-12')).toBe('2027-01-15') // crosses the year
  })
  test('941 filing dates roll off weekends', () => {
    expect(filing941DueDate(2026, 2)).toBe('2026-07-31')
    expect(filing941DueDate(2026, 3)).toBe('2026-11-02') // Oct 31 2026 is a Saturday
    expect(filing941DueDate(2026, 4)).toBe('2027-02-01') // Jan 31 2027 is a Sunday
  })
  test('940 and W-2 are due Jan 31, rolled', () => {
    expect(annualFilingDueDate(2026)).toBe('2027-02-01')
  })
})

describe('aggregate941', () => {
  const rows = [
    row({ runId: 1, payDate: '2026-07-24', periodStart: '2026-07-05', periodEnd: '2026-07-18' }),
    row({ runId: 2, payDate: '2026-08-07', periodStart: '2026-07-19', periodEnd: '2026-08-01' }),
    row({ runId: 3, payDate: '2026-09-18', periodStart: '2026-08-30', periodEnd: '2026-09-12' }),
  ]

  test('sums wages and withholding for the quarter only', () => {
    const agg = aggregate941({ rows, year: 2026, quarter: 3 })
    expect(agg.line2).toBe(480_000)
    expect(agg.line3).toBe(39_000)
    expect(agg.line5a1).toBe(480_000)
    expect(agg.line5a2).toBe(Math.round(480_000 * 0.124))
    expect(agg.line5c2).toBe(Math.round(480_000 * 0.029))
    const q2 = aggregate941({ rows, year: 2026, quarter: 2 })
    expect(q2.hasActivity).toBe(false)
    expect(q2.line2).toBe(0)
  })

  test('line 1 counts only the pay period containing the 12th of month 3', () => {
    const agg = aggregate941({ rows, year: 2026, quarter: 3 })
    expect(agg.line1).toBe(1) // only run 3's period spans Sep 12
    const without = aggregate941({ rows: rows.slice(0, 2), year: 2026, quarter: 3 })
    expect(without.line1).toBe(0)
  })

  test('fractions-of-cents adjustment reconciles per-check rounding', () => {
    // $123.45 wages: per-check SS is 765+765=1530, form computes 1531.
    const odd = [row({ runId: 9, taxableGrossCents: 12_345, ssWagesCents: 12_345, fedIncomeTaxCents: 0, payDate: '2026-07-24' })]
    const agg = aggregate941({ rows: odd, year: 2026, quarter: 3 })
    const actual = 2 * Math.round(12_345 * 0.062) + 2 * Math.round(12_345 * 0.0145)
    expect(agg.line7).toBe(actual - agg.line5e)
    expect(agg.line7).not.toBe(0)
    expect(agg.line10).toBe(agg.line6 + agg.line7)
  })

  test('monthly liability buckets by pay date and totals to line 12', () => {
    const agg = aggregate941({ rows, year: 2026, quarter: 3 })
    expect(agg.months.map((m) => m.month)).toEqual(['2026-07', '2026-08', '2026-09'])
    const perRun = rowFederalLiabilityCents(rows[0])
    expect(agg.months[0].liabilityCents).toBe(perRun)
    expect(agg.totalLiabilityCents).toBe(agg.line12)
  })

  test('a quarter under $2,500 is de minimis', () => {
    const agg = aggregate941({ rows, year: 2026, quarter: 3 })
    expect(agg.line12).toBeLessThan(250_000)
    expect(agg.deMinimis).toBe(true)
  })

  test('contractors are invisible to the 941', () => {
    const mixed = [...rows, row({ runId: 4, classification: 'contractor', payDate: '2026-07-24', taxableGrossCents: 999_999 })]
    expect(aggregate941({ rows: mixed, year: 2026, quarter: 3 }).line2).toBe(480_000)
  })

  test('flags runs whose deposit is unconfirmed', () => {
    const un = [row({ runId: 5, taxesDepositedAt: null })]
    expect(aggregate941({ rows: un, year: 2026, quarter: 3 }).runsNotDeposited).toEqual([5])
  })
})

describe('depositSchedule', () => {
  test('one entry per pay month with due date and status', () => {
    const rows = [
      row({ runId: 1, payDate: '2026-07-24' }),
      row({ runId: 2, payDate: '2026-08-07', taxesDepositedAt: null }),
      row({ runId: 3, payDate: '2026-08-21', taxesDepositedAt: null }),
    ]
    const sched = depositSchedule({ rows, year: 2026 })
    expect(sched).toHaveLength(2)
    expect(sched[0]).toMatchObject({ month: '2026-07', dueDate: '2026-08-17', deposited: true })
    expect(sched[1]).toMatchObject({ month: '2026-08', dueDate: '2026-09-15', deposited: false })
    expect(sched[1].liabilityCents).toBe(2 * rowFederalLiabilityCents(row({})))
  })
})

describe('aggregate940', () => {
  test('FUTA lines and pay-with-return threshold', () => {
    const rows = [
      row({ runId: 1, payDate: '2026-03-06', futaWagesCents: 160_000, employerFutaCents: 960 }),
      row({ runId: 2, payDate: '2026-07-24', futaWagesCents: 160_000, employerFutaCents: 960 }),
    ]
    const agg = aggregate940({ rows, year: 2026 })
    expect(agg.line3).toBe(320_000)
    expect(agg.line7).toBe(320_000)
    expect(agg.line5).toBe(0)
    expect(agg.line8).toBe(Math.round(320_000 * 0.006))
    expect(agg.payWithReturn).toBe(true)
    expect(agg.quarterly.map((q) => q.liabilityCents)).toEqual([960, 0, 960, 0])
  })

  test('wages past the $7,000 base land on line 5', () => {
    // $10,000 paid, only $7,000 FUTA-taxable.
    const rows = [row({ runId: 1, taxableGrossCents: 1_000_000, futaWagesCents: 700_000, employerFutaCents: 4_200 })]
    const agg = aggregate940({ rows, year: 2026 })
    expect(agg.line5).toBe(300_000)
    expect(agg.line8).toBe(4_200)
  })
})

describe('aggregateW2', () => {
  test('boxes 1-6 sum per employee; contractors split out at $600+', () => {
    const rows = [
      row({ runId: 1, payDate: '2026-07-24' }),
      row({ runId: 2, payDate: '2026-12-18' }),
      row({ runId: 3, classification: 'contractor', employeeId: 9, employeeName: 'Sub', grossCents: 70_000 }),
      row({ runId: 4, classification: 'contractor', employeeId: 10, employeeName: 'Tiny', grossCents: 10_000 }),
    ]
    const { w2s, contractors } = aggregateW2({ rows, year: 2026 })
    expect(w2s).toHaveLength(1)
    expect(w2s[0]).toMatchObject({
      name: 'Zeke Baranovicht',
      box1: 320_000,
      box2: 26_000,
      box3: 320_000,
      box4: 2 * Math.round(160_000 * 0.062),
      box5: 320_000,
      box6: 2 * Math.round(160_000 * 0.0145),
    })
    expect(contractors).toEqual([{ employeeId: 9, name: 'Sub', paidCents: 70_000 }])
  })

  test('additional Medicare joins box 6', () => {
    const rows = [row({ runId: 1, employeeAddlMedicareCents: 500 })]
    const { w2s } = aggregateW2({ rows, year: 2026 })
    expect(w2s[0].box6).toBe(2_320 + 500)
  })
})
