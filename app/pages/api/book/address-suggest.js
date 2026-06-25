// GET /api/book/address-suggest?q=QUERY&session=TOKEN
// Proxies Google Places Autocomplete, keeping the API key server-side.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).end()

  const { q, session } = req.query
  if (!q || q.trim().length < 2) return res.status(200).json({ suggestions: [] })

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!key) return res.status(500).json({ error: 'Maps API key not configured' })

  const params = new URLSearchParams({
    input: q.trim(),
    types: 'address',
    components: 'country:us',
    key,
    ...(session ? { sessiontoken: session } : {}),
  })

  const r = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`)
  const data = await r.json()

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    return res.status(200).json({ suggestions: [] })
  }

  const suggestions = (data.predictions || []).filter(p => p.description.includes(', TX')).map(p => ({
    placeId: p.place_id,
    text: p.description,
    main: p.structured_formatting?.main_text || p.description,
    secondary: p.structured_formatting?.secondary_text || '',
  }))

  res.setHeader('Cache-Control', 'public, max-age=60')
  return res.status(200).json({ suggestions })
}
