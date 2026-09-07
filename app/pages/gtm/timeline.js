import Head from 'next/head'
import { useEffect, useMemo, useState } from 'react'
import GtmLayout from '../../components/gtm/GtmLayout'
import { gtmServerSideProps } from '../../lib/gtm-page'
import { getChecklist } from '../../lib/gtm-content'

export const getServerSideProps = gtmServerSideProps(() => {
  const items = getChecklist()
  return { props: { items } }
})

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

export default function GtmTimeline({ session, items }) {
  const [startDate, setStartDate] = useState(null)
  const [startInput, setStartInput] = useState('')
  const [done, setDone] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingStart, setSavingStart] = useState(false)
  const [startError, setStartError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [settingsRes, progressRes] = await Promise.all([
        fetch('/api/gtm/settings').then((r) => r.json()),
        fetch('/api/gtm/progress').then((r) => r.json()),
      ])
      if (cancelled) return
      setStartDate(settingsRes.settings?.start_date || null)
      const map = {}
      for (const row of progressRes.rows || []) map[row.item_id] = row.done
      setDone(map)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  const grouped = useMemo(() => {
    const bySection = {}
    for (const item of items) {
      if (!bySection[item.section]) bySection[item.section] = []
      bySection[item.section].push(item)
    }
    return Object.entries(bySection).sort((a, b) => Number(a[0]) - Number(b[0]))
  }, [items])

  const totalCount = items.length
  const doneCount = items.filter((i) => done[i.id]).length
  const progressPct = totalCount ? (doneCount / totalCount) * 100 : 0

  async function toggleItem(itemId) {
    const prev = done[itemId]
    setDone((d) => ({ ...d, [itemId]: !prev }))
    try {
      const res = await fetch('/api/gtm/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, done: !prev }),
      })
      if (!res.ok) throw new Error('save failed')
    } catch {
      setDone((d) => ({ ...d, [itemId]: prev }))
    }
  }

  async function saveStartDate() {
    setStartError('')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startInput)) {
      setStartError('Enter a valid date.')
      return
    }
    setSavingStart(true)
    try {
      const res = await fetch('/api/gtm/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'start_date', value: startInput }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStartError(data.error || 'Could not save start date.')
      } else {
        setStartDate(startInput)
      }
    } catch {
      setStartError('Could not save start date.')
    } finally {
      setSavingStart(false)
    }
  }

  return (
    <GtmLayout title="Timeline" session={session} progressPct={progressPct}>
      <Head><title>GTM Timeline — GreenGuard USA</title></Head>

      {!loading && !startDate && (
        <div style={{ border: '1px solid var(--border-gold)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <p style={{ marginTop: 0 }}>Set the sprint start date. This can only be set once.</p>
          <input
            type="date"
            value={startInput}
            onChange={(e) => setStartInput(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-gold)', marginRight: 10 }}
          />
          <button onClick={saveStartDate} disabled={savingStart} style={{ padding: '6px 14px', borderRadius: 6, fontWeight: 700 }}>
            {savingStart ? 'Saving...' : 'Set start date'}
          </button>
          {startError && <p style={{ color: '#b23', marginBottom: 0 }}>{startError}</p>}
        </div>
      )}

      {startDate && (
        <p style={{ color: 'var(--text-muted)' }}>
          Sprint start: {fmtDate(startDate)}. Progress: {doneCount}/{totalCount} ({Math.round(progressPct)}%).
        </p>
      )}

      {grouped.map(([section, sectionItems]) => (
        <div key={section} style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 800 }}>Section {section}</h2>
          {sectionItems.map((item) => (
            <label key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <input
                type="checkbox"
                checked={Boolean(done[item.id])}
                onChange={() => toggleItem(item.id)}
                style={{ marginTop: 4 }}
              />
              <span>
                <span>{item.label}</span>
                <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Day {item.dayStart}-{item.dayEnd}
                  {startDate && ` (${fmtDate(addDays(startDate, item.dayStart - 1))} - ${fmtDate(addDays(startDate, item.dayEnd - 1))})`}
                </span>
              </span>
            </label>
          ))}
        </div>
      ))}
    </GtmLayout>
  )
}
