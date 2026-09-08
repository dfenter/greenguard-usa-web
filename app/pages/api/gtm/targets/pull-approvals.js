// POST, OWNER ONLY: pulls approve + dan_notes from the sheet into
// gtm_targets_state. Explicit user-triggered action, never automatic.
const { requireGtm, isOwnerEmail } = require('../../../../lib/auth')
const { pullApprovals } = require('../../../../lib/gtm-sheets')
const { resolveProduct } = require('../../../../lib/gtm-products')

export default async function handler(req, res) {
  const session = await requireGtm(req, res)
  if (!session) return
  if (!isOwnerEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  if (req.method !== 'POST') return res.status(405).end()

  const product = resolveProduct(req)
  try {
    const result = await pullApprovals(product)
    return res.status(200).json(result)
  } catch (e) {
    console.error('pull-approvals failed:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
