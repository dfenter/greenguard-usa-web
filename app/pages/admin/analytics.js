import Head from 'next/head'
import dynamic from 'next/dynamic'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'
import { listAllActiveSubscriptions, listAllInvoicesSince, listOpenInvoices } from '../../lib/stripe'
import { countContactsByProperty } from '../../lib/hubspot'
import { getBookingsForWeek } from '../../lib/gcal'

const BarChart = dynamic(() => import('recharts').then((m) => m.BarChart), { ssr: false })
const Bar = dynamic(() => import('recharts').then((m) => m.Bar), { ssr: false })
const AreaChart = dynamic(() => import('recharts').then((m) => m.AreaChart), { ssr: false })
const Area = dynamic(() => import('recharts').then((m) => m.Area), { ssr: false })
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then((m) => m.ResponsiveContainer), { ssr: false })

const ADMIN_EMAIL = 'admin@greenguard-usa.com'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (session.email !== ADMIN_EMAIL) return { redirect: { destination: '/dashboard', permanent: false } }

  const now = new Date()
  const oneYearAgo = Math.floor(new Date(now.getFullYear() - 1, now.getMonth(), 1).getTime() / 1000)
  const startOfToday = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000)
  const startOfMonth = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000)
  const startOfYear = Math.floor(new Date(now.getFullYear(), 0, 1).getTime() / 1000)

  const thisWeekStart = new Date(now)
  thisWeekStart.setDate(now.getDate() - now.getDay())
  thisWeekStart.setHours(0, 0, 0, 0)
  const thisWeekEnd = new Date(thisWeekStart)
  thisWeekEnd.setDate(thisWeekStart.getDate() + 7)

  const SEGMENT_TYPES = ['Biogents-CO2', 'Biogents-NonCO2', 'Mosqitter', 'Tank-Only']

  const [activeSubs, paidInvoices, openInvoices, weekBookings, ...segmentCounts] = await Promise.all([
    listAllActiveSubscriptions().catch(() => []),
    listAllInvoicesSince(oneYearAgo).catch(() => []),
    listOpenInvoices().catch(() => []),
    getBookingsForWeek(thisWeekStart.toISOString(), thisWeekEnd.toISOString()).catch(() => []),
    ...SEGMENT_TYPES.map((t) => countContactsByProperty('system_type', t)),
  ])

  // MRR
  const mrr = activeSubs.reduce((sum, sub) => {
    return sum + sub.items.data.reduce((s, item) => s + (item.price.unit_amount || 0), 0)
  }, 0) / 100

  // Monthly revenue grouping (last 12 months)
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

  // Daily revenue last 30 days
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(now.getDate() - 29)
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
    day: day.slice(5),
    total: Math.round(total * 100) / 100,
  }))

  // Revenue this month, today, YTD
  const revenueToday = paidInvoices
    .filter((inv) => inv.created >= startOfToday)
    .reduce((s, inv) => s + inv.amount_paid / 100, 0)
  const revenueThisMonth = paidInvoices
    .filter((inv) => inv.created >= startOfMonth)
    .reduce((s, inv) => s + inv.amount_paid / 100, 0)
  const revenueYTD = paidInvoices
    .filter((inv) => inv.created >= startOfYear)
    .reduce((s, inv) => s + inv.amount_paid / 100, 0)

  // Recent orders
  const recentOrders = paidInvoices.slice(0, 15).map((inv) => ({
    id: inv.id,
    date: inv.created,
    email: inv.customer_details?.email || '',
    amount: inv.amount_paid / 100,
    status: inv.status,
    hostedUrl: inv.hosted_invoice_url || null,
  }))

  // Open invoices for table
  const openInvoiceList = openInvoices.map((inv) => ({
    id: inv.id,
    email: inv.customer_email || '',
    amount: inv.amount_due / 100,
    dueDate: inv.due_date || inv.created,
    hostedUrl: inv.hosted_invoice_url || null,
  }))

  const segments = SEGMENT_TYPES.map((t, i) => ({ type: t, count: segmentCounts[i] }))
  const totalSegmentCount = segments.reduce((s, seg) => s + seg.count, 0)

  return {
    props: {
      activeCount: activeSubs.length,
      mrr: Math.round(mrr * 100) / 100,
      revenueToday: Math.round(revenueToday * 100) / 100,
      revenueThisMonth: Math.round(revenueThisMonth * 100) / 100,
      revenueYTD: Math.round(revenueYTD * 100) / 100,
      servicesThisWeek: weekBookings.length,
      openInvoiceCount: openInvoices.length,
      monthlyRevenue,
      dailyRevenue,
      recentOrders,
      openInvoiceList,
      segments,
      totalSegmentCount,
    },
  }
}

function fmt$(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)
}

