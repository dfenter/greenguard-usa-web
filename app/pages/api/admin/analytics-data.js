import { requireAdmin } from '../../../lib/auth'
import { listAllActiveSubscriptions, listAllInvoicesSince, listOpenInvoices, getBalance, listAllCustomers } from '../../../lib/stripe'
import { countContactsByProperty, getAllContacts } from '../../../lib/hubspot'
import { getBookingsForWeek, getAllUpcomingBookings } from '../../../lib/gcal'
import { getTrafficOverview } from '../../../lib/ga4'
import { getSearchPerformance } from '../../../lib/gsc'

// Lazy data for /admin/analytics — moved out of getServerSideProps so the page
// shell (and its dynamically-imported charts) render immediately.
export default async function handler(req, res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return
  if (req.method !== 'GET') return res.status(405).end()
  // Cache 5 min — admin-only so no shared CDN exposure.
  res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=60')

  const now = new Date()
  const oneYearAgo     = Math.floor(new Date(now.getFullYear() - 1, now.getMonth(), 1).getTime() / 1000)
  const thirtyDaysAgo  = Math.floor(new Date(now.getTime() - 30 * 86400 * 1000).getTime() / 1000)
  const startOfToday   = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000)
  const startOfMonth   = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000)
  const startOfYear    = Math.floor(new Date(now.getFullYear(), 0, 1).getTime() / 1000)

  const thisWeekStart = new Date(now)
  thisWeekStart.setDate(now.getDate() - now.getDay())
  thisWeekStart.setHours(0, 0, 0, 0)
  const thisWeekEnd = new Date(thisWeekStart)
  thisWeekEnd.setDate(thisWeekStart.getDate() + 7)

  const SEGMENT_TYPES = ['Biogents-CO2', 'Biogents-NonCO2', 'Mosqitter-Grand']

  const [activeSubs, paidInvoices, openInvoices, weekBookings, balance, traffic, searchPerf, upcomingBookings, allCustomers, hubspotContacts, ...segCounts] = await Promise.all([
    listAllActiveSubscriptions().catch(() => []),
    listAllInvoicesSince(oneYearAgo).catch(() => []),
    listOpenInvoices().catch(() => []),
    getBookingsForWeek(thisWeekStart.toISOString(), thisWeekEnd.toISOString()).catch(() => []),
    getBalance().catch(() => null),
    getTrafficOverview().catch(() => null),
    getSearchPerformance(28).catch(() => null),
    getAllUpcomingBookings(100).catch(() => []),
    listAllCustomers().catch(() => []),
    getAllContacts(300).catch(() => []),
    ...SEGMENT_TYPES.map((t) => countContactsByProperty('system_type', t).catch(() => 0)),
  ])

  // ── Revenue calcs ────────────────────────────────────────────────────────────
  const mrr = activeSubs.reduce((s, sub) =>
    s + sub.items.data.reduce((ss, i) => ss + (i.price.unit_amount || 0), 0), 0) / 100

  const monthlyMap = {}
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    monthlyMap[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`] = 0
  }
  paidInvoices.forEach((inv) => {
    const d = new Date(inv.created * 1000)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (key in monthlyMap) monthlyMap[key] += inv.amount_paid / 100
  })
  const monthlyRevenue = Object.entries(monthlyMap).map(([month, total]) => ({
    month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    total: Math.round(total * 100) / 100,
  }))

  const dailyMap = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    dailyMap[d.toISOString().slice(0, 10)] = 0
  }
  paidInvoices.forEach((inv) => {
    const key = new Date(inv.created * 1000).toISOString().slice(0, 10)
    if (key in dailyMap) dailyMap[key] += inv.amount_paid / 100
  })
  const dailyRevenue = Object.entries(dailyMap).map(([day, total]) => ({
    day: day.slice(5), total: Math.round(total * 100) / 100,
  }))

  const revenueToday      = paidInvoices.filter((i) => i.created >= startOfToday).reduce((s, i) => s + i.amount_paid / 100, 0)
  const revenueThisMonth  = paidInvoices.filter((i) => i.created >= startOfMonth).reduce((s, i) => s + i.amount_paid / 100, 0)
  const revenueLast30     = paidInvoices.filter((i) => i.created >= thirtyDaysAgo).reduce((s, i) => s + i.amount_paid / 100, 0)
  const revenueYTD        = paidInvoices.filter((i) => i.created >= startOfYear).reduce((s, i) => s + i.amount_paid / 100, 0)

  const recentOrders = paidInvoices.slice(0, 20).map((inv) => ({
    id: inv.id,
    date: inv.created,
    email: inv.customer_details?.email || '',
    amount: inv.amount_paid / 100,
    status: inv.status,
    hostedUrl: inv.hosted_invoice_url || null,
  }))

  const openInvoiceList = openInvoices.map((inv) => ({
    id: inv.id,
    email: inv.customer_email || '',
    amount: inv.amount_due / 100,
    dueDate: inv.due_date || inv.created,
    hostedUrl: inv.hosted_invoice_url || null,
  }))

  const segments = SEGMENT_TYPES.map((t, i) => ({ type: t, count: segCounts[i] }))
  const totalSegmentCount = segments.reduce((s, seg) => s + seg.count, 0)

  // GA4 uses existing Google OAuth credentials — only needs the property ID
  const ga4Configured = !!(process.env.GOOGLE_ANALYTICS_PROPERTY_ID)

  res.status(200).json({
    // Revenue
    activeCount: activeSubs.length,
    mrr: Math.round(mrr * 100) / 100,
    revenueToday: Math.round(revenueToday * 100) / 100,
    revenueThisMonth: Math.round(revenueThisMonth * 100) / 100,
    revenueYTD: Math.round(revenueYTD * 100) / 100,
    servicesThisWeek: weekBookings.length,
    upcomingCount: upcomingBookings.length,
    upcomingBookings: upcomingBookings.slice(0, 20).map((b) => {
      // Resolve name: HubSpot first, then parse from Cal.com title "... and CustomerName"
      const hsContacts_local = hubspotContacts
      const hsMatch = hsContacts_local.find((c) => (c.properties?.email || '').toLowerCase() === (b.email || '').toLowerCase())
      const hsName = hsMatch ? [hsMatch.properties?.firstname, hsMatch.properties?.lastname].filter(Boolean).join(' ') : null
      const titleName = b.title?.match(/and\s+(.+)$/i)?.[1]?.trim() || null
      const stripeMatch = allCustomers.find((c) => (c.email || '').toLowerCase() === (b.email || '').toLowerCase())
      return {
        startTime: b.startTime,
        title: b.title,
        name: hsName || stripeMatch?.name || titleName || b.email || '—',
        address: b.address,
        email: b.email,
      }
    }),
    openInvoiceCount: openInvoices.length,
    monthlyRevenue,
    dailyRevenue,
    recentOrders,
    openInvoiceList,
    segments,
    totalSegmentCount,
    // Finance
    balance: balance ? { available: balance.available / 100, pending: balance.pending / 100 } : null,
    revenueLast30: Math.round(revenueLast30 * 100) / 100,
    // Traffic
    ga4Configured,
    traffic,
    searchPerf,
    // Map — merge Stripe billing addresses + HubSpot addresses (from CSV import)
    mapsKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    customerLocations: (() => {
      const seen = new Set()
      const locs = []
      // Stripe customers with billing addresses
      for (const c of allCustomers) {
        if (c.address?.line1) {
          const addr = [c.address.line1, c.address.city, c.address.state].filter(Boolean).join(', ')
          if (!seen.has(addr)) { seen.add(addr); locs.push({ name: c.name || c.email || '', address: addr }) }
        }
      }
      // HubSpot contacts with addresses (includes CSV imports)
      for (const c of hubspotContacts) {
        const addr = c.properties?.address || ''
        if (addr && !seen.has(addr)) {
          seen.add(addr)
          const name = [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(' ')
          locs.push({ name, address: addr })
        }
      }
      return locs
    })(),
  })
}
