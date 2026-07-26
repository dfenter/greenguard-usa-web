import Head from 'next/head'
import Link from 'next/link'
import { useState } from 'react'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest, isOwnerEmail } from '../../lib/auth'
import { q } from '../../lib/db'

export async function getServerSideProps({ req, res, query }) {
  res?.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=60')
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isOwnerEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }

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

  const thisYear = new Date().getFullYear()
  const ytdStart = new Date(Date.UTC(thisYear, 0, 1)).toISOString()

  let txs, summary, cats, lastRun, ytd
  try {
    ;[txs, summary, cats, lastRun, ytd] = await Promise.all([
      q(`SELECT id, occurred_at, amount_cents, type, description, customer_email, customer_name, sku, category_label
         FROM transactions WHERE ${where} ORDER BY occurred_at DESC LIMIT 200`, args),
      q(`SELECT category_label,
                SUM(CASE WHEN amount_cents > 0 THEN amount_cents ELSE 0 END)/100.0 AS inflow,
                SUM(CASE WHEN amount_cents < 0 THEN amount_cents ELSE 0 END)/100.0 AS outflow,
                COUNT(*) AS n
         FROM transactions WHERE ${where} GROUP BY category_label ORDER BY ABS(SUM(amount_cents)) DESC`, args),
      q(`SELECT label, type FROM categories ORDER BY type, label`),
      q(`SELECT started_at, finished_at, rows_added, ok, error FROM ingest_runs ORDER BY started_at DESC LIMIT 1`),
      q(`SELECT
           SUM(CASE WHEN amount_cents > 0 AND category_label LIKE 'Revenue:%' THEN amount_cents ELSE 0 END)::bigint AS revenue_cents,
           SUM(CASE WHEN amount_cents < 0 AND category_label ~ '^(Expense|COGS):' THEN amount_cents ELSE 0 END)::bigint AS expense_cents
         FROM transactions WHERE occurred_at >= $1`, [ytdStart]),
    ])
  } catch (err) {
    return { props: { days, search, category, txs: [], summary: [], categories: [], lastRun: null, ytd: null, dbError: err.message || 'Database unavailable' } }
  }

  const ytdRow = ytd.rows[0] || {}
  return {
    props: {
      days,
      search,
      category,
      thisYear,
      txs: txs.rows.map((r) => ({ ...r, occurred_at: r.occurred_at.toISOString() })),
      summary: summary.rows,
      categories: cats.rows,
      lastRun: lastRun.rows[0] ? { ...lastRun.rows[0], started_at: lastRun.rows[0].started_at.toISOString(), finished_at: lastRun.rows[0].finished_at?.toISOString() || null } : null,
      ytd: {
        revenue: Number(ytdRow.revenue_cents || 0) / 100,
        expenses: Number(ytdRow.expense_cents || 0) / 100,
        net: (Number(ytdRow.revenue_cents || 0) + Number(ytdRow.expense_cents || 0)) / 100,
      },
      dbError: null,
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
  revenue: 'var(--green)', cogs: 'var(--warn)', expense: 'var(--danger)', transfer: 'var(--info)',
  equity: 'var(--gold)', unknown: 'var(--text-dim)', asset: 'var(--green)', liability: 'var(--danger)',
}

export default function BooksPage({ days, search, category, txs, summary, categories, lastRun, ytd, thisYear }) {
  const totalIn = summary.reduce((s, r) => s + Number(r.inflow || 0), 0)
  const totalOut = summary.reduce((s, r) => s + Number(r.outflow || 0), 0)
  const net = totalIn + totalOut
  const grouped = categories.reduce((m, c) => { (m[c.type] ||= []).push(c.label); return m }, {})

  const [showExpense, setShowExpense] = useState(false)
  const [expForm, setExpForm] = useState({ occurred_at: new Date().toISOString().slice(0, 10), amount_dollars: '', description: '', category_label: '' })
  const [expSaving, setExpSaving] = useState(false)

  const expenseCategories = categories.filter((c) => c.type === 'expense' || c.type === 'cogs')

  async function submitExpense(e) {
    e.preventDefault()
    if (!expForm.category_label) return alert('Pick a category.')
    setExpSaving(true)
    try {
      const res = await fetch('/api/admin/books-add-expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expForm),
      })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || res.status) }
      setShowExpense(false)
      window.location.reload()
    } catch (err) {
      alert('Failed: ' + err.message)
      setExpSaving(false)
    }
  }

  return (
    <>
      <Head><title>Books · GreenGuard Admin</title></Head>
      <PortalLayout isAdmin>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <div>
            <span className="tag">Admin</span>
            <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, margin: '0 0 4px' }}>Books</h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', margin: 0 }}>
              Stripe ledger · {txs.length} txns shown (last {days} days)
              {lastRun && <> · last ingest {fmtDateTime(lastRun.started_at)} ({lastRun.rows_added || 0} rows{lastRun.ok ? '' : ' · failed'})</>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <Link href="/admin/books/chat"
              style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid rgba(var(--info-rgb),0.35)', color: 'var(--info)', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 800 }}>
              💬 Ask the Books
            </Link>
            <Link href="/admin/books/upload"
              style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid rgba(var(--green-rgb),0.35)', color: 'var(--green)', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 800 }}>
              ⬆ Upload CSV
            </Link>
            <button onClick={() => setShowExpense(true)}
              style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid rgba(var(--danger-rgb),0.35)', color: 'var(--danger)', background: 'transparent', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 800 }}>
              + Add Expense
            </button>
            <button onClick={async () => {
              if (!window.confirm('Run Gemini categorizer on the next 25 Unknown transactions?')) return
              const res = await fetch('/api/admin/books-categorize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 25 }) })
              const j = await res.json()
              if (res.ok) {
                alert(`✓ Categorized ${j.processed} transactions (${j.model || ''}).`)
                window.location.reload()
              } else {
                alert('Failed: ' + (j.error || res.status))
              }
            }}
              style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid rgba(var(--gold-rgb),0.35)', color: 'var(--gold)', background: 'transparent', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 800 }}>
              🤖 Recategorize (25)
            </button>
          </div>
          <form method="GET" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input name="q" defaultValue={search} placeholder="Search description / email"
              style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid rgba(var(--green-rgb),0.25)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: '0.82rem', minWidth: 200 }} />
            <select name="cat" defaultValue={category}
              style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid rgba(var(--green-rgb),0.25)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: '0.82rem' }}>
              <option value="">All categories</option>
              {Object.keys(grouped).map((type) => (
                <optgroup key={type} label={type.toUpperCase()}>
                  {grouped[type].map((label) => <option key={label} value={label}>{label}</option>)}
                </optgroup>
              ))}
            </select>
            <select name="days" defaultValue={days}
              style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid rgba(var(--green-rgb),0.25)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: '0.82rem' }}>
              <option value="7">7d</option>
              <option value="30">30d</option>
              <option value="90">90d</option>
              <option value="365">365d</option>
              <option value="730">2y</option>
            </select>
            <button style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: 'var(--green)', color: 'var(--text-on-accent)', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer' }}>Apply</button>
          </form>
        </div>

        {/* YTD summary */}
        {ytd && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h2 style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dim)', margin: 0 }}>{thisYear} Year to Date</h2>
              <div style={{ display: 'flex', gap: 6 }}>
                <a href={`/api/admin/books-export-pnl?ytd=${thisYear}`}
                  style={{ fontSize: '0.72rem', padding: '4px 10px', borderRadius: 5, border: '1px solid rgba(var(--info-rgb),0.30)', color: 'var(--info)', textDecoration: 'none', fontWeight: 700 }}>
                  ↓ YTD CSV
                </a>
                <a href={`/api/admin/books-export-pnl?month=${new Date().toISOString().slice(0,7)}`}
                  style={{ fontSize: '0.72rem', padding: '4px 10px', borderRadius: 5, border: '1px solid rgba(var(--info-rgb),0.30)', color: 'var(--info)', textDecoration: 'none', fontWeight: 700 }}>
                  ↓ This Month CSV
                </a>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                ['Revenue', ytd.revenue, 'var(--green)'],
                ['Expenses', Math.abs(ytd.expenses), 'var(--danger)'],
                ['Net Income', ytd.net, ytd.net >= 0 ? 'var(--ok)' : 'var(--danger)'],
              ].map(([lbl, val, color]) => (
                <div key={lbl} style={{ flex: '1 1 150px', minWidth: 140, padding: '12px 16px', background: 'var(--bg-alt)', border: '1px solid rgba(var(--green-rgb),0.15)', borderRadius: 10 }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 5 }}>{lbl}</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 900, color }}>${val.toFixed(2)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* KPI summary — current filter window */}
        <h2 style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 6 }}>Last {days} days</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
          {[
            ['Inflow',  totalIn,  'var(--green)'],
            ['Outflow', totalOut, 'var(--danger)'],
            ['Net',     net,      net >= 0 ? 'var(--ok)' : 'var(--danger)'],
          ].map(([lbl, val, color]) => (
            <div key={lbl} style={{ flex: '1 1 150px', minWidth: 140, padding: '14px 16px', background: 'var(--bg-alt)', border: '1px solid rgba(var(--green-rgb),0.15)', borderRadius: 10 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 6 }}>{lbl}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color }}>${Math.abs(val).toFixed(2)}{val < 0 ? ' out' : ''}</div>
            </div>
          ))}
        </div>

        {/* Category breakdown */}
        <h2 style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8 }}>By category</h2>
        <div style={{ marginBottom: 22, background: 'var(--bg-alt)', borderRadius: 8, border: '1px solid rgba(var(--green-rgb),0.12)', overflow: 'hidden' }}>
          {summary.map((row) => {
            const net = Number(row.inflow || 0) + Number(row.outflow || 0)
            return (
              <Link key={row.category_label} href={`/admin/books?days=${days}&cat=${encodeURIComponent(row.category_label || '')}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid rgba(var(--green-rgb),0.06)', textDecoration: 'none', color: 'var(--text)', fontSize: '0.85rem' }}>
                <span style={{ flex: 1 }}>{row.category_label || '—'}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', minWidth: 40, textAlign: 'right' }}>{row.n}</span>
                <span style={{ fontWeight: 700, color: net >= 0 ? 'var(--ok)' : 'var(--danger)', minWidth: 100, textAlign: 'right' }}>${net.toFixed(2)}</span>
              </Link>
            )
          })}
        </div>

        {/* Transactions table */}
        <h2 style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8 }}>Transactions</h2>
        <div style={{ background: 'var(--bg-alt)', borderRadius: 8, border: '1px solid rgba(var(--green-rgb),0.12)', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Date</th>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Customer / Description</th>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Category</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {txs.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)' }}>No transactions in this window.</td></tr>
              )}
              {txs.map((t) => (
                <tr key={t.id} style={{ borderTop: '1px solid rgba(var(--green-rgb),0.06)' }}>
                  <td style={{ padding: '8px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(t.occurred_at)}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <div style={{ fontWeight: 700, color: 'var(--text)' }}>{t.customer_name || t.customer_email || '—'}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{t.description || t.type}{t.sku ? ` · ${t.sku}` : ''}</div>
                  </td>
                  <td style={{ padding: '8px 10px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t.category_label || '—'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: t.amount_cents >= 0 ? 'var(--ok)' : 'var(--danger)', whiteSpace: 'nowrap' }}>{fmt$(t.amount_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ marginTop: 16, fontSize: '0.75rem', color: 'var(--text-dim)' }}>
          Showing up to 200 transactions. Upload bank/CC CSVs monthly to keep the ledger complete.
        </p>

        {/* Add Expense modal */}
        {showExpense && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(var(--green-rgb),0.25)', borderRadius: 12, padding: 28, width: '100%', maxWidth: 440 }}>
              <h2 style={{ margin: '0 0 20px', fontSize: '1rem', fontWeight: 900, color: 'var(--text)' }}>Add Expense</h2>
              <form onSubmit={submitExpense} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Date</label>
                  <input type="date" required value={expForm.occurred_at}
                    onChange={(e) => setExpForm((f) => ({ ...f, occurred_at: e.target.value }))}
                    style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(var(--green-rgb),0.25)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: '0.88rem', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Amount ($)</label>
                  <input type="number" step="0.01" min="0.01" required placeholder="0.00" value={expForm.amount_dollars}
                    onChange={(e) => setExpForm((f) => ({ ...f, amount_dollars: e.target.value }))}
                    style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(var(--green-rgb),0.25)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: '0.88rem', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Description</label>
                  <input type="text" required placeholder="e.g. Amazon — CO2 fittings" value={expForm.description}
                    onChange={(e) => setExpForm((f) => ({ ...f, description: e.target.value }))}
                    style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(var(--green-rgb),0.25)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: '0.88rem', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Category</label>
                  <select required value={expForm.category_label}
                    onChange={(e) => setExpForm((f) => ({ ...f, category_label: e.target.value }))}
                    style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(var(--green-rgb),0.25)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: '0.88rem', boxSizing: 'border-box' }}>
                    <option value="">Select category…</option>
                    {expenseCategories.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button type="submit" disabled={expSaving}
                    style={{ flex: 1, padding: '9px 0', borderRadius: 7, border: 'none', background: 'var(--danger)', color: 'var(--text-on-accent)', fontWeight: 900, fontSize: '0.88rem', cursor: expSaving ? 'not-allowed' : 'pointer' }}>
                    {expSaving ? 'Saving…' : 'Add Expense'}
                  </button>
                  <button type="button" onClick={() => setShowExpense(false)}
                    style={{ padding: '9px 18px', borderRadius: 7, border: '1px solid rgba(var(--green-rgb),0.25)', background: 'transparent', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </PortalLayout>
    </>
  )
}
