// Timesheet entries — read/create/edit/delete.
//
// Authorization model: any admin-level login (owner or tech) may read and edit
// THEIR OWN entries. Touching somebody else's entries, or approving anything,
// requires the owner. The actor's employee record is resolved from the session
// email, so a tech can never spoof an employee_id.
import { requireAdmin, isOwnerEmail } from '../../../lib/auth'
import {
  getEmployeeByEmail, getEmployeeById, listEntries, getEntry,
  upsertEntry, patchEntry, deleteEntry, setEntryStatus, getOpenClock, today,
  getSettings, listAllEntries,
} from '../../../lib/payroll-store'
import { computeEarnings, workweekStart, entryHours } from '../../../lib/payroll'

function fail(res, err) {
  const status = err?.status || 500
  if (status >= 500) {
    // Never echo the raw Postgres message — it leaks constraint and column names.
    console.error('[timesheet]', err)
    return res.status(500).json({ error: 'Server error' })
  }
  return res.status(status).json({ error: err?.message || 'Request failed' })
}

// A tech may see their own hours and rate, never the business tax identifiers
// or the owner's HR notes.
// `paidHours` is what payroll actually pays for the day (gross hours less the
// unpaid break). Every screen shows this, so nobody approves one number and
// pays another.
function withPaidHours(entries) {
  return entries.map((e) => ({ ...e, paidHours: entryHours(e), running: Boolean(e.clock_in && !e.clock_out) }))
}

function publicSettings(settings) {
  return { weekStartDay: settings.weekStartDay, mileageRateCents: settings.mileageRateCents }
}

function publicEmployee(emp) {
  return {
    id: emp.id, name: emp.name, email: emp.email,
    pay_type: emp.pay_type, ot_eligible: emp.ot_eligible, ot_threshold_hours: emp.ot_threshold_hours,
    hourly_rate_cents: emp.hourly_rate_cents, per_stop_cents: emp.per_stop_cents,
    mileage_rate_cents: emp.mileage_rate_cents, active: emp.active,
  }
}

