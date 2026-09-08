import Head from 'next/head'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import GtmLayout from '../GtmLayout'
import { DEFAULT_PRODUCT } from '../../../lib/gtm-products'

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function fmtDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function dayNumber(startDate) {
  const start = new Date(startDate + 'T00:00:00Z')
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  return Math.floor((today - start) / 86400000) + 1
}

const KPI_LABELS = [
  ['targetsApproved', 'Targets approved'],
  ['firstTouches', 'First touches logged'],
  ['replies', 'Replies'],
  ['calls', 'Calls'],
  ['reviews', 'Reviews delivered'],
  ['partners', 'Partners signed'],
  ['pilots', 'Pilots live'],
]

const SPARKBRIDGE_LINKS = [
  { href: '/gtm/plan', label: 'Plan', desc: '90-day sprint, read section by section.' },
  { href: '/gtm/timeline', label: 'Timeline', desc: 'Day-range phases at a glance.' },
  { href: '/gtm/training', label: 'Training', desc: 'SE training, quiz, price cheat sheet.' },
  { href: '/gtm/targets', label: 'Targets', desc: '31 firms, scoring, approval status.' },
  { href: '/gtm/outreach', label: 'Outreach', desc: 'First email, sequence, touch rules.' },
  { href: '/gtm/discovery', label: 'Discovery', desc: 'Call script and structured report.' },
  { href: '/gtm/objections', label: 'Objections', desc: 'The objection library.' },
  { href: '/gtm/competitive', label: 'Competitive', desc: 'Living competitive cheat sheet.' },
  { href: '/gtm/reports', label: 'Reports', desc: 'Weekly report, KPI dashboard, reviews.' },
  { href: '/gtm/site', label: 'Site pages', desc: 'Compare, Architecture, Pricing, Benchmarks.' },
  { href: '/gtm/partners', label: 'Partners', desc: 'Partner program terms.' },
  { href: '/gtm/internal', label: 'Internal', desc: 'Internal-only, not for prospects.' },
]

const OPS_LINKS = [
  { href: '/gtm/ops/plan', label: 'Plan', desc: '90-day sprint, read section by section.' },
  { href: '/gtm/ops/timeline', label: 'Timeline', desc: 'Day-range phases at a glance.' },
  { href: '/gtm/ops/targets', label: 'Targets', desc: 'Operator firms, scoring, approval status.' },
  { href: '/gtm/ops/outreach', label: 'Outreach', desc: 'First email, sequence, touch rules.' },
  { href: '/gtm/ops/discovery', label: 'Discovery', desc: 'Call script, structured report, baseline metrics.' },
  { href: '/gtm/ops/objections', label: 'Objections', desc: 'The objection library.' },
  { href: '/gtm/ops/competitive', label: 'Competitive', desc: 'Living competitive cheat sheet.' },
  { href: '/gtm/ops/reports', label: 'Reports', desc: 'Weekly report, KPI dashboard, reviews.' },
  { href: '/gtm/ops/program', label: 'Program', desc: 'The ten-operator program.' },
  { href: '/gtm/ops/positioning', label: 'Positioning', desc: 'Positioning review documents.' },
  { href: '/gtm/ops/internal', label: 'Internal', desc: 'Internal-only, not for prospects.' },
]

// OPS-specific KPI tiles. Mapped from what /api/gtm/kpis can actually
// return today; applications/accepted/baselines/tenants/case study have no
// backing data source yet (see report to caller), so they render as 0.
const OPS_KPI_LABELS = [
  ['applications', 'Applications'],
  ['accepted', 'Accepted'],
  ['baselines', 'Baselines captured'],
  ['tenants', 'Tenants live'],
  ['caseStudy', 'Case study published'],
]

