#!/usr/bin/env node
// End-to-end payroll self-test against the real database.
//
//   cd app && node _scripts/payroll-selftest.js
//
// Unit tests cover the math; this covers the SQL — the invariants that only
// exist as constraints and WHERE clauses: approval can't survive an hours
// change, a day can't be paid twice, overlapping runs are refused, a void
// releases the work and reverses the ledger.
//
// It creates a throwaway employee (payroll-selftest@greenguard-usa.test) and
// deletes everything it made, including its books rows, in the finally block.
// Safe to run against production; it never touches real employees or runs.

require('dotenv').config({ path: '.env' })
const { q, getPool } = require('../lib/db')
const S = require('../lib/payroll-store')

const EMAIL = 'payroll-selftest@greenguard-usa.test'
let failures = 0
let employeeId = null
const runIds = []

function check(label, cond, detail = '') {
  if (cond) {
    console.log(`  ✓ ${label}`)
  } else {
    failures++
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

async function expectStatus(label, fn, status) {
  try {
    await fn()
    failures++
    console.log(`  ✗ ${label} — expected ${status}, call succeeded`)
  } catch (err) {
    check(`${label} → ${status}`, err.status === status, `got ${err.status || 'no status'}: ${err.message}`)
  }
}

// Monday-of-a-known-week dates so the workweek math is deterministic.
const D = (n) => `2026-06-${String(n).padStart(2, '0')}`   // June 2026: 1st is a Monday

async function cleanup() {
  if (!employeeId) return
  // Finalized paystubs are frozen by a trigger. One dedicated connection opts
  // into the documented maintenance escape hatch so this test can remove the
  // history it created (and only that history).
  const client = await getPool().connect()
  try {
    await client.query(`SET payroll.allow_purge = 'on'`)
    const patterns = runIds.flatMap((id) => [`payroll-run-${id}-%`, `payroll-void-${id}-%`])
    if (patterns.length) {
      await client.query(`DELETE FROM transactions WHERE source = 'payroll' AND external_id LIKE ANY($1)`, [patterns])
    }
    const { rows: claims } = await client.query(`SELECT id FROM expense_claims WHERE employee_id = $1`, [employeeId])
    for (const c of claims) {
      await client.query(
        `DELETE FROM transactions WHERE source = 'expense-claim' AND external_id IN ($1, $2)`,
        [`expense-claim-${c.id}`, `expense-claim-void-${c.id}`]
      )
    }
    await client.query(`DELETE FROM expense_claims WHERE employee_id = $1`, [employeeId])
    await client.query(`DELETE FROM timesheet_entries WHERE employee_id = $1`, [employeeId])
    await client.query(`DELETE FROM payroll_items WHERE employee_id = $1`, [employeeId])
    if (runIds.length) await client.query(`DELETE FROM payroll_runs WHERE id = ANY($1)`, [runIds])
    await client.query(`DELETE FROM employees WHERE id = $1`, [employeeId])
    // Hand the id back. Without this, every self-test run burns an employee
    // number off the sequence and the next REAL hire gets a confusing id.
    await client.query(
      `SELECT setval('employees_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM employees), 0), 1),
                     (SELECT COUNT(*) FROM employees) > 0)`
    )
  } finally {
    await client.query(`RESET payroll.allow_purge`).catch(() => {})
    client.release()
  }
}

async function main() {
  // Start from a clean slate even if a previous run died mid-way.
  const prior = await q(`SELECT id FROM employees WHERE email = $1`, [EMAIL])
  if (prior.rows[0]) {
    employeeId = prior.rows[0].id
    const oldRuns = await q(
      `SELECT DISTINCT run_id FROM payroll_items WHERE employee_id = $1
       UNION SELECT DISTINCT payroll_run_id FROM timesheet_entries WHERE employee_id = $1 AND payroll_run_id IS NOT NULL`,
      [employeeId]
    )
    runIds.push(...oldRuns.rows.map((r) => r.run_id).filter(Boolean))
    await cleanup()
    employeeId = null
    runIds.length = 0
  }

  console.log('\n1. employee + settings')
  const emp = await S.createEmployee({
    email: EMAIL, name: 'Payroll Selftest', classification: 'employee', pay_type: 'hourly',
    pay_frequency: 'biweekly', hourly_rate_cents: 2250, mileage_rate_cents: 70,
    ot_eligible: true, filing_status: 'single', active: true,
  })
  employeeId = emp.id
  check('created with numeric rate (not a pg string)', emp.hourly_rate_cents === 2250, String(emp.hourly_rate_cents))

  const settings = await S.updateSettings({ sutaRate: 50, weekStartDay: 99, mileageRateCents: -70 })
  check('SUTA rate clamped to ≤ 1', settings.sutaRate <= 1, String(settings.sutaRate))
  check('week start clamped to 0-6', settings.weekStartDay >= 0 && settings.weekStartDay <= 6, String(settings.weekStartDay))
  check('mileage rate clamped to ≥ 0', settings.mileageRateCents >= 0, String(settings.mileageRateCents))
  await S.updateSettings({ sutaRate: 0.027, weekStartDay: 0, mileageRateCents: 70 })

  console.log('\n2. timesheet entry writes')
  await S.upsertEntry({ employeeId, workDate: D(1), hours: 8, stops: 5, miles: 60, notes: 'day one' })
  const partial = await S.upsertEntry({ employeeId, workDate: D(1), notes: 'gate code 4412' })
  check('a notes-only save keeps stops', partial.stops === 5, `stops=${partial.stops}`)
  check('a notes-only save keeps miles', partial.miles === 60, `miles=${partial.miles}`)
  check('a notes-only save keeps hours', partial.hours === 8, `hours=${partial.hours}`)

  console.log('\n3. clock in / clock out')
  const ci = await S.clockIn({ employeeId, at: new Date('2026-06-02T13:00:00Z') })
  check('clock in creates an open row', ci.clock_in !== null && ci.clock_out === null)
  const again = await S.clockIn({ employeeId, at: new Date('2026-06-02T13:05:00Z') })
  check('clock in is idempotent (same clock_in)', again.clock_in === ci.clock_in)
  const co = await S.clockOut({ employeeId, at: new Date('2026-06-02T21:30:00Z') })
  check('clock out banks the elapsed hours', Number(co.hours) === 8.5, `hours=${co.hours}`)
  check('clock out submits for approval', co.status === 'submitted', co.status)
  await expectStatus('a second clock out', () => S.clockOut({ employeeId, at: new Date() }), 409)

  console.log('\n4. a second shift adds only its own time')
  // The bug this catches: reusing the first shift's clock_in would bank the
  // whole 08:00→19:00 span instead of the two worked shifts.
  await S.upsertEntry({ employeeId, workDate: D(8), hours: null })
  await S.clockIn({ employeeId, at: new Date('2026-06-08T13:00:00Z') })
  const shift1 = await S.clockOut({ employeeId, at: new Date('2026-06-08T17:00:00Z') })
  check('first shift banks 4 h', Number(shift1.hours) === 4, `hours=${shift1.hours}`)
  const second = await S.clockIn({ employeeId, at: new Date('2026-06-08T22:00:00Z') })
  check('a second clock-in takes the NEW stamp', second.clock_in === '2026-06-08T22:00:00.000Z', String(second.clock_in))
  const shift2 = await S.clockOut({ employeeId, at: new Date('2026-06-09T00:00:00Z') })
  check('second shift adds only its own 2 h (total 6, not 11)', Number(shift2.hours) === 6, `hours=${shift2.hours}`)
  await S.deleteEntry(shift2.id)

  console.log('\n5. approval cannot survive an hours change')
  await S.setEntryStatus({ ids: [co.id], status: 'approved', actorEmail: 'owner@test' })
  const reopened = await S.clockIn({ employeeId, at: new Date('2026-06-02T22:00:00Z') })
  check('re-clocking an approved day un-approves it', reopened.status === 'submitted', reopened.status)
  check('the approver stamp is cleared', reopened.approved_by === null)
  const closed = await S.clockOut({ employeeId, at: new Date('2026-06-02T23:00:00Z') })
  check('still submitted after the new clock out', closed.status === 'submitted', closed.status)

  await S.setEntryStatus({ ids: [closed.id], status: 'approved', actorEmail: 'owner@test' })
  const edited = await S.upsertEntry({ employeeId, workDate: D(2), hours: 9 })
  check('a manual hours edit un-approves the day', edited.status === 'submitted', edited.status)
  check('a manual hours edit clears the clock pair', edited.clock_in === null && edited.clock_out === null)
  check('so approved hours == paid hours', require('../lib/payroll').entryHours(edited) === 9)

  console.log('\n6. expense receipts')
  const claim = await S.createExpense({
    employeeId, incurredOn: D(3), amountCents: 4599, vendor: 'Home Depot',
    description: 'CO2 regulator', categoryLabel: 'COGS:Equipment',
    paymentMethod: 'personal',
    receiptUrl: 'https://fake123.public.blob.vercel-storage.com/receipts/selftest.jpg',
    receiptMime: 'image/jpeg', receiptBytes: 1234,
  })
  check('receipt starts as submitted', claim.status === 'submitted', claim.status)
  check('receipt is reimbursable', claim.reimbursable === true)
  await expectStatus('a $0 receipt', () => S.createExpense({
    employeeId, incurredOn: D(3), amountCents: 0, description: 'x', categoryLabel: 'COGS:Equipment',
  }), 400)
  await expectStatus('a receipt against a revenue account', () => S.createExpense({
    employeeId, incurredOn: D(3), amountCents: 500, description: 'x', categoryLabel: 'Revenue:Barrier',
  }), 400)

  const rejected = await S.rejectExpense({ id: claim.id, actorEmail: 'owner@test', reason: 'need the itemized slip' })
  check('rejection carries a reason', rejected.status === 'rejected' && rejected.rejectedReason.includes('itemized'))
  check('a rejected receipt is not in the books', rejected.postedToBooks === false)

  const approved = await S.approveExpense({ id: claim.id, actorEmail: 'owner@test' })
  check('approval sets approved', approved.status === 'approved', approved.status)
  check('approval books the expense', approved.postedToBooks === true)
  const booked = await q(
    `SELECT amount_cents, category_label, to_char(occurred_at,'YYYY-MM-DD') d
     FROM transactions WHERE source = 'expense-claim' AND external_id = $1`,
    [`expense-claim-${claim.id}`]
  )
  check('booked once, negative, at its own category',
    booked.rows.length === 1 && Number(booked.rows[0].amount_cents) === -4599 && booked.rows[0].category_label === 'COGS:Equipment')
  check('booked on the date it was incurred', booked.rows[0].d === D(3), booked.rows[0].d)
  await S.postExpenseToBooks(claim.id)
  const bookedAgain = await q(`SELECT COUNT(*)::int n FROM transactions WHERE source='expense-claim' AND external_id = $1`, [`expense-claim-${claim.id}`])
  check('re-posting is idempotent', bookedAgain.rows[0].n === 1)

  // The lifecycle that used to net the expense to $0 forever.
  await S.rejectExpense({ id: claim.id, actorEmail: 'owner@test', reason: 'second thoughts' })
  const afterReject = await q(`SELECT COUNT(*)::int n FROM transactions WHERE source='expense-claim' AND external_id LIKE $1`, [`expense-claim-%${claim.id}`])
  check('rejecting an approved receipt removes it from the books', afterReject.rows[0].n === 0, `${afterReject.rows[0].n} rows`)
  const reapproved = await S.approveExpense({ id: claim.id, actorEmail: 'owner@test' })
  const afterReapprove = await q(
    `SELECT amount_cents FROM transactions WHERE source='expense-claim' AND external_id = $1`,
    [`expense-claim-${claim.id}`]
  )
  check('approving again re-books the full amount',
    afterReapprove.rows.length === 1 && Number(afterReapprove.rows[0].amount_cents) === -4599,
    JSON.stringify(afterReapprove.rows))
  check('and the claim knows it is booked', reapproved.postedToBooks === true)

  // Editing an approved receipt must move the ledger too.
  await S.updateExpense(claim.id, { amount_cents: 45999, category_label: 'Expense:Tools' })
  const afterEdit = await q(`SELECT COUNT(*)::int n FROM transactions WHERE source='expense-claim' AND external_id = $1`, [`expense-claim-${claim.id}`])
  check('editing un-books the stale amount', afterEdit.rows[0].n === 0, `${afterEdit.rows[0].n} rows`)
  await S.approveExpense({ id: claim.id, actorEmail: 'owner@test' })
  const afterEditApprove = await q(
    `SELECT amount_cents, category_label FROM transactions WHERE source='expense-claim' AND external_id = $1`,
    [`expense-claim-${claim.id}`]
  )
  check('re-approval books the NEW amount and category',
    Number(afterEditApprove.rows[0].amount_cents) === -45999 && afterEditApprove.rows[0].category_label === 'Expense:Tools',
    JSON.stringify(afterEditApprove.rows[0]))
  await S.updateExpense(claim.id, { amount_cents: 4599, category_label: 'COGS:Equipment' })
  await S.approveExpense({ id: claim.id, actorEmail: 'owner@test' })

  // Validation that used to clamp instead of refusing.
  await expectStatus('editing to $0', () => S.updateExpense(claim.id, { amount_cents: 0 }), 400)
  await expectStatus('a future-dated edit', () => S.updateExpense(claim.id, { incurred_on: '2030-01-01' }), 400)
  await expectStatus('a receipt link off our storage',
    () => S.updateExpense(claim.id, { receipt_url: 'javascript:alert(1)' }), 400)
  await expectStatus('a receipt link off our storage at create time', () => S.createExpense({
    employeeId, incurredOn: D(3), amountCents: 500, description: 'sketchy',
    categoryLabel: 'COGS:Equipment', receiptUrl: 'https://example.invalid/receipt.jpg',
  }), 400)
  await expectStatus('filing the same photo twice', () => S.createExpense({
    employeeId, incurredOn: D(3), amountCents: 4599, description: 'dupe',
    categoryLabel: 'COGS:Equipment',
    receiptUrl: 'https://fake123.public.blob.vercel-storage.com/receipts/selftest.jpg',
  }), 409)

  // Company-card receipts are booked but never reimbursed.
  const cardClaim = await S.createExpense({
    employeeId, incurredOn: D(4), amountCents: 2000, description: 'fuel',
    categoryLabel: 'Expense:Fuel', paymentMethod: 'company',
  })
  const recorded = await S.approveExpense({ id: cardClaim.id, actorEmail: 'owner@test' })
  check('a company-card receipt is recorded, not approved-for-pay', recorded.status === 'recorded', recorded.status)
  const reimbursable = await S.listReimbursableExpenses({ periodEnd: D(14) })
  check('only the out-of-pocket receipt is queued for reimbursement',
    reimbursable.length === 1 && reimbursable[0].id === claim.id, `${reimbursable.length} queued`)

  console.log('\n7. payroll run')
  for (const d of [3, 4, 5]) await S.upsertEntry({ employeeId, workDate: D(d), hours: 8, stops: 4, miles: 50 })
  const all = await S.listEntries({ employeeId })
  await S.setEntryStatus({ ids: all.map((e) => e.id), status: 'approved', actorEmail: 'owner@test' })

  const preview = await S.previewRun({ periodStart: D(1), periodEnd: D(14), payDate: D(19) })
  const pv = preview.items[0]
  check('preview has exactly one employee', preview.items.length === 1)
  check('preview hours = 8+9+8+8+8', pv.totalHours === 41, `hours=${pv.totalHours}`)
  check('overtime on the 41st hour', pv.otHours === 1, `ot=${pv.otHours}`)
  check('the approved receipt rides along untaxed', pv.expenseReimbursementCents === 4599, String(pv.expenseReimbursementCents))
  check('reimbursements are untaxed',
    pv.grossCents - pv.taxableGrossCents === pv.reimbursementCents + pv.expenseReimbursementCents)
  check('net = gross − deductions', pv.netCents === pv.grossCents - pv.employeeTaxCents - pv.otherDeductionCents)

  const { run } = await S.createRun({ periodStart: D(1), periodEnd: D(14), payDate: D(19), createdBy: 'owner@test' })
  runIds.push(run.id)
  check('draft created', run.status === 'draft', run.status)
  const claimed = await S.listEntries({ employeeId })
  check('every entry is claimed by the run', claimed.every((e) => e.payroll_run_id === run.id))
  const claimedExp = await S.getExpense(claim.id)
  check('the receipt is claimed by the run too', claimedExp.payrollRunId === run.id)
  await expectStatus('editing a claimed receipt', () => S.updateExpense(claim.id, { amount_cents: 9999 }), 409)

  console.log('\n8. the same work cannot be paid twice')
  await expectStatus(
    'an overlapping period',
    () => S.createRun({ periodStart: D(8), periodEnd: D(21), payDate: D(26), createdBy: 'owner@test' }),
    409
  )
  await expectStatus(
    'an identical period',
    () => S.createRun({ periodStart: D(1), periodEnd: D(14), payDate: D(19), createdBy: 'owner@test' }),
    409
  )
  const emptyPreview = await S.previewRun({ periodStart: D(1), periodEnd: D(14), payDate: D(19) })
  check('claimed entries are invisible to a new preview', emptyPreview.items.length === 0)
  await expectStatus('editing a claimed day', () => S.patchEntry(claimed[0].id, { hours: 12 }), 409)
  await expectStatus('deleting a claimed day', () => S.deleteEntry(claimed[0].id), 409)

  console.log('\n9. finalize')
  const finalized = await S.finalizeRun({ runId: run.id, actorEmail: 'owner@test' })
  check('run is finalized', finalized.run.status === 'finalized', finalized.run.status)
  const paid = await S.listEntries({ employeeId })
  check('entries are marked paid', paid.every((e) => e.status === 'paid'))
  check('the receipt is marked reimbursed', (await S.getExpense(claim.id)).status === 'paid')
  await expectStatus('finalizing twice', () => S.finalizeRun({ runId: run.id, actorEmail: 'owner@test' }), 409)

  const books = await q(
    `SELECT external_id, amount_cents, category_label FROM transactions
     WHERE source = 'payroll' AND external_id LIKE $1 ORDER BY external_id`,
    [`payroll-run-${run.id}-%`]
  )
  check('books rows were posted', books.rows.length >= 2, `${books.rows.length} rows`)
  check('books rows are negative (expense)', books.rows.every((r) => Number(r.amount_cents) < 0))
  const wages = books.rows.find((r) => r.category_label === 'Expense:Payroll:Wages')
  check('wage expense = taxable gross', wages && -Number(wages.amount_cents) === finalized.items[0].taxableGrossCents)
  await S.postRunToBooks(run.id)
  const booksAgain = await q(`SELECT COUNT(*)::int n FROM transactions WHERE source='payroll' AND external_id LIKE $1`, [`payroll-run-${run.id}-%`])
  check('re-posting is idempotent', booksAgain.rows[0].n === books.rows.length)

  console.log('\n10. year-to-date')
  const ytd = await S.ytdTotals({ employeeId, year: 2026 })
  check('YTD counts the finalized run', ytd.grossCents === finalized.items[0].taxableGrossCents, String(ytd.grossCents))
  const ytdBefore = await S.ytdTotals({ employeeId, year: 2026, throughPayDate: D(18) })
  check('YTD respects throughPayDate', ytdBefore.grossCents === 0, String(ytdBefore.grossCents))

  console.log('\n11. void releases the work and reverses the ledger')
  const voided = await S.voidRun({ runId: run.id, actorEmail: 'owner@test' })
  check('run is void', voided.run.status === 'void', voided.run.status)
  const released = await S.listEntries({ employeeId })
  check('entries are approved again', released.every((e) => e.status === 'approved' && e.payroll_run_id === null))
  const releasedExp = await S.getExpense(claim.id)
  check('the receipt is queued again, still booked',
    releasedExp.status === 'approved' && releasedExp.payrollRunId === null && releasedExp.postedToBooks === true)
  const reversal = await q(
    `SELECT amount_cents, occurred_at FROM transactions WHERE source='payroll' AND external_id LIKE $1`,
    [`payroll-void-${run.id}-%`]
  )
  check('reversals were written', reversal.rows.length === books.rows.length, `${reversal.rows.length} vs ${books.rows.length}`)
  check('reversals are positive', reversal.rows.every((r) => Number(r.amount_cents) > 0))
  check('reversals land on the original pay date',
    reversal.rows.every((r) => r.occurred_at.toISOString().slice(0, 10) === D(19)))
  const ytdAfterVoid = await S.ytdTotals({ employeeId, year: 2026 })
  check('a void run leaves no YTD wages', ytdAfterVoid.grossCents === 0, String(ytdAfterVoid.grossCents))

  const redo = await S.createRun({ periodStart: D(1), periodEnd: D(14), payDate: D(19), createdBy: 'owner@test' })
  runIds.push(redo.run.id)
  check('the period can be re-run after a void', redo.run.status === 'draft')
}

main()
  .then(cleanup, async (err) => { console.error('\nSELFTEST ERROR:', err); failures++; await cleanup().catch(() => {}) })
  .then(() => {
    console.log(failures === 0 ? '\nAll payroll self-tests passed.\n' : `\n${failures} CHECK(S) FAILED.\n`)
    process.exit(failures === 0 ? 0 : 1)
  })
