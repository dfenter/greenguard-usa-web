/**
 * GET /api/admin/meta-insights
 * Returns Facebook page info + 28-day insights
 */
const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const meta = require('../../../lib/meta')

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  if (!process.env.META_ACCESS_TOKEN || !process.env.META_PAGE_ID) {
    return res.status(200).json({ configured: false })
  }

  try {
    const [pageInfo, insights, recentPosts] = await Promise.all([
      meta.getPageInfo().catch(() => null),
      meta.getPageInsights(28).catch(() => null),
      meta.getRecentPosts(5).catch(() => null),
    ])
    return res.status(200).json({ configured: true, pageInfo, insights, recentPosts })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
