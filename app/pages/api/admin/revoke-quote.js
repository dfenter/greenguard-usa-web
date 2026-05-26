// POST /api/admin/revoke-quote { jti }
// Revokes a quote token so the existing link can no longer be paid against.
const { requireAdmin, revokeJti } = require('../../../lib/auth')

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await requireAdmin(req, res)
  if (!session) return
  const { jti } = req.body || {}
  if (!jti || !/^[a-f0-9]{16,}$/.test(jti)) return res.status(400).json({ error: 'jti required' })
  await revokeJti(jti)
  return res.status(200).json({ ok: true })
}