function fmtDate(unix) {
  return new Date(unix * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function KPI({ label, value, sub }) {
  return (
    <div className="card" style={{ flex: '1 1 180px', minWidth: 160 }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: '1.6rem', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.45)', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

const CHART_STYLE = {
  background: 'transparent',
  fontSize: '0.72rem',
}
const CHART_COLORS = { bar: '#7dffaa', area: '#7dffaa', grid: 'rgba(122,171,130,0.1)' }
const TOOLTIP_STYLE = {
  background: '#1a2e1f', border: '1px solid rgba(122,171,130,0.3)',
  borderRadius: 6, fontSize: '0.8rem', color: '#d4e6ca',
}

const SEGMENT_COLORS = {
  'Biogents-CO2': '#7dffaa',
  'Biogents-NonCO2': '#c9a84c',
  'Mosqitter': '#5bc4ff',
  'Tank-Only': 'rgba(212,230,202,0.35)',
}

export default function Analytics({
  activeCount, mrr, revenueToday, revenueThisMonth, revenueYTD,
  servicesThisWeek, openInvoiceCount, monthlyRevenue, dailyRevenue,
  recentOrders, openInvoiceList, segments, totalSegmentCount,
}) {
  return (
    <>
      <Head><title>Analytics · GreenGuard Admin</title></Head>
      <PortalLayout title="Analytics" isAdmin>
        {/* KPI row 1 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
          <KPI label="Active Customers" value={activeCount} sub="Stripe subscriptions" />
          <KPI label="MRR" value={fmt$(mrr)} sub="monthly recurring" />
          <KPI label="Revenue This Month" value={fmt$(revenueThisMonth)} />
          <KPI label="Services This Week" value={servicesThisWeek} sub="calendar bookings" />
        </div>

        {/* KPI row 2 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 32 }}>
          <KPI label="YTD Revenue" value={fmt$(revenueYTD)} />
          <KPI label="Today" value={fmt$(revenueToday)} />
          <KPI
            label="Open Invoices"
            value={openInvoiceCount}
            sub={openInvoiceCount > 0 ? 'need follow-up' : 'all clear'}
          />
        </div>

        {/* Revenue trend */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={sectionHead}>Revenue — last 12 months</h2>
          <div className="card" style={{ padding: '20px 8px 8px' }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyRevenue} style={CHART_STYLE}>
                <XAxis dataKey="month" tick={{ fill: 'rgba(212,230,202,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `$${v}`} tick={{ fill: 'rgba(212,230,202,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`$${v.toLocaleString()}`, 'Revenue']} cursor={{ fill: 'rgba(125,255,170,0.04)' }} />
                <Bar dataKey="total" fill={CHART_COLORS.bar} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Daily sparkline */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={sectionHead}>Daily Revenue — last 30 days</h2>
          <div className="card" style={{ padding: '20px 8px 8px' }}>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={dailyRevenue} style={CHART_STYLE}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7dffaa" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#7dffaa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fill: 'rgba(212,230,202,0.35)', fontSize: 9 }} axisLine={false} tickLine={false} interval={6} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`$${v.toLocaleString()}`, 'Revenue']} />
                <Area type="monotone" dataKey="total" stroke={CHART_COLORS.area} strokeWidth={2} fill="url(#areaGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Customer segments */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={sectionHead}>Customer Segments</h2>
          <div className="card" style={{ maxWidth: 560 }}>
            {segments.map(({ type, count }) => (
              <div key={type} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{type}</span>
                  <span style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.5)' }}>{count}</span>
                </div>
                <div style={{ height: 6, background: 'rgba(122,171,130,0.1)', borderRadius: 3 }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    background: SEGMENT_COLORS[type] || '#7dffaa',
                    width: totalSegmentCount > 0 ? `${Math.round((count / totalSegmentCount) * 100)}%` : '0%',
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recent orders */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={sectionHead}>Recent Orders</h2>
          {recentOrders.length === 0
            ? <p style={{ color: 'rgba(212,230,202,0.4)', fontSize: '0.88rem' }}>No paid invoices yet.</p>
            : (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(122,171,130,0.15)' }}>
                      {['Date', 'Customer', 'Amount', 'Status', ''].map((h) => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 800, fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order) => (
                      <tr key={order.id} style={{ borderBottom: '1px solid rgba(122,171,130,0.08)' }}>
                        <td style={tdStyle}>{fmtDate(order.date)}</td>
                        <td style={{ ...tdStyle, color: 'rgba(212,230,202,0.7)' }}>{order.email || '—'}</td>
                        <td style={{ ...tdStyle, fontWeight: 800 }}>{fmt$(order.amount)}</td>
                        <td style={tdStyle}><span style={{ color: '#7dffaa', fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{order.status}</span></td>
                        <td style={tdStyle}>
                          {order.hostedUrl && <a href={order.hostedUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#7aab82', fontSize: '0.75rem', fontWeight: 700 }}>View →</a>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </section>

        {/* Open invoices */}
        {openInvoiceList.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <h2 style={{ ...sectionHead, color: '#c9a84c' }}>Open Invoices — Need Follow-up</h2>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(201,168,76,0.2)' }}>
                    {['Customer', 'Amount Due', 'Date', ''].map((h) => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 800, fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(201,168,76,0.5)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {openInvoiceList.map((inv) => (
                    <tr key={inv.id} style={{ borderBottom: '1px solid rgba(122,171,130,0.08)' }}>
                      <td style={tdStyle}>{inv.email || '—'}</td>
                      <td style={{ ...tdStyle, fontWeight: 800, color: '#c9a84c' }}>{fmt$(inv.amount)}</td>
                      <td style={tdStyle}>{fmtDate(inv.dueDate)}</td>
                      <td style={tdStyle}>
                        {inv.hostedUrl && <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#c9a84c', fontSize: '0.75rem', fontWeight: 700 }}>View →</a>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Site traffic */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={sectionHead}>Site Traffic</h2>
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>Tracked via Google Analytics 4</div>
              <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.5)', marginTop: 4 }}>Page views and user sessions are collected automatically from the portal.</div>
            </div>
            <a
              href="https://analytics.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline"
              style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}
            >
              Open GA Dashboard →
            </a>
          </div>
        </section>
      </PortalLayout>
    </>
  )
}

const sectionHead = {
  fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.12em',
  textTransform: 'uppercase', color: '#c9a84c', marginBottom: 14,
}

const tdStyle = { padding: '10px 16px', verticalAlign: 'middle' }
