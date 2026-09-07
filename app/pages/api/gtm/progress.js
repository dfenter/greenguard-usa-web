// GET returns this user's gtm_progress rows.
// POST {item_id, done} upserts, scoped to session.email.
const { requireGtm } = require('../../../lib/auth')
const { q } = require('../../../lib/db')

export default async function handler(req, res) {
  const session = await requireGtm(req, res)
  if (!session) return

  if (req.method === 'GET') {
    const { rows } = await q(`SELECT item_id, done, done_at FROM gtm_progress WHERE email = $1`, [session.email])
    return res.status(200).json({ rows })
  }

  if (req.method === 'POST') {
    const { item_id, done } = req.body || {}
    if (typeof item_id !== 'string' || !item_id.trim()) return res.status(400).json({ error: 'item_id required' })
    if (typeof done !== 'boolean') return res.status(400).json({ error: 'done must be boolean' })
    await q(
      `INSERT INTO gtm_progress (email, item_id, done, done_at)
       VALUES ($1, $2, $3, CASE WHEN $3 THEN now() ELSE NULL END)
       ON CONFLICT (email, item_id) DO UPDATE SET done = $3, done_at = CASE WHEN $3 THEN now() ELSE NULL END`,
      [session.email, item_id, done]
    )
    return res.status(200).json({ ok: true })
  }

  return res.status(405).end()
}
