import Head from 'next/head'
import Link from 'next/link'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'
import { q } from '../../lib/db'

export async function getServerSideProps({ req, res, query }) {
  res?.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=60')
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }

  const days = Math.min(parseInt(query.days || '30', 10) || 30, 730)
  const search = (query.q || '').trim().toLowerCase()
  const category = (query.cat || '').trim()

  const args = [days]
  let where = `occurred_at > NOW() - ($1::int * INTERVAL '1 day')`
  if (search) {
    args.push(`%${search}%`)
    where += ` AND (LOWER(description) LIKE $${args.length} OR LOWER(customer_email) LIKE $${args.length} OR LOWER(customer_name) LIKE $${args.length})`
  }
  if (category) {
    args.push(category)
    where += ` AND category_label = $${args.length}`
  }

  const [txs, summary, cats, lastRun] = await Promise.all([
    q(`SELECT id, occurred_at, amount_cents, type, description, customer_email, customer_name, sku, category_label
       FROM transactions WHERE ${where} ORDER BY occurred_at DESC LIMIT 200`, args),
    q(`SELECT category_label,
              SUM(CASE WHEN amount_cents > 0 THEN amount_cents ELSE 0 END)/100.0 AS inflow,
              SUM(CASE WHEN amount_cents < 0 THEN amount_cents ELSE 0 END)/100.0 AS outflow,
              COUNT(*) AS n
       FROM transactions WHERE ${where} GROUP BY category_label ORDER BY ABS(SUM(amount_cents)) DESC`, args),
    q(`SELECT label, type FROM categories ORDER BY type, label`),
    q(`SELECT started_at, finished_at, rows_added, ok, error FROM ingest_runs ORDER BY started_at DESC LIMIT 1`),
  ])

  return {
    props: {
      days,
      search,
      category,
      txs: txs.rows.map((r) => ({ ...r, occurred_at: r.occurred_at.toISOString() })),
      summary: summary.rows,
      categories: cats.rows,
      lastRun: lastRun.rows[0] ? { ...lastRun.rows[0], started_at: lastRun.rows[0].started_at.toISOString(), finished_at: lastRun.rows[0].finished_at?.toISOString() || null } : null,
    },
  }
}

