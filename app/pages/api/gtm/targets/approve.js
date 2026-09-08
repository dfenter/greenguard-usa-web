// POST {firm, approved, dan_notes} OWNER ONLY.
const { requireGtm, isOwnerEmail } = require('../../../../lib/auth')
const { q } = require('../../../../lib/db')
const { writeTargetCells } = require('../../../../lib/gtm-sheets')
const { resolveProduct } = require('../../../../lib/gtm-products')

export default async function handler(req, res) {
  const session = await requireGtm(req, res)
  if (!session) return
  if (!isOwnerEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  if (req.method !== 'POST') return res.status(405).end()

  const product = resolveProduct(req)
  const { firm, approved, dan_notes } = req.body || {}
  if (typeof firm !== 'string' || !firm.trim()) return res.status(400).json({ error: 'firm required' })
  if (typeof approved !== 'boolean') return res.status(400).json({ error: 'approved must be boolean' })

  await q(
    `INSERT INTO gtm_targets_state (firm, approved, approved_by, approved_at, dan_notes, updated_at, product)
     VALUES ($1, $2, $3, now(), $4, now(), $5)
     ON CONFLICT (product, firm) DO UPDATE SET approved = $2, approved_by = $3, approved_at = now(), dan_notes = $4, updated_at = now()`,
    [firm, approved, session.email, typeof dan_notes === 'string' ? dan_notes : null, product]
  )

  const sheet = await writeTargetCells(firm, { approve: approved ? 'Y' : 'N', dan_notes: dan_notes || '' }, product)

  return res.status(200).json({ ok: true, sheet })
}
