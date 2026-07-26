// Triggered manually from /admin/books — runs one batch of LLM categorization.
// Returns the assignments so the UI can confirm + offer rerun.

const { getSessionFromRequest, isOwnerEmail } = require('../../../lib/auth')
const { categorizeBatch } = require('../../../lib/books-categorize')

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isOwnerEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const limit = Math.min(parseInt(req.body?.limit || '25', 10) || 25, 100)
  try {
    const r = await categorizeBatch({ limit })
    return res.status(200).json(r)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
