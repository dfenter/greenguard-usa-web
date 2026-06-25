import { requireAdmin } from '../../../lib/auth'
import { getBookingsForDateRange } from '../../../lib/gcal'

// Lazy data for the Clients table's Last Visit / Next Visit columns.
// Pulled out of the page's getServerSideProps so the table renders immediately
// and these columns fill in client-side. Window is ±3 months (was 6 back / 12
// forward) — far enough for "last/next visit" without large calendar scans.
export default async function handler(req, res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return
  if (req.method !== 'GET') return res.status(405).end()

  // getBookingsForDateRange is cached (120s); this endpoint is cheap to re-hit.
  res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=120')

  const now = new Date()
  const threeMonthsAgo = new Date(now); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const threeMonthsOut = new Date(now); threeMonthsOut.setMonth(threeMonthsOut.getMonth() + 3)

  const [upcoming, recent] = await Promise.all([
    getBookingsForDateRange(now.toISOString(), threeMonthsOut.toISOString()).catch(() => []),
    getBookingsForDateRange(threeMonthsAgo.toISOString(), now.toISOString()).catch(() => []),
  ])

  const next = {}
  upcoming.forEach((b) => {
    const email = (b.email || '').toLowerCase()
    if (email && !next[email]) next[email] = b.startTime // first upcoming
  })

  const last = {}
  recent.forEach((b) => {
    const email = (b.email || '').toLowerCase()
    if (email && (!last[email] || new Date(b.startTime) > new Date(last[email]))) {
      last[email] = b.startTime // most recent past
    }
  })

  res.status(200).json({ next, last })
}
