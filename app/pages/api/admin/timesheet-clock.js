// Clock in / clock out. Separate from /api/admin/timesheet because it is the
// one endpoint the tech hits from a phone with one thumb, and it must be
// idempotent under double-taps and flaky LTE:
//   - clock in twice  → the same open entry comes back (COALESCE on clock_in)
//   - clock out twice → 409 "You are not clocked in" instead of zeroing hours
import { requireAdmin, isOwnerEmail } from '../../../lib/auth'
import {
  getEmployeeByEmail, getEmployeeById, clockIn, clockOut, getOpenClock,
} from '../../../lib/payroll-store'

export default async function handler(req, res) {
  const session = await requireAdmin(req, res)
  if (!session) return
  res.setHeader('Cache-Control', 'no-store')

  try {
    let employee = await getEmployeeByEmail(session.email)

    // The owner may clock an employee in/out on their behalf (phone died, etc).
    const onBehalfOf = Number(req.body?.employeeId || req.query?.employeeId) || null
    if (onBehalfOf && (!employee || onBehalfOf !== employee.id)) {
      if (!isOwnerEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })
      employee = await getEmployeeById(onBehalfOf)
    }
    if (!employee) {
      return res.status(404).json({
        error: 'No employee record is linked to your login. Ask the owner to add you on the Payroll page.',
      })
    }
    if (!employee.active) return res.status(400).json({ error: 'That employee is inactive' })

    if (req.method === 'GET') {
      const openClock = await getOpenClock(employee.id)
      return res.json({ employeeId: employee.id, openClock })
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST')
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const action = req.body?.action
    if (action === 'in') {
      const entry = await clockIn({ employeeId: employee.id })
      return res.json({ ok: true, action: 'in', entry })
    }
    if (action === 'out') {
      const entry = await clockOut({ employeeId: employee.id })
      return res.json({ ok: true, action: 'out', entry })
    }
    return res.status(400).json({ error: "action must be 'in' or 'out'" })
  } catch (err) {
    const status = err?.status || 500
    if (status >= 500) {
      console.error('[timesheet-clock]', err)
      return res.status(500).json({ error: 'Server error' })
    }
    // `code`/`workDate` let the UI offer "close that shift" on a stale clock.
    return res.status(status).json({ error: err.message, code: err.code || null, workDate: err.workDate || null })
  }
}
