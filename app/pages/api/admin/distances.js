import { requireAdmin } from '../../../lib/auth'

async function fetchDistanceMatrix(origin, destinations, key) {
  const results = []
  const CHUNK = 25
  for (let i = 0; i < destinations.length; i += CHUNK) {
    const chunk = destinations.slice(i, i + CHUNK)
    const dests = chunk.map((address) => encodeURIComponent(address)).join('|')
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${dests}&units=imperial&key=${key}`
    const response = await fetch(url)
    const data = await response.json()
    if (data.status !== 'OK') {
      results.push(...chunk.map(() => null))
      continue
    }
    results.push(...(data.rows[0]?.elements || []).map((el) => {
      if (el.status !== 'OK' || !el.distance || !el.duration) return null
      return {
        miles: (el.distance.value / 1609.34).toFixed(1),
        text: el.distance.text,
        duration: el.duration.text,
      }
    }))
  }
  return results
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return
  if (req.method !== 'POST') return res.status(405).end()

  const { origin, addresses, stops } = req.body
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  if (Array.isArray(stops)) {
    if (stops.length < 2 || stops.some((s) => !s || typeof s.address !== 'string' || !s.address.trim())) {
      return res.status(400).json({ error: 'stops must contain at least two ordered addresses' })
    }
    if (!key) return res.status(500).json({ error: 'Maps key not configured' })

    const legs = []
    let next = 0
    async function worker() {
      while (next < stops.length - 1) {
        const index = next++
        const from = stops[index].address.trim()
        const to = stops[index + 1].address.trim()
        const [distance] = await fetchDistanceMatrix(from, [to], key)
        if (distance) legs[index] = { from, to, miles: distance.miles, duration: distance.duration }
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, stops.length - 1) }, worker))
    return res.json({ legs: legs.filter(Boolean) })
  }

  if (!origin || !addresses?.length) return res.status(400).json({ error: 'origin and addresses required' })

  if (!key) return res.status(500).json({ error: 'Maps key not configured' })

  const results = {}
  const distances = await fetchDistanceMatrix(origin, addresses.map((a) => a.address), key)
  distances.forEach((distance, j) => {
    const id = addresses[j].id
    if (distance) {
      results[id] = distance
    }
  })

  return res.json(results)
}