function fmt$(cents) {
  const sign = cents < 0 ? '-' : ''
  return sign + '$' + (Math.abs(cents) / 100).toFixed(2)
}
function fmtDate(iso) { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
function fmtDateTime(iso) { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }

const TYPE_COLOR = {
  revenue: '#7dffaa', cogs: '#ffb060', expense: '#ff8080', transfer: '#5bc4ff',
  equity: '#c9a84c', unknown: 'rgba(212,230,202,0.5)', asset: '#7dffaa', liability: '#ff8080',
}

export default function BooksPage({ days, search, category, txs, summary, categories, lastRun }) {
  const totalIn = summary.reduce((s, r) => s + Number(r.inflow || 0), 0)
  const totalOut = summary.reduce((s, r) => s + Number(r.outflow || 0), 0)
  const net = totalIn + totalOut
  const grouped = categories.reduce((m, c) => { (m[c.type] ||= []).push(c.label); return m }, {})

  return (
    <>
      <Head><title>Books · GreenGuard Admin</title></Head>
      <PortalLayout isAdmin>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <div>
            <span className="tag">Admin</span>
            <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, margin: '0 0 4px' }}>Books</h1>
            <p style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.45)', margin: 0 }}>
              Stripe ledger · {txs.length} txns shown (last {days} days)
              {lastRun && <> · last ingest {fmtDateTime(lastRun.started_at)} ({lastRun.rows_added || 0} rows{lastRun.ok ? '' : ' · failed'})</>}
            </p>
          </div>
          <form method="GET" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input name="q" defaultValue={search} placeholder="Search description / email"
              style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid rgba(122,171,130,0.25)', background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.82rem', fontFamily: 'Nunito Sans, sans-serif', minWidth: 200 }} />
            <select name="cat" defaultValue={category}
              style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid rgba(122,171,130,0.25)', background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.82rem', fontFamily: 'Nunito Sans, sans-serif' }}>
              <option value="">All categories</option>
              {Object.keys(grouped).map((type) => (
                <optgroup key={type} label={type.toUpperCase()}>
                  {grouped[type].map((label) => <option key={label} value={label}>{label}</option>)}
                </optgroup>
              ))}
            </select>
            <select name="days" defaultValue={days}
              style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid rgba(122,171,130,0.25)', background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.82rem', fontFamily: 'Nunito Sans, sans-serif' }}>
              <option value="7">7d</option>
              <option value="30">30d</option>
              <option value="90">90d</option>
              <option value="365">365d</option>
              <option value="730">2y</option>
            </select>
            <button style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: '#7dffaa', color: '#0d1a10', fontWeight: 800, fontSize: '0.82rem', fontFamily: 'Nunito Sans, sans-serif', cursor: 'pointer' }}>Apply</button>
          </form>
        </div>

        {/* KPI summary */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
          {[
            ['Inflow',  totalIn,  '#7dffaa'],
            ['Outflow', totalOut, '#ff8080'],
            ['Net',     net,      net >= 0 ? '#7dffaa' : '#ff8080'],
          ].map(([lbl, val, color]) => (
            <div key={lbl} style={{ flex: '1 1 150px', minWidth: 140, padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(122,171,130,0.15)', borderRadius: 10 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', marginBottom: 6 }}>{lbl}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color }}>${Math.abs(val).toFixed(2)}{val < 0 ? ' out' : ''}</div>
            </div>
          ))}
        </div>

        {/* Category breakdown */}
        <h2 style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.5)', marginBottom: 8 }}>By category</h2>
        <div style={{ marginBottom: 22, background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(122,171,130,0.12)', overflow: 'hidden' }}>
          {summary.map((row) => {
            const net = Number(row.inflow || 0) + Number(row.outflow || 0)
            return (
              <Link key={row.category_label} href={`/admin/books?days=${days}&cat=${encodeURIComponent(row.category_label || '')}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid rgba(122,171,130,0.06)', textDecoration: 'none', color: '#d4e6ca', fontSize: '0.85rem' }}>
                <span style={{ flex: 1 }}>{row.category_label || '—'}</span>
                <span style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.4)', minWidth: 40, textAlign: 'right' }}>{row.n}</span>
                <span style={{ fontWeight: 700, color: net >= 0 ? '#7dffaa' : '#ff8080', minWidth: 100, textAlign: 'right' }}>${net.toFixed(2)}</span>
              </Link>
            )
          })}
        </div>

        {/* Transactions table */}
        <h2 style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.5)', marginBottom: 8 }}>Transactions</h2>
        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(122,171,130,0.12)', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(212,230,202,0.55)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Date</th>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Customer / Description</th>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Category</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {txs.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: 'rgba(212,230,202,0.4)' }}>No transactions in this window.</td></tr>
              )}
              {txs.map((t) => (
                <tr key={t.id} style={{ borderTop: '1px solid rgba(122,171,130,0.06)' }}>
                  <td style={{ padding: '8px 10px', color: 'rgba(212,230,202,0.55)', whiteSpace: 'nowrap' }}>{fmtDate(t.occurred_at)}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <div style={{ fontWeight: 700, color: '#d4e6ca' }}>{t.customer_name || t.customer_email || '—'}</div>
                    <div style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.4)' }}>{t.description || t.type}{t.sku ? ` · ${t.sku}` : ''}</div>
                  </td>
                  <td style={{ padding: '8px 10px', fontSize: '0.72rem', color: 'rgba(212,230,202,0.6)' }}>{t.category_label || '—'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: t.amount_cents >= 0 ? '#7dffaa' : '#ff8080', whiteSpace: 'nowrap' }}>{fmt$(t.amount_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ marginTop: 16, fontSize: '0.75rem', color: 'rgba(212,230,202,0.4)' }}>
          Showing up to 200 transactions. Phase 2 will add LLM categorization (drops "Unknown" count), natural-language chat, and exports.
        </p>
      </PortalLayout>
    </>
  )
}
