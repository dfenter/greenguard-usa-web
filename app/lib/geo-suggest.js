// Route-aware booking suggestions.
//
// Given a prospect's address and the month's free slots, rank days by how
// close the truck already is: days with an existing stop within a short
// drive of the new address get flagged "recommended", with the specific
// free slots adjacent to that day's nearby cluster.
//
// Geocoding: US Census geocoder (free, no key) with Google Geocoding as a
// fallback when GOOGLE_MAPS_API_KEY is configured. Coordinates are cached
// 30 days (addresses don't move; unmatchable addresses stay unmatchable).
// Drive time is estimated from road-factor haversine — good enough to
// answer "are we already in the neighborhood?".

const { cached } = require('./cache')
const { getBookingsForDateRange } = require('./gcal')

const TZ = process.env.CALENDAR_TIMEZONE || 'America/Chicago'
const GEO_TTL = 30 * 24 * 3600      // 30 days
const LOOKAHEAD_DAYS = 21           // how far ahead we scan existing stops
const REC_MAX_DRIVE_MIN = 18        // nearest stop within this → recommended day
const MAX_COLD_GEOCODES = 18        // uncached geocoder calls allowed per request
const SUGGESTED_PER_DAY = 4

const BUDGET_ERR = 'GEO_BUDGET_EXHAUSTED'

function normAddr(addr) {
  return String(addr || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

async function geocodeCensus(address) {
  const url = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?' +
    new URLSearchParams({ address, benchmark: 'Public_AR_Current', format: 'json' })
  const r = await fetch(url, { signal: AbortSignal.timeout(4000) })
  if (!r.ok) return null
  const j = await r.json()
  const m = j?.result?.addressMatches?.[0]
  return m ? { lat: m.coordinates.y, lng: m.coordinates.x } : null
}

async function geocodeGoogle(address) {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return null
  const url = 'https://maps.googleapis.com/maps/api/geocode/json?' +
    new URLSearchParams({ address, key })
  const r = await fetch(url, { signal: AbortSignal.timeout(4000) })
  if (!r.ok) return null
  const j = await r.json()
  const loc = j?.results?.[0]?.geometry?.location
  return loc ? { lat: loc.lat, lng: loc.lng } : null
}

// Returns { lat, lng } or null. `budget` (optional, { cold: n }) bounds how many
// uncached geocoder round-trips a single request may spend; when exhausted the
// loader throws so nothing bogus is cached and the caller just skips the stop.
async function geocode(address, budget) {
  const norm = normAddr(address)
  if (!norm) return null
  let hit
  try {
    hit = await cached(`geo:addr:${norm}`, GEO_TTL, async () => {
      if (budget && budget.cold <= 0) throw new Error(BUDGET_ERR)
      if (budget) budget.cold--
      let pt = null
      try { pt = await geocodeCensus(norm) } catch { /* timeout/network */ }
      if (!pt) { try { pt = await geocodeGoogle(norm) } catch { /* no key or error */ } }
      return pt || 'MISS'
    })
  } catch (e) {
    if (e.message === BUDGET_ERR) return null
    throw e
  }
  return hit === 'MISS' ? null : hit
}

function haversineMiles(a, b) {
  const R = 3958.8
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

// Austin surface streets: ~1.35 road factor at ~28 mph average, plus pull-out/parking slack.
function estDriveMinutes(miles) {
  return Math.round((miles * 1.35) / 28 * 60 + 4)
}

// slotsByDate: { 'YYYY-MM-DD': [iso, ...] } (the free slots already computed).
// Returns { 'YYYY-MM-DD': { driveMin, nearStop, suggested: [iso...] } } for days
// where an existing stop is a short drive away, or null when there are none (or
// the address can't be geocoded). Callers treat null as "serve plain slots".
async function suggestForAddress(address, slotsByDate) {
  const target = await geocode(address, { cold: 2 })
  if (!target) return null

  const now = new Date()
  const end = new Date(now.getTime() + LOOKAHEAD_DAYS * 86400000)
  const bookings = await getBookingsForDateRange(now.toISOString(), end.toISOString())

  // Geocode existing stops, deduped by address, bounded cold-lookup budget.
  // Warm cache entries cost nothing; steady state has every active customer cached.
  const budget = { cold: MAX_COLD_GEOCODES }
  const coords = new Map()
  for (const b of bookings) {
    const norm = normAddr(b.address)
    if (!norm || coords.has(norm)) continue
    const pt = await geocode(b.address, budget)
    if (pt) coords.set(norm, pt)
  }

  // Nearest existing stop per calendar day.
  const nearestByDate = {}
  for (const b of bookings) {
    const pt = coords.get(normAddr(b.address))
    if (!pt || !b.startTime) continue
    const dateStr = new Date(b.startTime).toLocaleDateString('en-CA', { timeZone: TZ })
    const driveMin = estDriveMinutes(haversineMiles(target, pt))
    const cur = nearestByDate[dateStr]
    if (!cur || driveMin < cur.driveMin) {
      nearestByDate[dateStr] = {
        driveMin,
        stopStart: new Date(b.startTime).getTime(),
        stopEnd: new Date(b.endTime || b.startTime).getTime(),
      }
    }
  }

  const recommendations = {}
  for (const [dateStr, near] of Object.entries(nearestByDate)) {
    if (near.driveMin > REC_MAX_DRIVE_MIN) continue
    const free = slotsByDate?.[dateStr]
    if (!free || !free.length) continue
    // Prefer free slots closest in time to the nearby stop (right before/after it).
    const anchor = (near.stopStart + near.stopEnd) / 2
    const suggested = [...free]
      .sort((a, z) => Math.abs(new Date(a) - anchor) - Math.abs(new Date(z) - anchor))
      .slice(0, SUGGESTED_PER_DAY)
      .sort((a, z) => new Date(a) - new Date(z))
    recommendations[dateStr] = {
      driveMin: near.driveMin,
      nearStop: new Date(near.stopStart).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }),
      suggested,
    }
  }
  return Object.keys(recommendations).length ? recommendations : null
}

module.exports = { suggestForAddress, geocode }
