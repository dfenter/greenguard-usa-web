const { requireOwner } = require('../../../lib/auth')
const { listAllCustomers, listAllInvoicesSince } = require('../../../lib/stripe')

function toCSV(rows, headers) {
  const escape = (v) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n')
}

export default async function handler(req, res) {
  const session = await requireOwner(req, res)
  if (!session) return

  const { type } = req.query

  if (type === 'clients') {
    const raw = await listAllCustomers()
    const rows = raw.map((c) => {
      const subs = c.subscriptions?.data || []
      const sub = subs.find((s) => s.status === 'active') || subs[0] || null
      return {
        name: c.name || '',
        email: c.email || '',
        phone: c.phone || '',
        address: c.address?.line1 || '',
        city: c.address?.city || '',
        state: c.address?.state || '',
        status: sub?.status || 'inactive',
        plan: sub?.items?.data?.map((i) => i.price.nickname || i.price.id).join('+') || '',
        mrr: sub ? (sub.items.data.reduce((s, i) => s + (i.price.unit_amount || 0), 0) / 100).toFixed(2) : '0.00',
        created: new Date(c.created * 1000).toISOString().slice(0, 10),
      }
    })
    const csv = toCSV(rows, ['name', 'email', 'phone', 'address', 'city', 'state', 'status', 'plan', 'mrr', 'created'])
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="greenguard-clients-${new Date().toISOString().slice(0, 10)}.csv"`)
    return res.status(200).send(csv)
  }

  if (type === 'revenue') {
    const oneYearAgo = Math.floor(new Date(new Date().getFullYear() - 1, new Date().getMonth(), 1).getTime() / 1000)
    const invoices = await listAllInvoicesSince(oneYearAgo)
    const rows = invoices.map((inv) => ({
      date: new Date(inv.created * 1000).toISOString().slice(0, 10),
      customer: inv.customer_details?.email || '',
      amount: (inv.amount_paid / 100).toFixed(2),
      status: inv.status,
      invoice_id: inv.id,
    }))
    const csv = toCSV(rows, ['date', 'customer', 'amount', 'status', 'invoice_id'])
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="greenguard-revenue-${new Date().toISOString().slice(0, 10)}.csv"`)
    return res.status(200).send(csv)
  }

  res.status(400).json({ error: 'type must be clients or revenue' })
}