export default async function handler(req, res) {
  const session = await requireAdmin(req, res)
  if (!session) return
  const isOwner = isOwnerEmail(session.email)
  // Pay figures must not sit in a shared cache.
  res.setHeader('Cache-Control', 'no-store')

  try {
    const me = await getEmployeeByEmail(session.email)

    // Resolve which employee this request is about and enforce ownership.
    async function targetEmployee(raw) {
      const wanted = raw === undefined || raw === null || raw === '' ? null : Number(raw)
      if (wanted && (!me || wanted !== me.id)) {
        if (!isOwner) { const e = new Error('Forbidden'); e.status = 403; throw e }
        const emp = await getEmployeeById(wanted)
        if (!emp) { const e = new Error('Employee not found'); e.status = 404; throw e }
        return emp
      }
      if (!me) {
        const e = new Error('No employee record is linked to your login. Ask the owner to add you on the Payroll page.')
        e.status = 404
        throw e
      }
      return me
    }

    if (req.method === 'GET') {
      const { from, to, employeeId, all, status } = req.query
      const settings = await getSettings()

      // ?all=1 — owner-wide view used by the payroll review screen.
      if (all) {
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' })
        // Paged, not capped: silently dropping rows would hide time from the
        // approval queue.
        const { entries, truncated } = await listAllEntries({
          from, to,
          status: status ? String(status).split(',') : undefined,
        })
        return res.json({ entries: withPaidHours(entries), truncated, settings, isOwner, me })
      }


      const emp = await targetEmployee(employeeId)
      const entries = await listEntries({ employeeId: emp.id, from, to, limit: 400 })
      const openClock = await getOpenClock(emp.id)
      // Live week totals so the tech sees overtime coming before it lands.
      // Note the projections below: the Payroll page is the only place rates
      // and W-4 data are served in full.
      const weekStart = workweekStart(today(), settings.weekStartDay)
      const weekEntries = entries.filter((e) => e.work_date >= weekStart)
      const week = computeEarnings({ employee: emp, entries: weekEntries, weekStartDay: settings.weekStartDay })
      return res.json({
        employee: publicEmployee(emp), entries: withPaidHours(entries), openClock,
        settings: publicSettings(settings), isOwner,
        week: {
          weekStart,
          hours: week.totalHours,
          regularHours: week.regularHours,
          otHours: week.otHours,
          stops: week.stops,
          miles: week.miles,
          estimatedPayCents: week.basePayCents + week.piecePayCents + week.makeupPayCents + week.otPremiumCents,
          // Salary is a whole-period figure, not a weekly one — the UI labels it.
          payBasis: emp.pay_type === 'salary' ? 'period-salary' : 'week',
          reimbursementCents: week.reimbursementCents,
        },
      })
    }

    if (req.method === 'POST') {
      const { employeeId, workDate, hours, breakMinutes, stops, miles, notes, submit } = req.body || {}
      const emp = await targetEmployee(employeeId)
      const entry = await upsertEntry({
        employeeId: emp.id,
        workDate: workDate || today(),
        hours, breakMinutes, stops, miles, notes,
      })
      if (submit && entry.status === 'open') {
        const [updated] = await setEntryStatus({ ids: [entry.id], status: 'submitted' })
        return res.json({ ok: true, entry: updated || entry })
      }
      return res.json({ ok: true, entry })
    }

    if (req.method === 'PATCH') {
      const { id, action, ids, ...patch } = req.body || {}

      // Bulk status transitions.
      if (action) {
        const targetIds = (ids || (id ? [id] : [])).map(Number).filter(Boolean)
        if (!targetIds.length) return res.status(400).json({ error: 'ids required' })

        if (action === 'approve' || action === 'unapprove') {
          if (!isOwner) return res.status(403).json({ error: 'Only the owner can approve timesheets' })
          const entries = await setEntryStatus({
            ids: targetIds,
            status: action === 'approve' ? 'approved' : 'submitted',
            actorEmail: session.email,
          })
          return res.json({ ok: true, entries })
        }
        if (action === 'submit') {
          // A tech may only submit their own rows.
          if (!isOwner) {
            if (!me) return res.status(404).json({ error: 'No employee record linked to your login' })
            const rows = await Promise.all(targetIds.map((i) => getEntry(i)))
            if (rows.some((r) => !r || r.employee_id !== me.id)) {
              return res.status(403).json({ error: 'Forbidden' })
            }
          }
          const entries = await setEntryStatus({ ids: targetIds, status: 'submitted' })
          return res.json({ ok: true, entries })
        }
        return res.status(400).json({ error: `Unknown action: ${action}` })
      }

      // Field edit on a single entry.
      const entryId = Number(id)
      if (!entryId) return res.status(400).json({ error: 'id required' })
      const existing = await getEntry(entryId)
      if (!existing) return res.status(404).json({ error: 'Entry not found' })
      if (!isOwner && (!me || existing.employee_id !== me.id)) {
        return res.status(403).json({ error: 'Forbidden' })
      }
      const entry = await patchEntry(entryId, patch)
      return res.json({ ok: true, entry })
    }

    if (req.method === 'DELETE') {
      const entryId = Number(req.query.id || req.body?.id)
      if (!entryId) return res.status(400).json({ error: 'id required' })
      const existing = await getEntry(entryId)
      if (!existing) return res.status(404).json({ error: 'Entry not found' })
      if (!isOwner && (!me || existing.employee_id !== me.id)) {
        return res.status(403).json({ error: 'Forbidden' })
      }
      // Approved time is a wage record (FLSA §516 — keep 2 years). The crew can
      // delete their own un-approved days; removing approved time is the
      // owner's call.
      if (!isOwner && existing.status === 'approved') {
        return res.status(403).json({ error: 'That day is already approved — ask Dan to remove it.' })
      }
      await deleteEntry(entryId)
      return res.json({ ok: true })
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    return fail(res, err)
  }
}
