import Head from 'next/head'
import { useEffect, useMemo, useState } from 'react'
import GtmLayout from '../../components/gtm/GtmLayout'
import { gtmServerSideProps } from '../../lib/gtm-page'
import { slugifyFirm } from '../../lib/gtm-slug'

export const getServerSideProps = gtmServerSideProps()

const SCORE_FIELDS = [
  ['s1', 'Ignition practice'],
  ['s2', 'Multi-site'],
  ['s3', 'MQTT'],
  ['s4', 'Vertical fit'],
  ['s5', 'Enterprise'],
  ['s6', 'Pain'],
  ['s7', 'Sophistication'],
]

function tierFor(total) {
  if (total >= 25) return 'A'
  if (total >= 18) return 'B'
  return 'C'
}

export default function GtmTargets({ session, isOwner }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [tierFilter, setTierFilter] = useState('')
  const [verticalFilter, setVerticalFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [approvedFilter, setApprovedFilter] = useState('')
  const [sortByScore, setSortByScore] = useState(false)
  const [openFirm, setOpenFirm] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)

  async function syncFromHubSpot() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/gtm/hubspot-sync', { method: 'POST' })
      const data = await res.json()
      setSyncResult(data)
    } catch (err) {
      setSyncResult({ ok: false, reason: err.message })
    }
    setSyncing(false)
  }

  async function load() {
    setLoading(true)
    const data = await fetch('/api/gtm/targets').then((r) => r.json())
    setRows(data.rows || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const verticals = useMemo(() => [...new Set(rows.map((r) => r.vertical).filter(Boolean))], [rows])

  const filtered = useMemo(() => {
    let out = rows
    if (tierFilter) out = out.filter((r) => (r.myScore?.tier || '') === tierFilter)
    if (verticalFilter) out = out.filter((r) => r.vertical === verticalFilter)
    if (statusFilter) out = out.filter((r) => r.status === statusFilter)
    if (approvedFilter) out = out.filter((r) => (approvedFilter === 'yes' ? r.approved : !r.approved))
    if (sortByScore) out = [...out].sort((a, b) => (b.myScore?.total || 0) - (a.myScore?.total || 0))
    return out
  }, [rows, tierFilter, verticalFilter, statusFilter, approvedFilter, sortByScore])

  const openRow = rows.find((r) => r.firm === openFirm) || null

  return (
    <GtmLayout title="Targets" session={session}>
      <Head><title>GTM Targets — GreenGuard USA</title></Head>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)}>
          <option value="">All tiers</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </select>
        <select value={verticalFilter} onChange={(e) => setVerticalFilter(e.target.value)}>
          <option value="">All verticals</option>
          {verticals.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="current">current</option>
          <option value="replaced">replaced</option>
          <option value="new">new</option>
          <option value="unverified">unverified</option>
        </select>
        <select value={approvedFilter} onChange={(e) => setApprovedFilter(e.target.value)}>
          <option value="">Approved: all</option>
          <option value="yes">Approved</option>
          <option value="no">Not approved</option>
        </select>
        <label style={{ fontSize: '0.85rem' }}>
          <input type="checkbox" checked={sortByScore} onChange={(e) => setSortByScore(e.target.checked)} /> Sort by score
        </label>
        <button
          type="button"
          onClick={syncFromHubSpot}
          disabled={syncing}
          style={{ marginLeft: 'auto', fontWeight: 700 }}
        >
          {syncing ? 'Syncing...' : 'Sync from HubSpot'}
        </button>
        <button
          type="button"
          onClick={() => { window.location.href = '/api/gtm/targets/export.csv' }}
          style={{ fontWeight: 700 }}
        >
          Export CSV
        </button>
      </div>

      {syncResult && (
        <div style={{ border: '1px solid var(--border-gold)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem' }}>
          {syncResult.ok
            ? `Synced ${syncResult.synced?.length || 0} deal(s). ${syncResult.failed?.length || 0} failed.`
            : `Sync failed: ${syncResult.reason || 'unknown error'}`}
        </div>
      )}

      {loading && <p>Loading...</p>}

      {!loading && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border-gold)' }}>
                <th style={{ padding: 8 }}>Firm</th>
                <th style={{ padding: 8 }}>Vertical</th>
                <th style={{ padding: 8 }}>Score</th>
                <th style={{ padding: 8 }}>Tier</th>
                <th style={{ padding: 8 }}>Status</th>
                <th style={{ padding: 8 }}>Approved</th>
                <th style={{ padding: 8 }}>Touches</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.firm} onClick={() => setOpenFirm(row.firm)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <td style={{ padding: 8, fontWeight: 700 }}>{row.firm}</td>
                  <td style={{ padding: 8 }}>{row.vertical || '-'}</td>
                  <td style={{ padding: 8 }}>{row.myScore?.total ?? '-'}</td>
                  <td style={{ padding: 8 }}>{row.myScore?.tier ?? '-'}</td>
                  <td style={{ padding: 8 }}>{row.status || '-'}</td>
                  <td style={{ padding: 8 }}>{row.approved ? 'Yes' : 'No'}</td>
                  <td style={{ padding: 8 }}>{row.touchCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openRow && (
        <TargetDrawer
          row={openRow}
          session={session}
          onClose={() => setOpenFirm(null)}
          onSaved={load}
        />
      )}
    </GtmLayout>
  )
}

