// POST {firm, vertical} updates gtm_targets_state.vertical.
const { requireGtm } = require('../../../../lib/auth')
const { q } = require('../../../../lib/db')

export default async function handler(req, res) {
  const session = await requireGtm(req, res)
  if (!session) return

  if (req.method !== 'POST') return res.status(405).end()

  const { firm, vertical } = req.body || {}
  if (typeof firm !== 'string' || !firm.trim()) return res.status(400).json({ error: 'firm required' })
  if (typeof vertical !== 'string') return res.status(400).json({ error: 'vertical required' })

  await q(
    `INSERT INTO gtm_targets_state (firm, vertical, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (firm) DO UPDATE SET vertical = $2, updated_at = now()`,
    [firm, vertical]
  )

  return res.status(200).json({ ok: true })
}
