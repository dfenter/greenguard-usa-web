// GET/POST on gtm_settings. start_date may be set ONCE: POST refuses to
// overwrite an existing value unless the caller is owner.
const { requireGtm, isOwnerEmail } = require('../../../lib/auth')
const { q } = require('../../../lib/db')

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isValidIsoDate(s) {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false
  const d = new Date(s + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

export default async function handler(req, res) {
  const session = await requireGtm(req, res)
  if (!session) return

  if (req.method === 'GET') {
    const { rows } = await q(`SELECT key, value FROM gtm_settings`)
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    return res.status(200).json({ settings })
  }

  if (req.method === 'POST') {
    const { key, value } = req.body || {}
    if (typeof key !== 'string' || !key.trim()) return res.status(400).json({ error: 'key required' })

    if (key === 'start_date') {
      if (!isValidIsoDate(value)) return res.status(400).json({ error: 'start_date must be an ISO date (YYYY-MM-DD)' })
      const existing = await q(`SELECT value FROM gtm_settings WHERE key = 'start_date'`)
      const already = existing.rows[0]?.value
      if (already && !isOwnerEmail(session.email)) {
        return res.status(403).json({ error: 'start_date is already set; only the owner can change it' })
      }
    }

    await q(
      `INSERT INTO gtm_settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
      [key, value == null ? null : String(value)]
    )
    return res.status(200).json({ ok: true })
  }

  return res.status(405).end()
}
