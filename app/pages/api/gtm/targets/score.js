// POST {firm, s1..s7} each an int 0-5. Computes total + tier, upserts
// gtm_scores for session.email, then best-effort writes to the sheet.
const { requireGtm } = require('../../../../lib/auth')
const { q } = require('../../../../lib/db')
const { scoreTotalAndTier } = require('../../../../lib/gtm-score')
const { writeTargetCells } = require('../../../../lib/gtm-sheets')

const SHEET_COLS = ['score_ignition_practice', 'score_multisite', 'score_mqtt', 'score_vertical', 'score_enterprise', 'score_pain', 'score_sophistication']

export default async function handler(req, res) {
  const session = await requireGtm(req, res)
  if (!session) return

  if (req.method !== 'POST') return res.status(405).end()

  const { firm, s1, s2, s3, s4, s5, s6, s7 } = req.body || {}
  if (typeof firm !== 'string' || !firm.trim()) return res.status(400).json({ error: 'firm required' })

  const scores = { s1, s2, s3, s4, s5, s6, s7 }
  let total, tier
  try {
    ;({ total, tier } = scoreTotalAndTier(scores))
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }

  await q(
    `INSERT INTO gtm_scores (firm, email, s1, s2, s3, s4, s5, s6, s7, total, tier, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
     ON CONFLICT (firm, email) DO UPDATE SET
       s1 = $3, s2 = $4, s3 = $5, s4 = $6, s5 = $7, s6 = $8, s7 = $9, total = $10, tier = $11, updated_at = now()`,
    [firm, session.email, s1, s2, s3, s4, s5, s6, s7, total, tier]
  )

  const cellValues = {}
  SHEET_COLS.forEach((col, i) => { cellValues[col] = scores[`s${i + 1}`] })
  cellValues.score = total
  cellValues.tier = tier
  const sheet = await writeTargetCells(firm, cellValues)

  return res.status(200).json({ ok: true, total, tier, sheet })
}
