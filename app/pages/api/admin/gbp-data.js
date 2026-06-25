import path from 'path'
import fs from 'fs'
import { getAccounts, getLocations, getInsights, getReviews } from '../../../lib/gbp'
import { requireAdmin } from '../../../lib/auth'
import { cached } from '../../../lib/cache'

const GBP_TTL = 3600 // 1 hour — GBP quota is 5 req/min; cache prevents repeated 429s

const STAR_NAMES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE']

function loadStaticReviews() {
  try {
    const p = path.join(process.cwd(), '..', 'astro', 'src', 'data', 'reviews.json')
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
    return (raw?.google?.reviews || []).map(r => ({
      name: null,
      starRating: STAR_NAMES[r.rating] || 'FIVE',
      reviewer: { displayName: r.author || 'Anonymous' },
      comment: r.text || '',
      createTime: null,
      reviewReply: null,
    }))
  } catch {
    return []
  }
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return

  try {
    const data = await cached('gbp:overview', GBP_TTL, async () => {
      const accounts = await getAccounts()

      if (!accounts.length) {
        // GBP API not accessible (quota=0) — fall back to static reviews file
        const staticReviews = loadStaticReviews()
        return {
          configured: true,
          staticFallback: true,
          location: { name: 'GreenGuard USA', phone: '(512) 560-4129', website: 'https://www.greenguard-usa.com' },
          insights: null,
          reviews: staticReviews,
        }
      }

      const account = accounts[0]
      const locations = await getLocations(account.name)
      if (!locations.length) return { configured: false, account: account.name }

      const location = locations[0]

      const [insights, reviews] = await Promise.all([
        getInsights(location.name, 28).catch(() => null),
        getReviews(location.name, 10).catch(() => []),
      ])

      return {
        configured: true,
        location: {
          name: location.title,
          phone: location.phoneNumbers?.primaryPhone,
          website: location.websiteUri,
        },
        insights,
        reviews,
      }
    })

    return res.json(data)
  } catch (e) {
    console.error('[gbp-data]', e)
    return res.status(500).json({ error: e.message })
  }
}
