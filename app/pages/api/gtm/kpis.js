// GET: dashboard KPI tiles in one round trip.
const { requireGtm } = require('../../../lib/auth')
const { q } = require('../../../lib/db')
const { resolveProduct } = require('../../../lib/gtm-products')

export default async function handler(req, res) {
  const session = await requireGtm(req, res)
  if (!session) return

  if (req.method !== 'GET') return res.status(405).end()

  const product = resolveProduct(req)

  const [targetsApproved, touchesByNum, replies, calls, reviews, partners, pilots] = await Promise.all([
    q(`SELECT count(*)::int AS n FROM gtm_targets_state WHERE approved = true AND product = $1`, [product]),
    q(`SELECT count(DISTINCT firm)::int AS n FROM gtm_touches WHERE touch = 1 AND product = $1`, [product]),
    q(`SELECT count(*)::int AS n FROM gtm_touches WHERE reply = true AND product = $1`, [product]),
    q(`SELECT count(*)::int AS n FROM gtm_call_reports WHERE product = $1`, [product]),
    q(`SELECT count(*)::int AS n FROM gtm_deals WHERE stage = 'Review delivered' AND product = $1`, [product]),
    q(`SELECT count(*)::int AS n FROM gtm_deals WHERE stage = 'Partner signed' AND product = $1`, [product]),
    q(`SELECT count(*)::int AS n FROM gtm_deals WHERE stage = 'Pilot live' AND product = $1`, [product]),
  ])

  return res.status(200).json({
    targetsApproved: targetsApproved.rows[0].n,
    firstTouches: touchesByNum.rows[0].n,
    replies: replies.rows[0].n,
    calls: calls.rows[0].n,
    reviews: reviews.rows[0].n,
    partners: partners.rows[0].n,
    pilots: pilots.rows[0].n,
  })
}
