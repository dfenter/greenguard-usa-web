import { useState, useCallback } from 'react'
import Head from 'next/head'
import dynamic from 'next/dynamic'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'
import { listAllActiveSubscriptions, listAllInvoicesSince, listOpenInvoices, getBalance } from '../../lib/stripe'
import { countContactsByProperty } from '../../lib/hubspot'
import { getBookingsForWeek, getAllUpcomingBookings } from '../../lib/gcal'
import { getTrafficOverview } from '../../lib/ga4'

const BarChart       = dynamic(() => import('recharts').then((m) => m.BarChart),        { ssr: false })
const Bar            = dynamic(() => import('recharts').then((m) => m.Bar),              { ssr: false })
const AreaChart      = dynamic(() => import('recharts').then((m) => m.AreaChart),       { ssr: false })
const Area           = dynamic(() => import('recharts').then((m) => m.Area),            { ssr: false })
const LineChart      = dynamic(() => import('recharts').then((m) => m.LineChart),       { ssr: false })
const Line           = dynamic(() => import('recharts').then((m) => m.Line),            { ssr: false })
const XAxis          = dynamic(() => import('recharts').then((m) => m.XAxis),           { ssr: false })
const YAxis          = dynamic(() => import('recharts').then((m) => m.YAxis),           { ssr: false })
const Tooltip        = dynamic(() => import('recharts').then((m) => m.Tooltip),         { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then((m) => m.ResponsiveContainer), { ssr: false })

const ADMIN_EMAIL = 'admin@greenguard-usa.com'

export async function getServerSideProps({ req, res }) {
  // Cache in browser for 5 minutes — admin-only so CDN won't serve it to others
  res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=60')
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (session.email !== ADMIN_EMAIL) return { redirect: { destination: '/dashboard', permanent: false } }

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

  // Cal.com: upcoming bookings count
  const thirtyDaysAheadISO = new Date(now.getTime() + 30 * 86400 * 1000).toISOString()

  const [activeSubs, paidInvoices, openInvoices, weekBookings, balance, traffic, upcomingBookings, ...segCounts] = await Promise.all([
    listAllActiveSubscriptions().catch(() => []),
    listAllInvoicesSince(oneYearAgo).catch(() => []),
    listOpenInvoices().catch(() => []),
    getBookingsForWeek(thisWeekStart.toISOString(), thisWeekEnd.toISOString()).catch(() => []),
    getBalance().catch(() => null),
    getTrafficOverview().catch(() => null),
    getAllUpcomingBookings(100).catch(() => []),
    ...SEGMENT_TYPES.map((t) => countContactsByProperty('system_type', t)),
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

  return {
    props: {
      // Revenue
      activeCount: activeSubs.length,
      mrr: Math.round(mrr * 100) / 100,
      revenueToday: Math.round(revenueToday * 100) / 100,
      revenueThisMonth: Math.round(revenueThisMonth * 100) / 100,
      revenueYTD: Math.round(revenueYTD * 100) / 100,
      servicesThisWeek: weekBookings.length,
      upcomingCount: upcomingBookings.length,
      upcomingBookings: upcomingBookings.slice(0, 20).map((b) => ({
        startTime: b.startTime,
        title: b.title,
        address: b.address,
        email: b.email,
      })),
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
    },
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt$(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}
function fmtDate(unix) {
  return new Date(unix * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtSeconds(s) {
  return s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${s}s`
}
function pctArrow(pct) {
  if (pct === null || pct === undefined) return null
  const up = pct >= 0
  return <span style={{ fontSize: '0.72rem', fontWeight: 700, color: up ? '#7dffaa' : '#ff8080', marginLeft: 6 }}>{up ? '↑' : '↓'}{Math.abs(pct)}%</span>
}

const TOOLTIP_STYLE = { background: '#1a2e1f', border: '1px solid rgba(122,171,130,0.3)', borderRadius: 6, fontSize: '0.8rem', color: '#d4e6ca' }
const TICK = { fill: 'rgba(212,230,202,0.4)', fontSize: 10 }

const SECTION = { fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#c9a84c', marginBottom: 14 }
const TD = { padding: '10px 16px', verticalAlign: 'middle' }

const SEGMENT_COLORS = { 'Biogents-CO2': '#7dffaa', 'Biogents-NonCO2': '#c9a84c', 'Mosqitter-Grand': '#5bc4ff' }

const CHANNEL_COLORS = {
  'Organic Search': '#7dffaa', 'Direct': '#c9a84c', 'Organic Social': '#5bc4ff',
  'Paid Search': '#ff9f40', 'Referral': '#a78bfa', 'Email': '#fb923c',
  'Display': '#f472b6', 'Other': 'rgba(212,230,202,0.35)',
}

function KPI({ label, value, sub, pct }) {
  return (
    <div className="card" style={{ flex: '1 1 160px', minWidth: 150 }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: '1.55rem', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.02em', display: 'flex', alignItems: 'baseline', flexWrap: 'wrap' }}>
        {value}{pct !== undefined && pctArrow(pct)}
      </div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'rgba(212,230,202,0.4)', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

// ── Tab buttons ────────────────────────────────────────────────────────────────

function Tabs({ active, onChange }) {
  const tabs = ['Revenue', 'Traffic', 'Finance', 'Health']
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 32, borderBottom: '1px solid rgba(122,171,130,0.15)', paddingBottom: 0 }}>
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          style={{
            padding: '10px 20px', border: 'none', cursor: 'pointer',
            fontWeight: 800, fontSize: '0.85rem', fontFamily: 'Nunito Sans, sans-serif',
            background: 'none',
            color: active === t ? '#7dffaa' : 'rgba(212,230,202,0.45)',
            borderBottom: active === t ? '2px solid #7dffaa' : '2px solid transparent',
            marginBottom: -1,
          }}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

// ── Revenue tab ────────────────────────────────────────────────────────────────

function RevenueTab({ activeCount, mrr, revenueToday, revenueThisMonth, revenueYTD, servicesThisWeek, openInvoiceCount, monthlyRevenue, dailyRevenue, recentOrders, openInvoiceList, segments, totalSegmentCount, upcomingCount, upcomingBookings }) {
  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <KPI label="MRR" value={fmt$(mrr)} sub="monthly recurring" />
        <KPI label="Active Customers" value={activeCount} sub="Stripe subscriptions" />
        <KPI label="This Month" value={fmt$(revenueThisMonth)} />
        <KPI label="YTD" value={fmt$(revenueYTD)} />
        <KPI label="Today" value={fmt$(revenueToday)} />
        <KPI label="This Week" value={servicesThisWeek} sub="service visits" />
        <KPI label="Upcoming (30d)" value={upcomingCount} sub="scheduled appointments" />
        <KPI label="Open Invoices" value={openInvoiceCount} sub={openInvoiceCount > 0 ? 'need follow-up' : 'all clear'} />
      </div>

      {/* Upcoming appointments list */}
      {upcomingBookings?.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <div style={SECTION}>Upcoming Appointments</div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead><tr style={{ borderBottom: '1px solid rgba(122,171,130,0.15)' }}>
                {['Date', 'Service', 'Customer', 'Address'].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800, fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.35)' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {upcomingBookings.map((b, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(122,171,130,0.08)' }}>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: '#c9a84c', fontWeight: 700 }}>
                      {b.startTime ? new Date(b.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>{b.title || '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'rgba(212,230,202,0.55)', fontSize: '0.78rem' }}>{b.email || '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'rgba(212,230,202,0.45)', fontSize: '0.75rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section style={{ marginBottom: 36 }}>
        <div style={SECTION}>Revenue — last 12 months</div>
        <div className="card" style={{ padding: '20px 8px 8px' }}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyRevenue}>
              <XAxis dataKey="month" tick={TICK} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => `$${v}`} tick={TICK} axisLine={false} tickLine={false} width={48} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`$${v.toLocaleString()}`, 'Revenue']} cursor={{ fill: 'rgba(125,255,170,0.04)' }} />
              <Bar dataKey="total" fill="#7dffaa" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <div style={SECTION}>Daily Revenue — last 30 days</div>
        <div className="card" style={{ padding: '20px 8px 8px' }}>
          <ResponsiveContainer width="100%" height={110}>
            <AreaChart data={dailyRevenue}>
              <defs>
                <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7dffaa" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#7dffaa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={TICK} axisLine={false} tickLine={false} interval={6} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`$${v}`, 'Revenue']} />
              <Area type="monotone" dataKey="total" stroke="#7dffaa" strokeWidth={2} fill="url(#ag)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <div style={SECTION}>Customer Segments</div>
        <div className="card" style={{ maxWidth: 520 }}>
          {segments.map(({ type, count }) => (
            <div key={type} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{type}</span>
                <span style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.5)' }}>{count}</span>
              </div>
              <div style={{ height: 6, background: 'rgba(122,171,130,0.1)', borderRadius: 3 }}>
                <div style={{ height: '100%', borderRadius: 3, background: SEGMENT_COLORS[type] || '#7dffaa', width: totalSegmentCount > 0 ? `${Math.round((count / totalSegmentCount) * 100)}%` : '0%', transition: 'width 0.5s' }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <div style={SECTION}>Recent Orders</div>
        {recentOrders.length === 0 ? (
          <p style={{ color: 'rgba(212,230,202,0.4)', fontSize: '0.88rem' }}>No paid invoices yet.</p>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead><tr style={{ borderBottom: '1px solid rgba(122,171,130,0.15)' }}>
                {['Date', 'Customer', 'Amount', 'Status', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 800, fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.35)' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id} style={{ borderBottom: '1px solid rgba(122,171,130,0.08)' }}>
                    <td style={TD}>{fmtDate(o.date)}</td>
                    <td style={{ ...TD, color: 'rgba(212,230,202,0.65)' }}>{o.email || '—'}</td>
                    <td style={{ ...TD, fontWeight: 800 }}>{fmt$(o.amount)}</td>
                    <td style={TD}><span style={{ color: '#7dffaa', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{o.status}</span></td>
                    <td style={TD}>{o.hostedUrl && <a href={o.hostedUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#7aab82', fontSize: '0.75rem', fontWeight: 700 }}>View →</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {openInvoiceList.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <div style={{ ...SECTION, color: '#ffb060' }}>Open Invoices — Follow-up Needed</div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead><tr style={{ borderBottom: '1px solid rgba(201,168,76,0.2)' }}>
                {['Customer', 'Amount Due', 'Date', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 800, fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(201,168,76,0.4)' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {openInvoiceList.map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid rgba(122,171,130,0.08)' }}>
                    <td style={TD}>{inv.email || '—'}</td>
                    <td style={{ ...TD, fontWeight: 800, color: '#ffb060' }}>{fmt$(inv.amount)}</td>
                    <td style={TD}>{fmtDate(inv.dueDate)}</td>
                    <td style={TD}>{inv.hostedUrl && <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#c9a84c', fontSize: '0.75rem', fontWeight: 700 }}>View →</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}

// ── Traffic tab ────────────────────────────────────────────────────────────────

function TrafficTab({ ga4Configured, traffic }) {
  if (!ga4Configured) {
    return (
      <div className="card" style={{ maxWidth: 560 }}>
        <div style={{ fontWeight: 900, fontSize: '1rem', marginBottom: 12 }}>Connect Google Analytics 4</div>
        <p style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.6)', lineHeight: 1.6, margin: '0 0 16px' }}>
          Uses your existing Google OAuth credentials — no service account needed. Two steps:
        </p>
        <ol style={{ fontSize: '0.83rem', color: 'rgba(212,230,202,0.7)', lineHeight: 2.2, paddingLeft: 20, margin: '0 0 20px' }}>
          <li>
            Re-run the Google token setup script with GA4 scope added — run this in Terminal:
            <div style={{ background: 'rgba(0,0,0,0.35)', borderRadius: 6, padding: '10px 14px', fontFamily: 'monospace', fontSize: '0.76rem', color: '#7dffaa', marginTop: 6, marginBottom: 4 }}>
              python3 _scripts/get-google-refresh-token.py --scope analytics
            </div>
            Sign in when the browser opens, then paste the new refresh token into <code style={{ color: '#c9a84c' }}>GOOGLE_REFRESH_TOKEN</code> in Vercel.
          </li>
          <li>
            In <strong>GA4</strong> → Admin → Property Settings → copy the <strong>Property ID</strong> (just the number, e.g. <code style={{ color: '#c9a84c' }}>123456789</code>) and add it to Vercel:
            <div style={{ background: 'rgba(0,0,0,0.35)', borderRadius: 6, padding: '10px 14px', fontFamily: 'monospace', fontSize: '0.76rem', color: '#7dffaa', marginTop: 6 }}>
              GOOGLE_ANALYTICS_PROPERTY_ID=123456789
            </div>
          </li>
        </ol>
        <p style={{ fontSize: '0.8rem', color: 'rgba(212,230,202,0.4)', margin: 0 }}>
          After adding both, redeploy and the Traffic tab will populate automatically.
        </p>
      </div>
    )
  }

  if (!traffic) {
    return <p style={{ color: 'rgba(212,230,202,0.4)' }}>Failed to load GA4 data — check that the service account has Viewer access to the property.</p>
  }

  const { overview, daily, sources, pages } = traffic
  const totalSessions = sources.reduce((s, r) => s + r.sessions, 0)

  return (
    <>
      {/* KPIs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 32 }}>
        <KPI label="Visits" value={overview.sessions.value.toLocaleString()} sub="sessions (30d)" />
        <KPI label="Unique Users" value={overview.users.value.toLocaleString()} sub="last 30 days" />
        <KPI label="Pageviews" value={overview.pageviews.value.toLocaleString()} sub="last 30 days" />
        <KPI label="Bounce Rate" value={`${overview.bounceRate.value}%`} sub="last 30 days" />
        <KPI label="Avg. Duration" value={fmtSeconds(overview.avgDuration.value)} sub="per session" />
      </div>

      {/* Daily sessions chart */}
      <section style={{ marginBottom: 36 }}>
        <div style={SECTION}>Sessions — last 30 days</div>
        <div className="card" style={{ padding: '20px 8px 8px' }}>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={daily}>
              <XAxis dataKey="date" tick={TICK} axisLine={false} tickLine={false} interval={6} />
              <YAxis tick={TICK} axisLine={false} tickLine={false} width={36} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [v.toLocaleString(), n === 'sessions' ? 'Sessions' : 'Users']} />
              <Line type="monotone" dataKey="sessions" stroke="#7dffaa" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="users" stroke="#c9a84c" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 4 }}>
            <span style={{ fontSize: '0.72rem', color: '#7dffaa', fontWeight: 700 }}>— Sessions</span>
            <span style={{ fontSize: '0.72rem', color: '#c9a84c', fontWeight: 700 }}>-- Users</span>
          </div>
        </div>
      </section>

      {/* Traffic sources */}
      <section style={{ marginBottom: 36 }}>
        <div style={SECTION}>Traffic Sources</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Bar chart */}
          <div className="card" style={{ padding: '16px 8px 8px' }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sources} layout="vertical">
                <XAxis type="number" tick={TICK} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="channel" tick={{ ...TICK, fontSize: 9 }} axisLine={false} tickLine={false} width={90} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [v.toLocaleString(), 'Sessions']} />
                <Bar dataKey="sessions" radius={[0, 3, 3, 0]}>
                  {sources.map((s, i) => (
                    <rect key={i} fill={CHANNEL_COLORS[s.channel] || '#7dffaa'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Source table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', alignSelf: 'start' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead><tr style={{ borderBottom: '1px solid rgba(122,171,130,0.15)' }}>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 800, fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.35)' }}>Source</th>
                <th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 800, fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.35)' }}>Visits</th>
                <th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 800, fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.35)' }}>%</th>
              </tr></thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.channel} style={{ borderBottom: '1px solid rgba(122,171,130,0.08)' }}>
                    <td style={{ padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: CHANNEL_COLORS[s.channel] || '#7dffaa', flexShrink: 0, display: 'inline-block' }} />
                      {s.channel}
                    </td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700 }}>{s.sessions.toLocaleString()}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', color: 'rgba(212,230,202,0.5)' }}>{s.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Top pages */}
      <section style={{ marginBottom: 36 }}>
        <div style={SECTION}>Top Pages</div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead><tr style={{ borderBottom: '1px solid rgba(122,171,130,0.15)' }}>
              {['Page', 'Views', 'Avg Time', 'Bounce', 'Exit'].map((h) => (
                <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Page' ? 'left' : 'right', fontWeight: 800, fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.35)' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {pages.map((p, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(122,171,130,0.08)' }}>
                  <td style={{ ...TD, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>{p.title || p.path}</div>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(212,230,202,0.35)' }}>{p.path}</div>
                  </td>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: 700 }}>{p.views.toLocaleString()}</td>
                  <td style={{ ...TD, textAlign: 'right', color: 'rgba(212,230,202,0.55)' }}>{fmtSeconds(p.avgTime)}</td>
                  <td style={{ ...TD, textAlign: 'right', color: 'rgba(212,230,202,0.55)' }}>{p.bounceRate}%</td>
                  <td style={{ ...TD, textAlign: 'right', color: 'rgba(212,230,202,0.55)' }}>{p.exitRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

// ── Finance tab ────────────────────────────────────────────────────────────────

function FinanceTab({ balance, revenueLast30, recentOrders, openInvoiceList }) {
  return (
    <>
      {/* Balance cards */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 32 }}>
        <KPI label="Stripe Available Balance" value={balance ? fmt$(balance.available) : '—'} sub="ready to pay out" />
        <KPI label="Pending Payout" value={balance ? fmt$(balance.pending) : '—'} sub="processing" />
        <KPI label="Payment Volume" value={fmt$(revenueLast30)} sub="last 30 days" />
      </div>

      {/* Recent transactions */}
      <section style={{ marginBottom: 36 }}>
        <div style={SECTION}>Recent Activity</div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead><tr style={{ borderBottom: '1px solid rgba(122,171,130,0.15)' }}>
              {['Date', 'Customer', 'Amount', 'Status', ''].map((h) => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 800, fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.35)' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {recentOrders.slice(0, 15).map((o) => (
                <tr key={o.id} style={{ borderBottom: '1px solid rgba(122,171,130,0.08)' }}>
                  <td style={TD}>{fmtDate(o.date)}</td>
                  <td style={{ ...TD, color: 'rgba(212,230,202,0.65)' }}>{o.email || '—'}</td>
                  <td style={{ ...TD, fontWeight: 800 }}>{fmt$(o.amount)}</td>
                  <td style={TD}><span style={{ color: '#7dffaa', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Paid</span></td>
                  <td style={TD}>{o.hostedUrl && <a href={o.hostedUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#7aab82', fontSize: '0.75rem', fontWeight: 700 }}>View →</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {openInvoiceList.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <div style={{ ...SECTION, color: '#ffb060' }}>Unpaid — Follow-up Needed</div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead><tr style={{ borderBottom: '1px solid rgba(201,168,76,0.2)' }}>
                {['Customer', 'Amount Due', 'Date', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 800, fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(201,168,76,0.4)' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {openInvoiceList.map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid rgba(122,171,130,0.08)' }}>
                    <td style={TD}>{inv.email || '—'}</td>
                    <td style={{ ...TD, fontWeight: 800, color: '#ffb060' }}>{fmt$(inv.amount)}</td>
                    <td style={TD}>{fmtDate(inv.dueDate)}</td>
                    <td style={TD}>{inv.hostedUrl && <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#c9a84c', fontSize: '0.75rem', fontWeight: 700 }}>View →</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div style={{ padding: '14px 0', fontSize: '0.78rem', color: 'rgba(212,230,202,0.3)' }}>
        Subscription invoices via Stripe · Shop orders (Squarespace) available via Squarespace API
      </div>
    </>
  )
}

// ── Health tab ─────────────────────────────────────────────────────────────────

const SERVICE_LABELS = {
  env: 'Environment Variables', stripe: 'Stripe', hubspot: 'HubSpot',
  google_calendar: 'Google Calendar', resend: 'Resend (Email)', ga4: 'Google Analytics 4',
}

function HealthTab() {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [lastRun, setLastRun] = useState(null)

  const runCheck = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/health')
      setResult(await res.json())
      setLastRun(new Date())
    } catch (e) {
      setResult({ status: 'error', error: e.message })
    } finally {
      setLoading(false)
    }
  }, [])

  const statusColor = !result ? 'rgba(212,230,202,0.3)' : result.status === 'healthy' ? '#7dffaa' : '#ff6b6b'
  const statusLabel = !result ? 'Not checked' : result.status === 'healthy' ? 'All systems operational' : 'Degraded — see below'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, padding: '16px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${statusColor}33`, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <span style={{ width: 14, height: 14, borderRadius: '50%', background: statusColor, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontWeight: 800, color: statusColor, fontSize: '1rem' }}>{statusLabel}</span>
          {result?.totalMs && <span style={{ fontSize: '0.75rem', color: 'rgba(212,230,202,0.35)' }}>({result.totalMs}ms)</span>}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {lastRun && <span style={{ fontSize: '0.75rem', color: 'rgba(212,230,202,0.35)' }}>Last: {lastRun.toLocaleTimeString()}</span>}
          <button onClick={runCheck} disabled={loading} style={{ padding: '8px 18px', borderRadius: 6, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: '0.82rem', fontFamily: 'Nunito Sans, sans-serif', background: loading ? 'rgba(201,168,76,0.2)' : '#c9a84c', color: loading ? 'rgba(212,230,202,0.4)' : '#0d1a10' }}>
            {loading ? 'Checking…' : result ? 'Re-check' : 'Run Health Check'}
          </button>
        </div>
      </div>
      {result?.checks && (
        <div className="card" style={{ marginBottom: 24 }}>
          {Object.entries(result.checks).map(([name, check]) => {
            const hasWarning = check.warning && check.ok
            return (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(122,171,130,0.08)' }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: hasWarning ? '#c9a84c' : check.ok ? '#7dffaa' : '#ff6b6b', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{SERVICE_LABELS[name] || name}</div>
                  {check.error && <div style={{ fontSize: '0.75rem', color: '#ff8080', marginTop: 2 }}>{check.error}</div>}
                  {check.errors?.map((e, i) => <div key={i} style={{ fontSize: '0.75rem', color: '#ff8080', marginTop: 2 }}>{e}</div>)}
                  {hasWarning && <div style={{ fontSize: '0.75rem', color: '#c9a84c', marginTop: 2 }}>{check.warning}</div>}
                </div>
                {check.latency != null && <span style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.35)', whiteSpace: 'nowrap' }}>{check.latency}ms</span>}
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: check.ok ? '#7dffaa' : '#ff6b6b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {check.ok ? (hasWarning ? 'warn' : 'ok') : 'fail'}
                </span>
              </div>
            )
          })}
        </div>
      )}
      <div className="card" style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.55)', lineHeight: 1.6 }}>
        Vercel Cron runs <code style={{ color: '#c9a84c' }}>/api/cron/health</code> every 5 minutes. Alerts go to <strong>admin@greenguard-usa.com</strong> if any service is down.{' '}
        <a href="https://portal.greenguard-usa.com/api/health" target="_blank" rel="noopener noreferrer" style={{ color: '#7aab82' }}>Raw JSON →</a>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Analytics(props) {
  const [tab, setTab] = useState('Revenue')

  return (
    <>
      <Head><title>Analytics · GreenGuard Admin</title></Head>
      <PortalLayout isAdmin>
        <div style={{ marginBottom: 8 }}>
          <span className="tag">Admin</span>
          <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Analytics</h1>
        </div>

        <Tabs active={tab} onChange={setTab} />

        {tab === 'Revenue' && <RevenueTab {...props} />}
        {tab === 'Traffic' && <TrafficTab ga4Configured={props.ga4Configured} traffic={props.traffic} />}
        {tab === 'Finance' && <FinanceTab balance={props.balance} revenueLast30={props.revenueLast30} recentOrders={props.recentOrders} openInvoiceList={props.openInvoiceList} />}
        {tab === 'Health' && <HealthTab />}
      </PortalLayout>
    </>
  )
}
