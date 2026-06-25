import { requireAdmin } from '../../../lib/auth'
import { listAllCustomers } from '../../../lib/stripe'

// Lazy data for /admin/map. Server-only Stripe import stays out of the client
// bundle (this route was 722kB first-load until these moved server-side).
export default async function handler(req, res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return
  if (req.method !== 'GET') return res.status(405).end()
  res.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=60')

  const raw = await listAllCustomers().catch(() => [])
  const customers = raw
    .filter((c) => c.address?.line1 || c.metadata?.address)
    .map((c) => {
      const subs = c.subscriptions?.data || []
      const activeSub = subs.find((s) => s.status === 'active') || subs[0] || null
      return {
        id: c.id,
        name: c.name || c.email || 'Unknown',
        email: c.email || '',
        address: c.address?.line1
          ? [c.address.line1, c.address.city, c.address.state].filter(Boolean).join(', ')
          : '',
        status: activeSub?.status || 'inactive',
        plan: activeSub?.items?.data?.[0]?.price?.nickname || null,
      }
    })
    .filter((c) => c.address)

  res.status(200).json({ customers, mapsKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '' })
}