function TargetDrawer({ row, session, onClose, onSaved }) {
  const [scores, setScores] = useState(() => {
    const s = row.myScore || {}
    return SCORE_FIELDS.reduce((acc, [k]) => ({ ...acc, [k]: s[k] ?? 0 }), {})
  })
  const [vertical, setVertical] = useState(row.vertical || '')
  const [danNotes, setDanNotes] = useState(row.dan_notes || '')
  const [approved, setApproved] = useState(row.approved)
  const [sheetWarning, setSheetWarning] = useState(null)
  const [saving, setSaving] = useState(false)

  const total = SCORE_FIELDS.reduce((sum, [k]) => sum + Number(scores[k] || 0), 0)
  const tier = tierFor(total)

  async function saveScore() {
    setSaving(true)
    const res = await fetch('/api/gtm/targets/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firm: row.firm, ...scores }),
    })
    const data = await res.json()
    if (!res.ok) {
      setSaving(false)
      return
    }
    if (data.sheet && !data.sheet.ok) setSheetWarning(data.sheet.reason)
    setSaving(false)
    onSaved()
  }

  async function saveVertical() {
    await fetch('/api/gtm/targets/vertical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firm: row.firm, vertical }),
    })
    onSaved()
  }

  async function saveApproval() {
    const res = await fetch('/api/gtm/targets/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firm: row.firm, approved: !approved, dan_notes: danNotes }),
    })
    const data = await res.json()
    if (res.ok) {
      setApproved(!approved)
      if (data.sheet && !data.sheet.ok) setSheetWarning(data.sheet.reason)
      onSaved()
    }
  }

  async function logTouch() {
    const person = window.prompt('Person contacted:')
    if (!person) return
    const touchNum = Number(window.prompt('Touch number (1-4):', '1'))
    if (!Number.isInteger(touchNum) || touchNum < 1 || touchNum > 4) return
    const channel = window.prompt('Channel (email/linkedin):', 'email')
    await fetch('/api/gtm/touches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firm: row.firm, person, touch: touchNum, channel }),
    })
    onSaved()
  }

  const contacts = [1, 2, 3].map((n) => ({
    person: row[n === 1 ? 'person' : `person${n}`],
    title: row[n === 1 ? 'title' : `title${n}`],
    email: row[n === 1 ? 'email' : `email${n}`],
    linkedin: row[n === 1 ? 'linkedin' : `linkedin${n}`],
  })).filter((c) => c.person)

  return (
    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, background: 'var(--bg-card)', borderLeft: '1px solid var(--border-gold)', padding: 20, overflowY: 'auto', zIndex: 50 }}>
      <button onClick={onClose} style={{ float: 'right' }}>Close</button>
      <h2 style={{ marginTop: 0 }}>{row.firm}</h2>

      {sheetWarning && (
        <p style={{ background: '#5a3', color: '#fff', padding: '6px 10px', borderRadius: 6, fontSize: '0.8rem' }}>
          Sheet write did not complete: {sheetWarning}
        </p>
      )}

      <h3>Contacts</h3>
      {contacts.map((c, i) => (
        <p key={i} style={{ margin: '4px 0' }}>
          {c.person} — {c.title || ''} {c.email && <span>({c.email})</span>}
        </p>
      ))}

      <h3>Hook</h3>
      <p>{row.hook}</p>
      {row.hook_url && <a href={row.hook_url} target="_blank" rel="noreferrer">Evidence link</a>}
      <p>Email confidence: {row.email_confidence || row.confidence || 'unknown'}</p>

      <h3>Vertical</h3>
      <input value={vertical} onChange={(e) => setVertical(e.target.value)} onBlur={saveVertical} style={{ width: '100%', padding: 6 }} />

      <h3>Score ({total}, tier {tier})</h3>
      {SCORE_FIELDS.map(([k, label]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', margin: '4px 0' }}>
          <span>{label}</span>
          <select value={scores[k]} onChange={(e) => setScores((s) => ({ ...s, [k]: Number(e.target.value) }))}>
            {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      ))}
      <button onClick={saveScore} disabled={saving} style={{ marginTop: 8, fontWeight: 700 }}>
        {saving ? 'Saving...' : 'Save score'}
      </button>

      {session?.role === 'owner' && (
        <>
          <h3>Owner: approval</h3>
          <label>
            <input type="checkbox" checked={approved} onChange={saveApproval} /> Approved
          </label>
          <textarea
            value={danNotes}
            onChange={(e) => setDanNotes(e.target.value)}
            onBlur={saveApproval}
            placeholder="Dan's notes"
            style={{ width: '100%', minHeight: 60, marginTop: 8 }}
          />
        </>
      )}

      <h3>Touches ({row.touchCount})</h3>
      <button onClick={logTouch}>Log touch</button>
    </div>
  )
}
