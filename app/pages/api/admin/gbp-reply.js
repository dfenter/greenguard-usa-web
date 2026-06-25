import { requireAdmin } from '../../../lib/auth'
import { replyToReview } from '../../../lib/gbp'
import { invalidate } from '../../../lib/cache'

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return
  if (req.method !== 'POST') return res.status(405).end()

  const { reviewName, comment } = req.body || {}
  if (!reviewName || !comment?.trim()) return res.status(400).json({ error: 'reviewName and comment required' })

  try {
    const ok = await replyToReview(reviewName, comment.trim())
    if (!ok) return res.status(500).json({ error: 'Reply failed' })
    await invalidate('gbp:overview')
    return res.status(200).json({ ok: true })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
