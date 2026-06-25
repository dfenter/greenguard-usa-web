// GET /api/book/address-detail?placeId=ChIJ...&session=TOKEN
// Returns structured address components for a Google Place ID.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).end()

  const { placeId, session } = req.query
  if (!placeId) return res.status(400).json({ error: 'placeId required' })

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!key) return res.status(500).json({ error: 'Maps API key not configured' })

  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'address_components',
    key,
    ...(session ? { sessiontoken: session } : {}),
  })

  const r = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`)
  const data = await r.json()

  if (data.status !== 'OK') {
    return res.status(200).json({ error: data.status })
  }

  const comps = data.result?.address_components || []
  const get = (...types) => comps.find(c => types.every(t => c.types.includes(t)))?.long_name || ''
  const getShort = (...types) => comps.find(c => types.every(t => c.types.includes(t)))?.short_name || ''

  const streetNum = get('street_number')
  const route = get('route')
  const city = get('locality') || get('sublocality') || get('neighborhood') || get('postal_town')
  const state = getShort('administrative_area_level_1')
  const zip = get('postal_code')

  return res.status(200).json({
    street: [streetNum, route].filter(Boolean).join(' '),
    city,
    state,
    zip,
  })
}
