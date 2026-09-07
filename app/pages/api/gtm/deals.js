// GET (by firm) / POST {firm, stage, next_action?, next_date?, blockers?}
// upserts gtm_deals. Supports the firm-page stage editor.
const { requireGtm } = require('../../../lib/auth')
const { q } = require('../../../lib/db')

const STAGES = ['Contacted', 'Call booked', 'Review delivered', 'Partner signed', 'Pilot live', 'Production measured']

export default async function handler(req, res) {
  const session = await requireGtm(req, res)
  if (!session) return

  if (req.method === 'GET') {
    const { firm } = req.query || {}
    if (typeof firm !== 'string' || !firm.trim()) return res.status(400).json({ error: 'firm required' })
    const { rows } = await q(`SELECT * FROM gtm_deals WHERE firm = $1`, [firm])
    return res.status(200).json({ deal: rows[0] || null })
  }

  if (req.method === 'POST') {
    const { firm, stage, next_action, next_date, blockers } = req.body || {}
    if (typeof firm !== 'string' || !firm.trim()) return res.status(400).json({ error: 'firm required' })
    if (!STAGES.includes(stage)) return res.status(400).json({ error: `stage must be one of: ${STAGES.join(', ')}` })

    await q(
      `INSERT INTO gtm_deals (firm, stage, next_action, next_date, blockers, owner, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (firm) DO UPDATE SET stage = $2, next_action = $3, next_date = $4, blockers = $5, owner = $6, updated_at = now()`,
      [firm, stage, next_action || null, next_date || null, blockers || null, session.email]
    )
    return res.status(200).json({ ok: true })
  }

  return res.status(405).end()
}
