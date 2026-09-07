// GET: text/csv of the target CSV columns plus score/tier/approve from the DB.
const { requireGtm } = require('../../../../lib/auth')
const { q } = require('../../../../lib/db')
const { getTargets } = require('../../../../lib/gtm-content')
const { toCsvRow } = require('../../../../lib/gtm-csv')

const EXTRA_COLS = ['score', 'tier', 'approve']

export default async function handler(req, res) {
  const session = await requireGtm(req, res)
  if (!session) return

  if (req.method !== 'GET') return res.status(405).end()

  const { columns, rows } = getTargets()
  const [stateRes, scoreRes] = await Promise.all([
    q(`SELECT firm, approved FROM gtm_targets_state`),
    q(`SELECT firm, total, tier FROM gtm_scores WHERE email = $1`, [session.email]),
  ])
  const stateByFirm = Object.fromEntries(stateRes.rows.map((r) => [r.firm, r]))
  const scoreByFirm = Object.fromEntries(scoreRes.rows.map((r) => [r.firm, r]))

  const outCols = columns.filter((c) => !EXTRA_COLS.includes(c)).concat(EXTRA_COLS)
  const lines = [toCsvRow(outCols)]

  for (const row of rows) {
    const state = stateByFirm[row.firm]
    const score = scoreByFirm[row.firm]
    const approved = state ? state.approved : /^(y|yes|true|1)$/i.test(String(row.approve || '').trim())
    const values = outCols.map((c) => {
      if (c === 'score') return score ? score.total : ''
      if (c === 'tier') return score ? score.tier : ''
      if (c === 'approve') return approved ? 'Y' : ''
      return row[c] ?? ''
    })
    lines.push(toCsvRow(values))
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="gtm-targets.csv"')
  return res.status(200).send(lines.join('\r\n') + '\r\n')
}