export default function GtmDashboardPage({ product = DEFAULT_PRODUCT, session, items = [] }) {
  const [startDate, setStartDate] = useState(null)
  const [done, setDone] = useState({})
  const [kpis, setKpis] = useState(null)
  const [loading, setLoading] = useState(true)

  const isOps = product === 'ops'
  const links = isOps ? OPS_LINKS : SPARKBRIDGE_LINKS
  const timelineHref = isOps ? '/gtm/ops/timeline' : '/gtm/timeline'
  const title = isOps ? 'One Person Show GTM Dashboard' : 'GTM Dashboard'
  const intro = isOps
    ? 'Everything for the One Person Show 90-day go-to-market sprint.'
    : 'Everything for the SparkBridge 90-day go-to-market sprint.'

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [settingsRes, progressRes, kpisRes] = await Promise.all([
        fetch(`/api/gtm/settings?product=${product}`).then((r) => r.json()),
        fetch(`/api/gtm/progress?product=${product}`).then((r) => r.json()),
        fetch(`/api/gtm/kpis?product=${product}`).then((r) => r.json()),
      ])
      if (cancelled) return
      setStartDate(settingsRes.settings?.start_date || null)
      const map = {}
      for (const row of progressRes.rows || []) map[row.item_id] = row.done
      setDone(map)
      setKpis(kpisRes)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [product])

  const totalCount = items.length
  const doneCount = items.filter((i) => done[i.id]).length
  const progressPct = totalCount ? (doneCount / totalCount) * 100 : 0

  const thisWeekItems = useMemo(() => {
    if (!startDate) return []
    const today = dayNumber(startDate)
    return items.filter((i) => i.dayEnd >= today && i.dayStart <= today + 7)
  }, [items, startDate])

  const reviewDates = useMemo(() => {
    if (!startDate) return []
    return [30, 60, 90].map((n) => ({ n, date: addDays(startDate, n - 1) }))
  }, [startDate])

  return (
    <GtmLayout title={title} session={session} progressPct={loading ? undefined : progressPct} product={product}>
      <Head><title>{title} · GreenGuard USA</title></Head>
      <p>{intro}</p>

      {!loading && !startDate && (
        <p>
          No start date set yet. <Link href={timelineHref}>Set it on the Timeline page.</Link>
        </p>
      )}

      {!loading && startDate && (
        <>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
            <div style={{ border: '1px solid var(--border-gold)', borderRadius: 10, padding: '12px 18px' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--gold)' }}>{Math.round(progressPct)}%</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Checklist progress ({doneCount}/{totalCount})</div>
            </div>
            {reviewDates.map(({ n, date }) => (
              <div key={n} style={{ border: '1px solid var(--border-gold)', borderRadius: 10, padding: '12px 18px' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{fmtDate(date)}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Day {n} review</div>
              </div>
            ))}
          </div>

          {kpis && !isOps && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 24 }}>
              {KPI_LABELS.map(([key, label]) => (
                <div key={key} style={{ border: '1px solid var(--border-gold)', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{kpis[key] ?? 0}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{label}</div>
                </div>
              ))}
            </div>
          )}

          {kpis && isOps && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 24 }}>
              {OPS_KPI_LABELS.map(([key, label]) => (
                <div key={key} style={{ border: '1px solid var(--border-gold)', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{kpis[key] ?? 0}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{label}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 800 }}>This week</h2>
            {thisWeekItems.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Nothing scheduled this week.</p>}
            {thisWeekItems.map((item) => (
              <label key={item.id} style={{ display: 'block', padding: '6px 0' }}>
                <input type="checkbox" checked={Boolean(done[item.id])} readOnly style={{ marginRight: 8 }} />
                {item.label} <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>(day {item.dayStart}-{item.dayEnd})</span>
              </label>
            ))}
          </div>
        </>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginTop: 20 }}>
        {links.map(({ href, label, desc }) => (
          <Link key={href} href={href} style={{
            display: 'block',
            padding: '16px',
            border: '1px solid var(--border-gold)',
            borderRadius: 10,
            textDecoration: 'none',
            color: 'var(--text)',
            background: 'var(--bg-card)',
          }}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{desc}</div>
          </Link>
        ))}
      </div>

      {!isOps && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: 12 }}>One Person Show</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            <Link href="/gtm/ops" style={{
              display: 'block',
              padding: '16px',
              border: '1px solid var(--border-gold)',
              borderRadius: 10,
              textDecoration: 'none',
              color: 'var(--text)',
              background: 'var(--bg-card)',
            }}>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>One Person Show GTM</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Applications, accepted, baselines captured, tenants live, case study published.
              </div>
            </Link>
          </div>
        </div>
      )}
    </GtmLayout>
  )
}
