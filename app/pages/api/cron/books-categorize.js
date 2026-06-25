// Cron-key authenticated categorizer. Runs up to `limit` Unknown transactions
// through the LLM categorizer. Call repeatedly until it returns processed=0.
//
// POST /api/cron/books-categorize?limit=25

const { authorize } = require('../../../lib/cron-auth')
const { categorizeBatch } = require('../../../lib/books-categorize')

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!authorize(req, res)) return

  const limit = Math.min(parseInt(req.query.limit || '25', 10) || 25, 50)

  try {
    const result = await categorizeBatch({ limit })
    return res.status(200).json({ ok: true, ...result })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message })
  }
}
