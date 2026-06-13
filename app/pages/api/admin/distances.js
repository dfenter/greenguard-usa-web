import { requireAdmin } from '../../../lib/auth'

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return
  if (req.method !== 'POST') return res.status(405).end()

  const { origin, addresses } = req.body
  if (!origin || !addresses?.length) return res.status(400).json({ error: 'origin and addresses required' })

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!key) return res.status(500).json({ error: 'Maps key not configured' })

  // Distance Matrix allows 25 destinations per request — batch if needed
  const results = {}
  const CHUNK = 25
  for (let i = 0; i < addresses.length; i += CHUNK) {
    const chunk = addresses.slice(i, i + CHUNK)
    const dests = chunk.map((a) => encodeURIComponent(a.address)).join('|')
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${dests}&units=imperial&key=${key}`
    const data = await fetch(url).then((r) => r.json())
    if (data.status !== 'OK') continue
    data.rows[0]?.elements.forEach((el, j) => {
      const id = chunk[j].id
      if (el.status === 'OK') {
        results[id] = {
          miles: (el.distance.value / 1609.34).toFixed(1),
          text: el.distance.text,
          duration: el.duration.text,
        }
      }
    })
  }

  return res.json(results)
}
