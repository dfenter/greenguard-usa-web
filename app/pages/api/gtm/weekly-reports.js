// GET: list gtm_weekly_reports (most recent first).
// POST: save (or update) the current week's report.
const { requireGtm } = require('../../../lib/auth')
const { q } = require('../../../lib/db')
const { resolveProduct } = require('../../../lib/gtm-products')

export default async function handler(req, res) {
  const session = await requireGtm(req, res)
  if (!session) return

  const product = resolveProduct(req)

  if (req.method === 'GET') {
    const { rows } = await q(`SELECT id, week_start, email, payload, created_at FROM gtm_weekly_reports WHERE product = $1 ORDER BY week_start DESC LIMIT 26`, [product])
    return res.status(200).json({ rows })
  }

  if (req.method === 'POST') {
    const { week_start, counts, notes } = req.body || {}
    if (typeof week_start !== 'string' || !week_start.trim()) return res.status(400).json({ error: 'week_start required' })

    const payload = { counts: counts || {}, notes: notes || {} }
    const { rows } = await q(
      `INSERT INTO gtm_weekly_reports (week_start, email, payload, product) VALUES ($1, $2, $3::jsonb, $4) RETURNING id`,
      [week_start, session.email, JSON.stringify(payload), product]
    )
    return res.status(200).json({ ok: true, id: rows[0].id })
  }

  return res.status(405).end()
}
