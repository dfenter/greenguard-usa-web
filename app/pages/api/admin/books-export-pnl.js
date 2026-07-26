import { getSessionFromRequest, isOwnerEmail } from '../../../lib/auth'
import { q } from '../../../lib/db'

function monthBounds(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number)
  return {
    start: new Date(Date.UTC(y, m - 1, 1)),
    end: new Date(Date.UTC(y, m, 1)),
    label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isOwnerEmail(session.email)) return res.status(401).json({ error: 'Unauthorized' })

  const { month, ytd } = req.query
  let start, end, label

  if (ytd) {
    const y = parseInt(ytd, 10)
    start = new Date(Date.UTC(y, 0, 1))
    end = new Date(Date.UTC(y + 1, 0, 1))
    label = `YTD ${y}`
  } else if (month) {
    ;({ start, end, label } = monthBounds(month))
  } else {
    return res.status(400).json({ error: 'Provide ?month=YYYY-MM or ?ytd=YYYY' })
  }

  const rows = await q(
    `SELECT category_label,
            SUM(CASE WHEN amount_cents > 0 THEN amount_cents ELSE 0 END)::bigint AS inflow_cents,
            SUM(CASE WHEN amount_cents < 0 THEN amount_cents ELSE 0 END)::bigint AS outflow_cents,
            SUM(amount_cents)::bigint AS net_cents,
            COUNT(*)::int AS txn_count
     FROM transactions
     WHERE occurred_at >= $1 AND occurred_at < $2
     GROUP BY category_label
     ORDER BY SUM(amount_cents) DESC`,
    [start.toISOString(), end.toISOString()]
  )

  const totalIn = rows.rows.reduce((s, r) => s + Number(r.inflow_cents || 0), 0)
  const totalOut = rows.rows.reduce((s, r) => s + Number(r.outflow_cents || 0), 0)

  const lines = [
    ['GreenGuard USA — P&L Export', label],
    [],
    ['Category', 'Inflow', 'Outflow', 'Net', 'Transactions'],
    ...rows.rows.map((r) => [
      r.category_label || '(uncategorized)',
      (Number(r.inflow_cents) / 100).toFixed(2),
      (Number(r.outflow_cents) / 100).toFixed(2),
      (Number(r.net_cents) / 100).toFixed(2),
      r.txn_count,
    ]),
    [],
    ['TOTAL INFLOW', (totalIn / 100).toFixed(2)],
    ['TOTAL OUTFLOW', (totalOut / 100).toFixed(2)],
    ['NET', ((totalIn + totalOut) / 100).toFixed(2)],
  ]

  const csv = lines.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const filename = `greenguard-pnl-${label.replace(/\s+/g, '-').toLowerCase()}.csv`

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(csv)
}
