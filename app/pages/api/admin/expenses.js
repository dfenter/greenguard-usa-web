// Expense claims / receipts.
//
// Same authorization shape as the timesheet: any admin login manages THEIR OWN
// receipts; approving, rejecting, and looking at anyone else's is the owner's.
// The submitting employee is resolved from the session, never from the body.
import { requireAdmin, isOwnerEmail } from '../../../lib/auth'
import {
  getEmployeeByEmail, getEmployeeById, listEmployees,
  listExpenses, getExpense, createExpense, updateExpense, deleteExpense,
  approveExpense, rejectExpense, postExpenseToBooks, listExpenseCategories,
  expenseTotals, expenseTotalsForEmployee, today,
} from '../../../lib/payroll-store'

function fail(res, err) {
  const status = err?.status || 500
  if (status >= 500) {
    console.error('[expenses]', err)
    return res.status(500).json({ error: 'Server error' })
  }
  return res.status(status).json({ error: err?.message || 'Request failed' })
}

export default async function handler(req, res) {
  const session = await requireAdmin(req, res)
  if (!session) return
  const isOwner = isOwnerEmail(session.email)
  res.setHeader('Cache-Control', 'no-store')

  try {
    const me = await getEmployeeByEmail(session.email)

    // Which employee this request is about, with the ownership check.
    async function target(raw) {
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
      const categories = await listExpenseCategories()

      if (all) {
        if (!isOwner) return res.status(403).json({ error: 'Forbidden' })
        // Totals come from a SUM over every row, not from this page — a capped
        // list would quietly under-report what is owed.
        const [expenses, employees, totals] = await Promise.all([
          listExpenses({ from, to, status: status ? String(status).split(',') : undefined, limit: 1000 }),
          listEmployees(),
          expenseTotals(),
        ])
        return res.json({
          expenses,
          employees: employees.map((e) => ({ id: e.id, name: e.name, active: e.active })),
          categories,
          isOwner,
          totals,
        })
      }

      const emp = await target(employeeId)
      const [expenses, totals] = await Promise.all([
        listExpenses({ employeeId: emp.id, from, to, limit: 400 }),
        expenseTotalsForEmployee(emp.id),
      ])
      return res.json({ employee: { id: emp.id, name: emp.name }, expenses, categories, isOwner, totals })
    }

    if (req.method === 'POST') {
      const {
        employeeId, incurredOn, amountDollars, amountCents, vendor, description,
        categoryLabel, paymentMethod, receiptUrl, receiptMime, receiptBytes,
      } = req.body || {}
      const emp = await target(employeeId)
      const cents = amountCents != null
        ? Math.round(Number(amountCents))
        : Math.round((Number(amountDollars) || 0) * 100)

      const claim = await createExpense({
        employeeId: emp.id,
        incurredOn: incurredOn || today(),
        amountCents: cents,
        vendor, description, categoryLabel,
        paymentMethod, receiptUrl, receiptMime, receiptBytes,
      })
      return res.json({ ok: true, expense: claim })
    }

    if (req.method === 'PATCH') {
      const { id, action, reason, notes, ...patch } = req.body || {}
      const claimId = Number(id)
      if (!claimId) return res.status(400).json({ error: 'id required' })
      const existing = await getExpense(claimId)
      if (!existing) return res.status(404).json({ error: 'Receipt not found' })

      if (action === 'approve' || action === 'reject' || action === 'post-books') {
        if (!isOwner) return res.status(403).json({ error: 'Only the owner can review receipts' })
        if (action === 'approve') {
          return res.json({ ok: true, expense: await approveExpense({ id: claimId, actorEmail: session.email, notes }) })
        }
        if (action === 'reject') {
          return res.json({ ok: true, expense: await rejectExpense({ id: claimId, actorEmail: session.email, reason }) })
        }
        const result = await postExpenseToBooks(claimId)
        return res.json({ ok: true, ...result, expense: await getExpense(claimId) })
      }

      // Field edit — own receipts only unless owner.
      if (!isOwner && (!me || existing.employeeId !== me.id)) {
        return res.status(403).json({ error: 'Forbidden' })
      }
      // Amounts arrive as dollars from the form.
      if (patch.amountDollars !== undefined) {
        patch.amount_cents = Math.round((Number(patch.amountDollars) || 0) * 100)
        delete patch.amountDollars
      }
      const expense = await updateExpense(claimId, patch)
      return res.json({ ok: true, expense })
    }

    if (req.method === 'DELETE') {
      const claimId = Number(req.query.id || req.body?.id)
      if (!claimId) return res.status(400).json({ error: 'id required' })
      const existing = await getExpense(claimId)
      if (!existing) return res.status(404).json({ error: 'Receipt not found' })
      if (!isOwner && (!me || existing.employeeId !== me.id)) {
        return res.status(403).json({ error: 'Forbidden' })
      }
      // An approved receipt is already in the books — removing it is the
      // owner's call, same rule as approved time.
      // A rejection (and its reason) is an owner action — the crew can clear
      // their own un-reviewed receipts only.
      if (!isOwner && existing.status !== 'submitted') {
        return res.status(403).json({ error: 'That receipt has already been reviewed — ask Dan to remove it.' })
      }
      await deleteExpense(claimId)
      return res.json({ ok: true })
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err?.code === '23514') return res.status(400).json({ error: 'That receipt has a value the database rejected — check the amount and date.' })
    return fail(res, err)
  }
}
