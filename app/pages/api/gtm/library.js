// GET: list gtm_library_rows (optionally filtered by kind).
// POST: insert one row. `kind` is validated against a whitelist server-side.
const { requireGtm } = require('../../../lib/auth')
const { q } = require('../../../lib/db')

const KIND_WHITELIST = ['objection', 'competitive']

export default async function handler(req, res) {
  const session = await requireGtm(req, res)
  if (!session) return

  if (req.method === 'GET') {
    const { kind } = req.query || {}
    if (kind !== undefined && !KIND_WHITELIST.includes(kind)) {
      return res.status(400).json({ error: `kind must be one of: ${KIND_WHITELIST.join(', ')}` })
    }
    const { rows } = kind
      ? await q(`SELECT * FROM gtm_library_rows WHERE kind = $1 ORDER BY created_at DESC`, [kind])
      : await q(`SELECT * FROM gtm_library_rows ORDER BY created_at DESC`)
    return res.status(200).json({ rows })
  }

  if (req.method === 'POST') {
    const { kind, data } = req.body || {}
    if (!KIND_WHITELIST.includes(kind)) {
      return res.status(400).json({ error: `kind must be one of: ${KIND_WHITELIST.join(', ')}` })
    }
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'data required' })

    const { rows } = await q(
      `INSERT INTO gtm_library_rows (kind, data, created_by) VALUES ($1, $2::jsonb, $3) RETURNING id`,
      [kind, JSON.stringify(data), session.email]
    )
    return res.status(200).json({ ok: true, id: rows[0].id })
  }

  return res.status(405).end()
}
