// CSV exports for the accountant / 941 prep. Owner only.
//   /api/admin/payroll-export?run=12          → payroll register for one run
//   /api/admin/payroll-export?year=2026       → every finalized stub that year
//   /api/admin/payroll-export?timesheets=1&from=2026-07-01&to=2026-07-31
import { requireOwner } from '../../../lib/auth'
import { q } from '../../../lib/db'
import { listAllEntries, getRunWithItems, listEmployees } from '../../../lib/payroll-store'
import { entryHours } from '../../../lib/payroll'

// RFC 4180 quoting. The leading-'=' guard stops Excel from evaluating a cell
// that starts with =, +, - or @ as a formula.
function csvCell(v) {
  if (v === null || v === undefined) return ''
  let s = String(v)
  // Guard formula injection, but leave negative NUMBERS alone — prefixing an
  // apostrophe would turn every negative dollar figure into text and break the
  // accountant's column sums.
  if (/^[=+@\t\r]/.test(s) || (s.startsWith('-') && !/^-?\d*\.?\d+$/.test(s))) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function csv(rows) {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

const usd = (cents) => (Number(cents || 0) / 100).toFixed(2)

const STUB_HEADER = [
  'Pay Date', 'Period Start', 'Period End', 'Employee', 'Type', 'Reg Hours', 'OT Hours',
  'Stops', 'Miles', 'Base Pay', 'Piece Pay', 'Min Wage Makeup', 'OT Premium', 'Bonus',
  'Taxable Mileage Excess', 'Taxable Gross',
  'Mileage Reimb', 'Receipt Reimb', 'Gross', 'Fed Income Tax', 'SS (EE)', 'Medicare (EE)', 'Addl Medicare',
  'Other Deduction', 'Net Pay', 'SS (ER)', 'Medicare (ER)', 'FUTA', 'TX SUTA',
  'Employer Tax Total', 'Total Cost', 'Run ID', 'Run Status',
]

function stubRow(run, i) {
  return [
    run.payDate, run.periodStart, run.periodEnd, i.employeeName, i.classification,
    i.regularHours, i.otHours, i.stops, i.miles,
    usd(i.basePayCents), usd(i.piecePayCents), usd(i.makeupPayCents), usd(i.otPremiumCents), usd(i.bonusCents),
    usd(i.mileageExcessCents), usd(i.taxableGrossCents),
    usd(i.reimbursementCents), usd(i.expenseReimbursementCents), usd(i.grossCents),
    usd(i.fedIncomeTaxCents), usd(i.employeeSsCents), usd(i.employeeMedicareCents),
    usd(i.employeeAddlMedicareCents), usd(i.otherDeductionCents), usd(i.netCents),
    usd(i.employerSsCents), usd(i.employerMedicareCents), usd(i.employerFutaCents),
    usd(i.employerSutaCents), usd(i.employerTaxCents),
    usd(i.grossCents + i.employerTaxCents), run.id, run.status,
  ]
}

function send(res, filename, body) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  // Quoted filename — a run/period label must not be able to inject a header.
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^\w.\-]/g, '_')}"`)
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).send(body)
}

export default async function handler(req, res) {
  const session = await requireOwner(req, res)
  if (!session) return
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    if (req.query.timesheets) {
      const { from, to } = req.query
      const [{ entries, truncated }, employees] = await Promise.all([
        listAllEntries({ from, to }),
        listEmployees(),
      ])
      if (truncated) {
        return res.status(413).json({ error: 'That range is too large to export in one file — narrow the dates.' })
      }
      const nameById = Object.fromEntries(employees.map((e) => [e.id, e.name]))
      const rows = [
        ['Date', 'Employee', 'Clock In', 'Clock Out', 'Hours (gross)', 'Paid Hours', 'Break (min)', 'Stops', 'Miles', 'Status', 'Source', 'Run ID', 'Notes'],
        ...entries.map((e) => [
          e.work_date, nameById[e.employee_id] || e.employee_id,
          e.clock_in || '', e.clock_out || '',
          e.hours ?? '', entryHours(e).toFixed(2), e.break_minutes, e.stops, e.miles,
          e.status, e.source, e.payroll_run_id || '', e.notes || '',
        ]),
      ]
      return send(res, `timesheets_${from || 'all'}_${to || 'all'}.csv`, csv(rows))
    }

    if (req.query.run) {
      const runId = Number(req.query.run)
      if (!Number.isInteger(runId) || runId <= 0) return res.status(400).json({ error: 'run must be a run id' })
      const data = await getRunWithItems(runId)
      if (!data) return res.status(404).json({ error: 'Run not found' })
      const rows = [STUB_HEADER, ...data.items.map((i) => stubRow(data.run, i))]
      return send(res, `payroll_run_${data.run.id}_${data.run.payDate}.csv`, csv(rows))
    }

    const year = Number(req.query.year) || new Date().getFullYear()
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'year must be a 4-digit year' })
    }
    const { rows: runIds } = await q(
      `SELECT id FROM payroll_runs
       WHERE status = 'finalized' AND EXTRACT(YEAR FROM pay_date) = $1
       ORDER BY pay_date`,
      [year]
    )
    const rows = [STUB_HEADER]
    for (const { id } of runIds) {
      const data = await getRunWithItems(id)
      if (data) rows.push(...data.items.map((i) => stubRow(data.run, i)))
    }
    return send(res, `payroll_${year}.csv`, csv(rows))
  } catch (err) {
    const status = err?.status || 500
    if (status >= 500) {
      console.error('[payroll-export]', err)
      return res.status(500).json({ error: 'Server error' })
    }
    return res.status(status).json({ error: err.message })
  }
}
