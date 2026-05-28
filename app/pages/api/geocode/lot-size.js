// GET /api/geocode/lot-size?address=... → { acres, sqft, parcelnumb, owner }
//
// Two-step Regrid v2 lookup:
//   1. /parcels/typeahead?query=ADDRESS → top hit's ll_uuid + path
//   2. /parcels/{ll_uuid}                → full parcel with ll_gisacre
//
// Why two calls: the /parcels/address and /parcels.json?query=... endpoints
// return 0 features on this token tier (free trial). typeahead returns the
// best match for any address, and the individual /parcels/{uuid} fetch
// always returns the full record including acreage.
//
// Returns null fields when no parcel is found so the UI can degrade to
// a manual trap picker.

const REGRID_BASE = 'https://app.regrid.com/api/v2'

async function fetchJson(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } })
  const j = await r.json().catch(() => null)
  return { ok: r.ok, status: r.status, body: j }
}

async function lookupRegrid(address) {
  const token = process.env.REGRID_API_KEY
  if (!token) return { error: 'REGRID_API_KEY not configured' }

  // Step 1: typeahead for the best matching parcel UUID.
  const typeUrl = `${REGRID_BASE}/parcels/typeahead?query=${encodeURIComponent(address)}&token=${encodeURIComponent(token)}`
  const t = await fetchJson(typeUrl)
  if (!t.ok) return { error: `Regrid typeahead HTTP ${t.status}` }
  const feats = t.body?.parcel_centroids?.features || []
  if (feats.length === 0) {
    return { acres: null, sqft: null, parcelnumb: null, owner: null, matchedAddress: null }
  }

  const hit = feats[0].properties || {}
  const uuid = hit.ll_uuid
  if (!uuid) return { acres: null, sqft: null, parcelnumb: null, owner: null, matchedAddress: hit.address || null }

  // Step 2: full parcel fetch.
  const detailUrl = `${REGRID_BASE}/parcels/${encodeURIComponent(uuid)}?token=${encodeURIComponent(token)}`
  const d = await fetchJson(detailUrl)
  if (!d.ok) return { error: `Regrid parcel HTTP ${d.status}` }
  const detailFeats = d.body?.parcels?.features || []
  if (detailFeats.length === 0) {
    return { acres: null, sqft: null, parcelnumb: null, owner: null, matchedAddress: hit.address || null }
  }

  const f = detailFeats[0].properties?.fields || {}
  const acresRaw = f.ll_gisacre ?? f.gisacre ?? f.acreage ?? f.calcacre ?? null
  const acres = acresRaw != null ? Number(acresRaw) : null
  const sqft = acres != null && !Number.isNaN(acres) ? Math.round(acres * 43560) : null

  return {
    acres: acres != null && !Number.isNaN(acres) ? Number(acres.toFixed(3)) : null,
    sqft,
    parcelnumb: f.parcelnumb || f.parcelid || null,
    owner: f.owner || null,
    matchedAddress: f.address || hit.address || null,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const address = String(req.query.address || '').trim()
  if (!address || address.length < 6) {
    return res.status(400).json({ error: 'address (min 6 chars) required' })
  }
  try {
    const result = await lookupRegrid(address)
    if (result.error) return res.status(502).json(result)
    res.setHeader('Cache-Control', 'private, max-age=3600, stale-while-revalidate=86400')
    return res.status(200).json(result)
  } catch (e) {
    console.error('lot-size lookup failed:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
