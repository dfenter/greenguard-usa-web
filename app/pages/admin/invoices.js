import { useState, useEffect, useMemo } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }
  return { props: {} }
}

function fmt$(cents) { return cents == null ? '—' : `$${(cents / 100).toFixed(2)}` }
function fmtDate(unix) { return unix ? new Date(unix * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—' }
function fmtDateFull(unix) { return unix ? new Date(unix * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—' }

// Tabs along the top.
const TABS = [
  { key: 'all',      label: 'All invoices' },
  { key: 'draft',    label: 'Draft' },
  { key: 'open',     label: 'Open' },
  { key: 'past_due', label: 'Past due' },
]

const PAYMENT_FILTERS = [
  { key: 'unpaid',   label: 'Unpaid' },
  { key: 'paid',     label: 'Paid' },
  { key: 'past_due', label: 'Past due' },
]

const DATE_PRESETS = [
  { key: 'this_month',  label: 'This month' },
  { key: 'last_month',  label: 'Last month' },
  { key: 'this_year',   label: 'This year' },
  { key: 'last_year',   label: 'Last year' },
]

function presetRange(key) {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  if (key === 'this_month') return [new Date(y, m, 1), new Date(y, m + 1, 1)]
  if (key === 'last_month') return [new Date(y, m - 1, 1), new Date(y, m, 1)]
  if (key === 'this_year')  return [new Date(y, 0, 1),    new Date(y + 1, 0, 1)]
  if (key === 'last_year')  return [new Date(y - 1, 0, 1), new Date(y, 0, 1)]
  return null
}

function StatusPill({ status, isPastDue, isSuperseded }) {
  if (isSuperseded) {
    return <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(212,230,202,0.08)', color: 'rgba(212,230,202,0.45)', fontSize: '0.7rem', fontWeight: 700 }}>Superseded</span>
  }
  const cfg = {
    paid:           { bg: 'rgba(125,255,170,0.12)', color: '#7dffaa', label: 'Paid' },
    open:           { bg: 'rgba(201,168,76,0.12)',  color: '#c9a84c', label: isPastDue ? 'Past Due' : 'Open' },
    draft:          { bg: 'rgba(212,230,202,0.08)', color: 'rgba(212,230,202,0.6)', label: 'Draft' },
    uncollectible:  { bg: 'rgba(255,128,128,0.12)', color: '#ff8080', label: 'Uncollectible' },
    void:           { bg: 'rgba(212,230,202,0.08)', color: 'rgba(212,230,202,0.4)', label: 'Void' },
  }[status] || { bg: 'rgba(212,230,202,0.08)', color: 'rgba(212,230,202,0.5)', label: status }
  if (isPastDue && status === 'open') { cfg.bg = 'rgba(255,128,128,0.12)'; cfg.color = '#ff8080' }
  return <span style={{ padding: '2px 8px', borderRadius: 4, background: cfg.bg, color: cfg.color, fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{cfg.label}</span>
}

export default function InvoicesList() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [cursor, setCursor] = useState(null)
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [paymentFilters, setPaymentFilters] = useState(new Set())
  const [datePreset, setDatePreset] = useState(null)
  const [showSuperseded, setShowSuperseded] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const now = Math.floor(Date.now() / 1000)

  useEffect(() => { loadPage(null, true) }, [tab, datePreset])

  async function loadPage(starting_after, reset) {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (tab !== 'all' && tab !== 'past_due') params.set('status', tab)
      if (starting_after) params.set('starting_after', starting_after)
      if (datePreset) {
        const range = presetRange(datePreset)
        if (range) params.set('created_gte', String(Math.floor(range[0].getTime() / 1000)))
      }
      params.set('limit', '100')
      const res = await fetch(`/api/admin/all-invoices?${params}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error)
      setRows((prev) => reset ? j.rows : [...prev, ...j.rows])
      setHasMore(!!j.hasMore); setCursor(j.nextCursor)
    } catch (e) {
      console.error('all-invoices load:', e)
    } finally { setLoading(false) }
  }

  // Client-side filter pass over what we've fetched.
  const visible = useMemo(() => {
    return rows.filter((r) => {
      if (!showSuperseded && r.isSuperseded) return false
      if (tab === 'past_due') {
        if (r.status !== 'open' || !r.dueDate || r.dueDate > now) return false
      }
      if (paymentFilters.size > 0) {
        const isPast = r.status === 'open' && r.dueDate && r.dueDate < now
        const match =
          (paymentFilters.has('paid') && r.status === 'paid' && !r.isSuperseded) ||
          (paymentFilters.has('unpaid') && (r.status === 'open' || r.status === 'draft')) ||
          (paymentFilters.has('past_due') && isPast)
        if (!match) return false
      }
      if (search) {
        const q = search.toLowerCase()
        if (!(
          (r.customerName || '').toLowerCase().includes(q) ||
          (r.customerEmail || '').toLowerCase().includes(q) ||
          (r.number || '').toLowerCase().includes(q)
        )) return false
      }
      return true
    })
  }, [rows, tab, search, paymentFilters, showSuperseded, now])

  function togglePayment(key) {
    setPaymentFilters((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const chip = (active, color) => ({
    padding: '5px 12px', borderRadius: 5, border: `1px solid ${active ? color : 'rgba(122,171,130,0.25)'}`,
    background: active ? `${color}15` : 'transparent', color: active ? color : 'rgba(212,230,202,0.7)',
    fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
  })

  return (
    <>
      <Head><title>Invoices · GreenGuard Admin</title></Head>
      <PortalLayout isAdmin>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div>
            <span className="tag">Admin</span>
            <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, margin: '0 0 4px' }}>Invoices</h1>
            <p style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.45)', margin: 0 }}>
              {visible.length} shown · {rows.length} loaded{hasMore ? ' (more available)' : ''}
            </p>
          </div>
          <Link href="/admin/invoice" style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(125,255,170,0.35)', color: '#7dffaa', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 800 }}>
            + New invoice
          </Link>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(122,171,130,0.15)', marginBottom: 14, overflowX: 'auto' }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: '10px 16px', background: 'transparent', border: 'none', borderBottom: tab === t.key ? '2px solid #7dffaa' : '2px solid transparent', color: tab === t.key ? '#7dffaa' : 'rgba(212,230,202,0.55)', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Search + filter trigger */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer or invoice #…"
            style={{ flex: '1 1 200px', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(122,171,130,0.25)', background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.85rem', outline: 'none' }} />
          <button onClick={() => setFiltersOpen(!filtersOpen)} style={chip(filtersOpen, '#5bc4ff')}>
            + Filters{paymentFilters.size + (datePreset ? 1 : 0) > 0 ? ` (${paymentFilters.size + (datePreset ? 1 : 0)})` : ''}
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'rgba(212,230,202,0.5)', cursor: 'pointer' }}>
            <input type="checkbox" checked={showSuperseded} onChange={(e) => setShowSuperseded(e.target.checked)} />
            Show superseded
          </label>
        </div>

        {/* Filter pop-down */}
        {filtersOpen && (
          <div style={{ marginBottom: 16, padding: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(122,171,130,0.15)', borderRadius: 8 }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'rgba(212,230,202,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Payment status</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {PAYMENT_FILTERS.map((f) => (
                  <button key={f.key} onClick={() => togglePayment(f.key)} style={chip(paymentFilters.has(f.key), f.key === 'paid' ? '#7dffaa' : f.key === 'past_due' ? '#ff8080' : '#c9a84c')}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'rgba(212,230,202,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Creation date</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DATE_PRESETS.map((p) => (
                  <button key={p.key} onClick={() => setDatePreset(datePreset === p.key ? null : p.key)} style={chip(datePreset === p.key, '#5bc4ff')}>
                    {p.label}
                  </button>
                ))}
                {(paymentFilters.size > 0 || datePreset) && (
                  <button onClick={() => { setPaymentFilters(new Set()); setDatePreset(null) }} style={{ ...chip(false), color: '#ff8080', borderColor: 'rgba(255,128,128,0.3)' }}>
                    Reset all
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(122,171,130,0.12)', borderRadius: 8, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(212,230,202,0.55)', fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', whiteSpace: 'nowrap' }}>Status</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', whiteSpace: 'nowrap' }}>Created</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', whiteSpace: 'nowrap' }}>Invoice</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Client</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', whiteSpace: 'nowrap' }}>Email</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', whiteSpace: 'nowrap' }}>Due</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>Amount</th>
                <th style={{ padding: '8px 12px' }}></th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && !loading && (
                <tr><td colSpan={8} style={{ padding: 28, textAlign: 'center', color: 'rgba(212,230,202,0.4)' }}>No invoices match.</td></tr>
              )}
              {visible.map((r) => {
                const isPastDue = r.status === 'open' && r.dueDate && r.dueDate < now
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid rgba(122,171,130,0.06)' }}>
                    <td style={{ padding: '9px 12px' }}><StatusPill status={r.status} isPastDue={isPastDue} isSuperseded={r.isSuperseded} /></td>
                    <td style={{ padding: '9px 12px', color: 'rgba(212,230,202,0.6)', whiteSpace: 'nowrap' }}>{fmtDate(r.created)}</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: '0.78rem', color: 'rgba(212,230,202,0.7)', whiteSpace: 'nowrap' }}>{r.number}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 700 }}>{r.customerName || '—'}</td>
                    <td style={{ padding: '9px 12px', color: 'rgba(212,230,202,0.55)', fontSize: '0.78rem' }}>{r.customerEmail || '—'}</td>
                    <td style={{ padding: '9px 12px', color: isPastDue ? '#ff8080' : 'rgba(212,230,202,0.6)', whiteSpace: 'nowrap', fontWeight: isPastDue ? 800 : 400 }}>{fmtDate(r.dueDate)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap' }}>{fmt$(r.total)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                      {r.hostedInvoiceUrl && (
                        <a href={r.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: 4, background: 'rgba(91,196,255,0.1)', color: '#5bc4ff', fontWeight: 800, textDecoration: 'none', border: '1px solid rgba(91,196,255,0.25)' }}>
                          View ↗
                        </a>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {(loading || hasMore) && (
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            {loading
              ? <span style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.4)' }}>Loading…</span>
              : <button onClick={() => loadPage(cursor)} style={{ padding: '7px 14px', borderRadius: 5, border: '1px solid rgba(122,171,130,0.25)', background: 'transparent', color: 'rgba(212,230,202,0.7)', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'Inter, sans-serif' }}>
                  Load 100 more
                </button>
            }
          </div>
        )}
      </PortalLayout>
    </>
  )
}
