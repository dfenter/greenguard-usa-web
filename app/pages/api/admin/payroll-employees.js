// Employee roster + business payroll settings. Owner only — pay rates and W-4
// data are exactly the kind of thing the tech login must not be able to read.
import { requireOwner } from '../../../lib/auth'
import {
  listEmployees, createEmployee, updateEmployee, getSettings, updateSettings, ytdTotals,
} from '../../../lib/payroll-store'

export default async function handler(req, res) {
  const session = await requireOwner(req, res)
  if (!session) return
  res.setHeader('Cache-Control', 'no-store')

  try {
    if (req.method === 'GET') {
      const [employees, settings] = await Promise.all([listEmployees(), getSettings()])
      const year = Number(req.query.year) || new Date().getFullYear()
      const ytd = {}
      for (const emp of employees) ytd[emp.id] = await ytdTotals({ employeeId: emp.id, year })
      return res.json({ employees, settings, ytd, year })
    }

    if (req.method === 'POST') {
      const { settings, ...employee } = req.body || {}
      if (settings) return res.json({ ok: true, settings: await updateSettings(settings) })
      if (!employee.email || !employee.name) {
        return res.status(400).json({ error: 'name and email are required' })
      }
      const created = await createEmployee(employee)
      return res.json({ ok: true, employee: created })
    }

    if (req.method === 'PATCH') {
      const { id, ...patch } = req.body || {}
      if (!Number(id)) return res.status(400).json({ error: 'id required' })
      const updated = await updateEmployee(Number(id), patch)
      if (!updated) return res.status(404).json({ error: 'Employee not found' })
      return res.json({ ok: true, employee: updated })
    }

    res.setHeader('Allow', 'GET, POST, PATCH')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    // 23505 = unique violation (duplicate email); 23514 = check constraint.
    if (err?.code === '23505') return res.status(409).json({ error: 'An employee with that email already exists' })
    if (err?.code === '23514') return res.status(400).json({ error: 'Invalid value for one of the payroll fields' })
    const status = err?.status || 500
    if (status >= 500) {
      console.error('[payroll-employees]', err)
      return res.status(500).json({ error: 'Server error' })
    }
    return res.status(status).json({ error: err.message })
  }
}
