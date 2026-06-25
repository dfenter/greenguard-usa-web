import { requireAdmin } from '../../../lib/auth'
import { getAccounts, getLocations, createPost } from '../../../lib/gbp'
import { cached, invalidate } from '../../../lib/cache'

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return
  if (req.method !== 'POST') return res.status(405).end()

  const { summary, callToActionUrl } = req.body || {}
  if (!summary?.trim()) return res.status(400).json({ error: 'summary required' })

  try {
    const locationName = await cached('gbp:location-name', 3600, async () => {
      const accounts = await getAccounts()
      if (!accounts.length) throw new Error('No GBP account found')
      const locations = await getLocations(accounts[0].name)
      if (!locations.length) throw new Error('No GBP location found')
      return locations[0].name
    })

    const result = await createPost(locationName, summary.trim(), callToActionUrl?.trim() || null)
    if (result.error) return res.status(500).json({ error: result.error.message || 'Post failed' })
    await invalidate('gbp:overview')
    return res.status(200).json({ ok: true, post: result })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
