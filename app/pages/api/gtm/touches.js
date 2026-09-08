// GET (by firm) / POST {firm, person, touch 1-4, channel, reply?} inserts
// gtm_touches.
const { requireGtm } = require('../../../lib/auth')
const { q } = require('../../../lib/db')
const { resolveProduct } = require('../../../lib/gtm-products')

export default async function handler(req, res) {
  const session = await requireGtm(req, res)
  if (!session) return

  const product = resolveProduct(req)

  if (req.method === 'GET') {
    const { firm } = req.query || {}
    if (typeof firm !== 'string' || !firm.trim()) return res.status(400).json({ error: 'firm required' })
    const { rows } = await q(
      `SELECT id, firm, person, touch, channel, sent_at, reply, notes FROM gtm_touches WHERE firm = $1 AND product = $2 ORDER BY sent_at DESC`,
      [firm, product]
    )
    return res.status(200).json({ rows })
  }

  if (req.method === 'POST') {
    const { firm, person, touch, channel, reply, notes } = req.body || {}
    if (typeof firm !== 'string' || !firm.trim()) return res.status(400).json({ error: 'firm required' })
    if (typeof person !== 'string' || !person.trim()) return res.status(400).json({ error: 'person required' })
    if (!Number.isInteger(touch) || touch < 1 || touch > 4) return res.status(400).json({ error: 'touch must be an integer 1-4' })
    if (typeof channel !== 'string' || !channel.trim()) return res.status(400).json({ error: 'channel required' })

    const result = await q(
      `INSERT INTO gtm_touches (firm, person, touch, channel, reply, notes, product)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [firm, person, touch, channel, Boolean(reply), typeof notes === 'string' ? notes : null, product]
    )
    return res.status(200).json({ ok: true, id: result.rows[0].id })
  }

  return res.status(405).end()
}
