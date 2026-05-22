/**
 * POST /api/admin/meta-post
 * Post a message to the GreenGuard Facebook page
 * Body: { message, link?, imageUrl?, scheduledTime? }
 */
const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const meta = require('../../../lib/meta')

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const { message, link, imageUrl, scheduledTime } = req.body || {}
  if (!message) return res.status(400).json({ error: 'message required' })

  if (!process.env.META_ACCESS_TOKEN || !process.env.META_PAGE_ID) {
    return res.status(503).json({ error: 'Meta not configured — add META_ACCESS_TOKEN and META_PAGE_ID to Vercel env vars' })
  }

  try {
    let result
    if (imageUrl) {
      result = await meta.postPhotoToPage({ imageUrl, caption: message })
    } else if (scheduledTime) {
      result = await meta.schedulePost({ message, scheduledTime, link })
    } else {
      result = await meta.postToPage({ message, link })
    }
    return res.status(200).json({ ok: true, postId: result.id })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
