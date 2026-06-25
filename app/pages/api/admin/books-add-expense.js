import { getSessionFromRequest, isAdminEmail } from '../../../lib/auth'
import { q } from '../../../lib/db'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(401).json({ error: 'Unauthorized' })

  const { occurred_at, amount_dollars, description, category_label } = req.body
  if (!occurred_at || !amount_dollars || !description || !category_label) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const catRow = await q('SELECT id FROM categories WHERE label = $1', [category_label])
  const category_id = catRow.rows[0]?.id || null

  const cents = -Math.abs(Math.round(parseFloat(amount_dollars) * 100))
  const ext_id = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  await q(
    `INSERT INTO transactions (source, external_id, occurred_at, amount_cents, type, description, category_id, category_label)
     VALUES ('manual', $1, $2, $3, 'manual', $4, $5, $6)`,
    [ext_id, occurred_at, cents, description, category_id, category_label]
  )

  res.json({ ok: true })
}
