// GET: merges targets.json rows with gtm_targets_state + this user's
// gtm_scores + touch counts.
const { requireGtm } = require('../../../../lib/auth')
const { q } = require('../../../../lib/db')
const { getTargets } = require('../../../../lib/gtm-content')
const { resolveProduct } = require('../../../../lib/gtm-products')

export default async function handler(req, res) {
  const session = await requireGtm(req, res)
  if (!session) return

  if (req.method !== 'GET') return res.status(405).end()

  const product = resolveProduct(req)
  const { rows: csvRows } = getTargets(product)
  const [stateRes, scoreRes, touchRes] = await Promise.all([
    q(`SELECT firm, vertical, approved, approved_by, approved_at, dan_notes, status FROM gtm_targets_state WHERE product = $1`, [product]),
    q(`SELECT firm, s1, s2, s3, s4, s5, s6, s7, total, tier FROM gtm_scores WHERE email = $1 AND product = $2`, [session.email, product]),
    q(`SELECT firm, count(*)::int AS n FROM gtm_touches WHERE product = $1 GROUP BY firm`, [product]),
  ])
  const stateByFirm = Object.fromEntries(stateRes.rows.map((r) => [r.firm, r]))
  const scoreByFirm = Object.fromEntries(scoreRes.rows.map((r) => [r.firm, r]))
  const touchByFirm = Object.fromEntries(touchRes.rows.map((r) => [r.firm, r.n]))

  const merged = csvRows.map((row) => {
    const state = stateByFirm[row.firm] || null
    const score = scoreByFirm[row.firm] || null
    const approved = state ? state.approved : /^(y|yes|true|1)$/i.test(String(row.approve || '').trim())
    return {
      ...row,
      vertical: state?.vertical || null,
      approved,
      approved_by: state?.approved_by || null,
      approved_at: state?.approved_at || null,
      dan_notes: state?.dan_notes ?? row.dan_notes ?? '',
      status: state?.status || row.status || null,
      myScore: score,
      touchCount: touchByFirm[row.firm] || 0,
    }
  })

  return res.status(200).json({ rows: merged })
}
