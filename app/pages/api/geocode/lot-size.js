// GET /api/geocode/lot-size?address=... → { acres, sqft, parcelnumb, owner }
//
// Calls Regrid (https://regrid.com) to look up parcel data for a residential
// address. Returns null fields when no match is found so the caller can
// fall back to a manual trap-count picker.
//
// Set REGRID_API_KEY in Vercel env. Free tier is ~1,000 lookups/month.

const REGRID_BASE = 'https://app.regrid.com/api/v2'

async function lookupRegrid(address) {
  if (!process.env.REGRID_API_KEY) return { error: 'REGRID_API_KEY not configured' }

  const url = `${REGRID_BASE}/parcels/address?query=${encodeURIComponent(address)}&limit=1&token=${encodeURIComponent(process.env.REGRID_API_KEY)}`
  const r = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!r.ok) return { error: `Regrid HTTP ${r.status}` }
  const j = await r.json().catch(() => null)
  const feature = j?.parcels?.features?.[0] || j?.features?.[0]
  if (!feature) return { acres: null, sqft: null, parcelnumb: null, owner: null }

  // Regrid feature shape: properties.fields has the structured parcel data.
  // gisacre is the GIS-computed area; ll_gisacre is the legal-lot acreage
  // they prefer for residential lookups. Prefer ll_ when present.
  const f = feature.properties?.fields || feature.properties || {}
  const acresRaw = f.ll_gisacre ?? f.gisacre ?? f.acreage ?? f.calcacre ?? null
  const acres = acresRaw != null ? Number(acresRaw) : null
  const sqft = acres != null && !Number.isNaN(acres) ? Math.round(acres * 43560) : null

  return {
    acres: acres != null && !Number.isNaN(acres) ? Number(acres.toFixed(3)) : null,
    sqft,
    parcelnumb: f.parcelnumb || f.parcelid || null,
    owner: f.owner || null,
    matchedAddress: f.address || f.saddress || null,
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
    // Cache for an hour so the same address doesn't burn lookups.
    res.setHeader('Cache-Control', 'private, max-age=3600, stale-while-revalidate=86400')
    return res.status(200).json(result)
  } catch (e) {
    console.error('lot-size lookup failed:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
