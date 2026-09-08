import Head from 'next/head'
import { useEffect, useState } from 'react'
import GtmLayout from '../GtmLayout'
import { DEFAULT_PRODUCT } from '../../../lib/gtm-products'

const METRIC_FIELDS = [
  ['calls_made', 'Discovery calls'],
  ['deals_moved', 'Deals moved a stage'],
  ['first_touches', 'Personalized first touches'],
  ['replies', 'Replies'],
  ['reviews_delivered', 'Architecture reviews delivered'],
  ['partners_signed', 'Partners signed'],
]

const NOTE_FIELDS = [
  ['top_objection', 'Top objection this week (exact words, firm)'],
  ['best_message', 'Best-performing message (which touch, which hook)'],
  ['promising_vertical', 'Most promising vertical and why'],
  ['competitive_insight', 'Competitive insight'],
  ['product_gap', 'Product gap or feature request (theme: Operate / Trust / Move Data / Scale)'],
  ['website_confusion', 'Website confusion observed'],
  ['recommended_action', 'Recommended action for next week'],
  ['blockers', 'Blockers needing Dan (approvals, review calls, pricing questions)'],
]

function currentWeekStart() {
  const now = new Date()
  const day = now.getUTCDay()
  const diff = (day === 0 ? -6 : 1) - day // Monday start
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff))
  return monday.toISOString().slice(0, 10)
}

function toMarkdown(weekStart, counts, notes) {
  const lines = []
  lines.push(`# Weekly report, week of ${weekStart}`)
  lines.push('')
  lines.push('| Metric | This week |')
  lines.push('|---|---:|')
  for (const [key, label] of METRIC_FIELDS) lines.push(`| ${label} | ${counts[key] ?? 0} |`)
  lines.push('')
  for (const [key, label] of NOTE_FIELDS) {
    lines.push(`## ${label}`)
    lines.push('')
    lines.push(notes[key] || '')
    lines.push('')
  }
  return lines.join('\n')
}

function downloadMarkdown(filename, text) {
  const blob = new Blob([text], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function GtmReportsPage({ product = DEFAULT_PRODUCT, session, leadershipPage }) {
  const [weekStart] = useState(currentWeekStart())
  const [counts, setCounts] = useState({})
  const [loadingCounts, setLoadingCounts] = useState(true)
  const [notes, setNotes] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [history, setHistory] = useState([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [kpisRes, historyRes] = await Promise.all([
        fetch(`/api/gtm/kpis?product=${product}`).then((r) => r.json()),
        fetch(`/api/gtm/weekly-reports?product=${product}`).then((r) => (r.ok ? r.json() : { rows: [] })).catch(() => ({ rows: [] })),
      ])
      if (cancelled) return
      setCounts({
        calls_made: kpisRes.calls || 0,
        deals_moved: (kpisRes.reviews || 0) + (kpisRes.partners || 0) + (kpisRes.pilots || 0),
        first_touches: kpisRes.firstTouches || 0,
        replies: kpisRes.replies || 0,
        reviews_delivered: kpisRes.reviews || 0,
        partners_signed: kpisRes.partners || 0,
      })
      setHistory(historyRes.rows || [])
      setLoadingCounts(false)
    }
    load()
    return () => { cancelled = true }
  }, [product])

  function setNote(key, value) {
    setNotes((n) => ({ ...n, [key]: value }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/gtm/weekly-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start: weekStart, counts, notes, product }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'save failed')
      } else {
        setSaved(true)
      }
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  function exportMd() {
    downloadMarkdown(`gtm-weekly-report-${weekStart}.md`, toMarkdown(weekStart, counts, notes))
  }

  return (
    <GtmLayout title="Reports" session={session} product={product}>
      <Head><title>GTM Reports · GreenGuard USA</title></Head>

      <h2 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: 8 }}>Weekly report, week of {weekStart}</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16 }}>Send Friday to Dan. One page. Evidence, not activity.</p>

      {loadingCounts ? <p>Loading...</p> : (
        <div style={{ overflowX: 'auto', marginBottom: 20 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border-gold)' }}>Metric</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid var(--border-gold)' }}>This week</th>
              </tr>
            </thead>
            <tbody>
              {METRIC_FIELDS.map(([key, label]) => (
                <tr key={key}>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-gold)' }}>{label}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-gold)', textAlign: 'right', fontWeight: 700 }}>{counts[key] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 640, marginBottom: 20 }}>
        {NOTE_FIELDS.map(([key, label]) => (
          <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
            {label}
            <textarea
              rows={2}
              value={notes[key] || ''}
              onChange={(e) => setNote(key, e.target.value)}
              style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border-gold)' }}
            />
          </label>
        ))}
      </div>

      {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
      {saved && <p style={{ color: 'var(--gold)', fontWeight: 700 }}>Saved.</p>}

      <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
        <button type="button" onClick={save} disabled={saving} style={{
          padding: '10px 20px', borderRadius: 8, fontWeight: 800, background: 'var(--gold)', border: 'none', cursor: 'pointer',
        }}>
          {saving ? 'Saving...' : 'Save report'}
        </button>
        <button type="button" onClick={exportMd} style={{
          padding: '10px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer',
        }}>
          Export as markdown
        </button>
      </div>

      {history.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: 8 }}>KPI by week</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border-gold)' }}>Week of</th>
                  {METRIC_FIELDS.map(([key, label]) => (
                    <th key={key} style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid var(--border-gold)' }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-gold)' }}>{row.week_start}</td>
                    {METRIC_FIELDS.map(([key]) => (
                      <td key={key} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-gold)', textAlign: 'right' }}>{row.payload?.counts?.[key] ?? 0}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {leadershipPage && (
        <div>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: 8 }}>Leadership review template</h2>
          <div style={{ border: '1px solid var(--border-gold)', borderRadius: 10, padding: '16px 20px' }}
            dangerouslySetInnerHTML={{ __html: leadershipPage.html }} />
        </div>
      )}
    </GtmLayout>
  )
}
