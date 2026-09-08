// GET/POST on gtm_settings. start_date may be set ONCE: POST refuses to
// overwrite an existing value unless the caller is owner.
const { requireGtm, isOwnerEmail } = require('../../../lib/auth')
const { q } = require('../../../lib/db')
const { resolveProduct, DEFAULT_PRODUCT } = require('../../../lib/gtm-products')

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isValidIsoDate(s) {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false
  const d = new Date(s + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

// gtm_settings keys are namespaced '<product>:<key>'. sparkbridge additionally
// falls back to reading the legacy unprefixed key so nothing existing breaks.
function namespacedKey(product, key) {
  return `${product}:${key}`
}

export default async function handler(req, res) {
  const session = await requireGtm(req, res)
  if (!session) return

  const product = resolveProduct(req)

  if (req.method === 'GET') {
    const { rows } = await q(`SELECT key, value FROM gtm_settings`)
    const prefix = `${product}:`
    const settings = {}
    // Legacy unprefixed keys first (sparkbridge fallback), then namespaced
    // keys override them.
    if (product === DEFAULT_PRODUCT) {
      for (const r of rows) {
        if (!r.key.includes(':')) settings[r.key] = r.value
      }
    }
    for (const r of rows) {
      if (r.key.startsWith(prefix)) settings[r.key.slice(prefix.length)] = r.value
    }
    return res.status(200).json({ settings })
  }

  if (req.method === 'POST') {
    const { key, value } = req.body || {}
    if (typeof key !== 'string' || !key.trim()) return res.status(400).json({ error: 'key required' })

    const nsKey = namespacedKey(product, key)

    if (key === 'start_date') {
      if (!isValidIsoDate(value)) return res.status(400).json({ error: 'start_date must be an ISO date (YYYY-MM-DD)' })
      const existing = await q(
        product === DEFAULT_PRODUCT
          ? `SELECT value FROM gtm_settings WHERE key IN ($1, 'start_date')`
          : `SELECT value FROM gtm_settings WHERE key = $1`,
        [nsKey]
      )
      const already = existing.rows[0]?.value
      if (already && !isOwnerEmail(session.email)) {
        return res.status(403).json({ error: 'start_date is already set; only the owner can change it' })
      }
    }

    await q(
      `INSERT INTO gtm_settings (key, value, updated_at, product) VALUES ($1, $2, now(), $3)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
      [nsKey, value == null ? null : String(value), product]
    )
    return res.status(200).json({ ok: true })
  }

  return res.status(405).end()
}
