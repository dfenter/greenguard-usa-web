// Payroll runs — preview, create (draft), finalize, void, re-post to books.
// Owner only.
//
// The lifecycle is deliberately two-step:
//   preview  → nothing persisted, safe to poke at
//   create   → draft run + paystubs written, timesheet entries claimed
//   finalize → entries flip to 'paid', run posted to the books ledger
//   void     → entries released back to 'approved', book entries reversed
// A draft exists so the owner can eyeball net pay before anything is locked.
import { requireOwner } from '../../../lib/auth'
import {
  previewRun, createRun, finalizeRun, voidRun, postRunToBooks,
  listRuns, getRunWithItems, getSettings, ytdTotals, isDateStr,
} from '../../../lib/payroll-store'
import { suggestPeriod, form941DueDate } from '../../../lib/payroll'

// Adjustments arrive as { employeeId: {bonusCents, otherDeductionCents, ...} }.
// The store clamps the numbers; this rejects a malformed shape outright so a
// typo can't quietly become a $0 adjustment on the wrong person.
function validateAdjustments(raw) {
  if (raw === undefined || raw === null) return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw Object.assign(new Error('adjustments must be an object keyed by employee id'), { status: 400 })
  }
  const out = {}
  for (const [key, val] of Object.entries(raw)) {
    const id = Number(key)
    if (!Number.isInteger(id) || id <= 0) {
      throw Object.assign(new Error(`adjustments key "${key}" is not an employee id`), { status: 400 })
    }
    if (!val || typeof val !== 'object') continue
    out[id] = {
      bonusCents: Number(val.bonusCents) || 0,
      otherDeductionCents: Number(val.otherDeductionCents) || 0,
      otherDeductionLabel: val.otherDeductionLabel ? String(val.otherDeductionLabel).slice(0, 120) : null,
    }
  }
  return out
}

export default async function handler(req, res) {
  const session = await requireOwner(req, res)
  if (!session) return
  res.setHeader('Cache-Control', 'no-store')

  try {
    if (req.method === 'GET') {
      const runId = req.query.id === undefined ? 0 : Number(req.query.id)
      if (req.query.id !== undefined && !Number.isInteger(runId)) {
        return res.status(400).json({ error: 'id must be a number' })
      }
      if (runId) {
        const data = await getRunWithItems(runId)
        if (!data) return res.status(404).json({ error: 'Run not found' })
        // YTD *through this run's pay date* — a March stub must not show
        // December's totals when it's reprinted.
        const items = await Promise.all(
          data.items.map(async (item) => ({
            ...item,
            ytdThrough: await ytdTotals({
              employeeId: item.employeeId,
              year: data.run.taxYear,
              throughPayDate: data.run.payDate,
            }),
          }))
        )
        return res.json({
          ...data,
          items,
          settings: await getSettings(),
          form941Due: form941DueDate(data.run.payDate),
        })
      }
      const [runs, settings] = await Promise.all([listRuns({ limit: Number(req.query.limit) || 24 }), getSettings()])
      return res.json({ runs, settings })
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST')
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const { action } = req.body || {}
    const adjustments = validateAdjustments(req.body?.adjustments)

    if (action === 'preview') {
      const { periodStart, periodEnd, payDate, employeeIds, runId } = req.body
      const settings = await getSettings()
      if (!isDateStr(periodEnd || payDate)) {
        return res.status(400).json({ error: 'Provide periodStart + periodEnd, or a payDate' })
      }
      const period = isDateStr(periodStart) && isDateStr(periodEnd)
        ? { start: periodStart, end: periodEnd }
        : suggestPeriod(periodEnd || payDate, settings.defaultPayFrequency)
      const preview = await previewRun({
        periodStart: period.start,
        periodEnd: period.end,
        payDate: payDate || period.end,
        employeeIds: Array.isArray(employeeIds) && employeeIds.length ? employeeIds.map(Number) : null,
        adjustments,
        runId: runId ? Number(runId) : null,
      })
      return res.json({ ok: true, preview, form941Due: form941DueDate(preview.payDate) })
    }

    if (action === 'create') {
      const { periodStart, periodEnd, payDate, employeeIds, notes } = req.body
      const data = await createRun({
        periodStart, periodEnd, payDate,
        employeeIds: Array.isArray(employeeIds) && employeeIds.length ? employeeIds.map(Number) : null,
        adjustments,
        notes: notes ? String(notes).slice(0, 2000) : null,
        createdBy: session.email,
      })
      return res.json({ ok: true, ...data })
    }

    if (action === 'finalize') {
      const runId = Number(req.body.runId)
      if (!runId) return res.status(400).json({ error: 'runId required' })
      const data = await finalizeRun({ runId, actorEmail: session.email })
      return res.json({ ok: true, ...data })
    }

    if (action === 'void') {
      const runId = Number(req.body.runId)
      if (!runId) return res.status(400).json({ error: 'runId required' })
      const data = await voidRun({ runId, actorEmail: session.email })
      return res.json({ ok: true, ...data })
    }

    if (action === 'post-books') {
      const runId = Number(req.body.runId)
      if (!runId) return res.status(400).json({ error: 'runId required' })
      const result = await postRunToBooks(runId)
      return res.json({ ok: true, ...result })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (err) {
    // A CHECK violation here is almost always the owner's dates: the pay date
    // must be on/after the period end, and its year sets the tax year.
    if (err?.code === '23514') {
      return res.status(400).json({
        error: 'Those dates are not valid: the pay date must be on or after the period end.',
      })
    }
    const status = err?.status || 500
    if (status >= 500) {
      console.error('[payroll-run]', err)
      return res.status(500).json({ error: 'Server error' })
    }
    return res.status(status).json({ error: err.message })
  }
}
