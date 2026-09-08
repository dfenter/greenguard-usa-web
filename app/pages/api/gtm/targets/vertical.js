// POST {firm, vertical} updates gtm_targets_state.vertical.
const { requireGtm } = require('../../../../lib/auth')
const { q } = require('../../../../lib/db')
const { resolveProduct } = require('../../../../lib/gtm-products')

export default async function handler(req, res) {
  const session = await requireGtm(req, res)
  if (!session) return

  if (req.method !== 'POST') return res.status(405).end()

  const product = resolveProduct(req)
  const { firm, vertical } = req.body || {}
  if (typeof firm !== 'string' || !firm.trim()) return res.status(400).json({ error: 'firm required' })
  if (typeof vertical !== 'string') return res.status(400).json({ error: 'vertical required' })

  await q(
    `INSERT INTO gtm_targets_state (firm, vertical, updated_at, product) VALUES ($1, $2, now(), $3)
     ON CONFLICT (product, firm) DO UPDATE SET vertical = $2, updated_at = now()`,
    [firm, vertical, product]
  )

  return res.status(200).json({ ok: true })
}
