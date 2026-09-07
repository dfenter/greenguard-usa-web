// GET (by firm): list call reports for the firm page.
const { requireGtm } = require('../../../lib/auth')
const { q } = require('../../../lib/db')

export default async function handler(req, res) {
  const session = await requireGtm(req, res)
  if (!session) return

  if (req.method !== 'GET') return res.status(405).end()

  const { firm } = req.query || {}
  if (typeof firm !== 'string' || !firm.trim()) return res.status(400).json({ error: 'firm required' })

  const { rows } = await q(
    `SELECT id, firm, email, contact_email, payload, created_at FROM gtm_call_reports WHERE firm = $1 ORDER BY created_at DESC`,
    [firm]
  )
  return res.status(200).json({ rows })
}
