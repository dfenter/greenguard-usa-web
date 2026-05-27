import { getAccounts, getLocations, getInsights, getReviews } from '../../../lib/gbp'
import { requireAdmin } from '../../../lib/auth'

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return

  try {
    const accounts = await getAccounts()
    if (!accounts.length) return res.json({ configured: false })

    const account = accounts[0]
    const locations = await getLocations(account.name)
    if (!locations.length) return res.json({ configured: false, account: account.name })

    const location = locations[0]

    const [insights, reviews] = await Promise.all([
      getInsights(location.name, 28).catch(() => null),
      getReviews(location.name, 10).catch(() => []),
    ])

    return res.json({
      configured: true,
      location: {
        name: location.title,
        phone: location.phoneNumbers?.primaryPhone,
        website: location.websiteUri,
      },
      insights,
      reviews,
    })
  } catch (e) {
    console.error('[gbp-data]', e)
    return res.status(500).json({ error: e.message })
  }
}
