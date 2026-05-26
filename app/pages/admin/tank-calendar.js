import React, { useState, useCallback } from 'react'
import Head from 'next/head'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'
import { findContactByEmail, upsertContact, getNotesForContact } from '../../lib/hubspot'
import { getBookingsForWeek } from '../../lib/gcal'
import { resolveByTitle, normalizeEventTitle } from '../../lib/sku-engine'

const INVENTORY_EMAIL = 'inventory@greenguard-usa.com'
const SAFETY_STOCK = 3
const PROJECTION_DAYS = 56

// ── Shared utilities ──────────────────────────────────────────────────────────

function toISODate(date) { return date.toISOString().slice(0, 10) }

function addDays(date, n) {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + n)
  return d
}

function getWednesdayOf(date) {
  const d = new Date(date)
  const diff = (3 - d.getUTCDay() + 7) % 7
  d.setUTCDate(d.getUTCDate() + diff)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function getNextOrCurrentWednesday(from) {
  const d = new Date(from)
  d.setUTCHours(0, 0, 0, 0)
  const diff = (3 - d.getUTCDay() + 7) % 7
  d.setUTCDate(d.getUTCDate() + diff)
  return d
}

function parseTankNote(noteBody, ts) {
  if (!noteBody) return null
  const obj = {}
  for (const line of noteBody.split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    obj[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  if (obj.Type === 'TankExchange') {
    return { type: 'exchange', week: obj.Week || '', emptiesPickedUp: parseInt(obj.EmptiesPickedUp) || 0, fullsReceived: parseInt(obj.FullsReceived) || 0, damagedTanks: parseInt(obj.DamagedTanks) || 0, notes: obj.Notes || '', ts }
  }
  if (obj.Type === 'TankOverride') {
    return { type: 'override', week: obj.Week || '', fullTanksActual: parseInt(obj.FullTanksActual) || 0, notes: obj.Notes || '', ts }
  }
  if (obj.Date) {
    return { type: 'inventory', fullTanks: parseInt(obj['Full CO₂ tanks']) || 0, emptyTanks: parseInt(obj['Empty CO₂ tanks']) || 0, damagedTanks: parseInt(obj['Damaged CO₂ tanks']) || 0, ts }
  }
  return null
}

async function computeProjection(rawNotes) {
  const parsed = rawNotes
    .map((n) => parseTankNote(n.properties?.hs_note_body, n.properties?.hs_timestamp))
    .filter(Boolean)
    .sort((a, b) => new Date(a.ts) - new Date(b.ts))

  const inventoryNotes = parsed.filter((n) => n.type === 'inventory')
  const exchangeRecords = parsed.filter((n) => n.type === 'exchange')
  const overrideRecords = parsed.filter((n) => n.type === 'override')

  const latest = inventoryNotes[inventoryNotes.length - 1] ?? { fullTanks: 0, emptyTanks: 0, damagedTanks: 0 }
  const currentFull = latest.fullTanks
  const currentEmpty = latest.emptyTanks
  const damagedTotal =
    exchangeRecords.reduce((s, r) => s + r.damagedTanks, 0) +
    inventoryNotes.reduce((s, r) => s + (r.damagedTanks || 0), 0)

  const latestExchange = exchangeRecords[exchangeRecords.length - 1]
  const nextDelivery = latestExchange?.emptiesPickedUp ?? 0

  const overridesByWed = {}
  overrideRecords.forEach((r) => { overridesByWed[r.week] = r.fullTanksActual })
  const exchangeByWed = {}
  exchangeRecords.forEach((r) => { exchangeByWed[r.week] = r })

  const now = new Date()
  const startDate = addDays(now, 1)
  startDate.setUTCHours(0, 0, 0, 0)
  const endDate = addDays(startDate, PROJECTION_DAYS)

  let gcalBookings = []
  try { gcalBookings = await getBookingsForWeek(startDate.toISOString(), endDate.toISOString()) } catch { /* GCal not configured */ }

  const dailyMap = {}
  for (const booking of gcalBookings) {
    const dateStr = (booking.startTime || '').slice(0, 10)
    if (!dateStr) continue
    const resolved = resolveByTitle(normalizeEventTitle(booking.title || ''))
    const tankCount = resolved?.tankCount || 0
    if (!dailyMap[dateStr]) dailyMap[dateStr] = { appts: 0, tanksNeeded: 0 }
    dailyMap[dateStr].appts += 1
    dailyMap[dateStr].tanksNeeded += tankCount
  }

  const days = []
  let fullsRunning = currentFull
  let nextWedDelivery = nextDelivery

  for (let d = 0; d < PROJECTION_DAYS; d++) {
    const date = addDays(startDate, d)
    const dateStr = toISODate(date)
    const isWed = date.getUTCDay() === 3
    const wedOfWeek = toISODate(getWednesdayOf(date))

    let delivery = 0
    if (isWed) {
      delivery = nextWedDelivery
      fullsRunning += delivery
      if (overridesByWed[dateStr] !== undefined) fullsRunning = overridesByWed[dateStr]
    }

    const { appts = 0, tanksNeeded = 0 } = dailyMap[dateStr] || {}
    const fullsAvailable = fullsRunning
    const fullsEnd = fullsRunning - tanksNeeded
    const deficit = Math.max(0, tanksNeeded - fullsAvailable)

    days.push({
      date: dateStr, weekOf: wedOfWeek, isWednesday: isWed, delivery,
      appointments: appts, tanksNeeded, fullsAvailable, fullsEnd, deficit,
      status: deficit > 0 ? 'short' : fullsEnd < SAFETY_STOCK ? 'low' : 'ok',
      isOverridden: isWed && overridesByWed[dateStr] !== undefined,
      logged: isWed && !!exchangeByWed[dateStr],
      loggedData: isWed ? (exchangeByWed[dateStr] || null) : null,
    })

    fullsRunning = fullsEnd

    if (isWed) {
      let weekTotal = 0
      for (let offset = -2; offset <= 4; offset++) {
        const wdStr = toISODate(addDays(date, offset))
        weekTotal += (dailyMap[wdStr]?.tanksNeeded || 0)
      }
      nextWedDelivery = weekTotal
    }
  }

  const weekMap = {}
  for (const day of days) {
    const w = day.weekOf
    if (!weekMap[w]) weekMap[w] = { wednesday: w, totalAppts: 0, totalTanksNeeded: 0, delivery: 0, startStock: 0, endStock: 0, totalDeficit: 0, worstStatus: 'ok' }
    const wk = weekMap[w]
    wk.totalAppts += day.appointments
    wk.totalTanksNeeded += day.tanksNeeded
    wk.totalDeficit += day.deficit
    if (day.isWednesday) { wk.delivery = day.delivery; wk.startStock = day.fullsAvailable }
    wk.endStock = day.fullsEnd
    if (day.status === 'short') wk.worstStatus = 'short'
    else if (day.status === 'low' && wk.worstStatus !== 'short') wk.worstStatus = 'low'
  }

  const alerts = []
  const cutoffError = addDays(now, 14)
  const seen = new Set()
  for (const day of days) {
    if (day.status === 'ok' || seen.has(day.weekOf)) continue
    seen.add(day.weekOf)
    const level = new Date(day.date + 'T12:00:00Z') <= cutoffError ? 'error' : 'warn'
    alerts.push(day.status === 'short'
      ? { level, type: 'shortage', affectedDate: day.date, deficit: day.deficit }
      : { level, type: 'low', affectedDate: day.date })
  }

  return {
    summary: { fullTanks: currentFull, emptyTanks: currentEmpty, damagedTotal, totalPool: currentFull + currentEmpty + damagedTotal, nextDelivery, nextWednesday: toISODate(getNextOrCurrentWednesday(now)) },
    days,
    weeks: Object.values(weekMap),
    alerts,
    exchangeHistory: exchangeRecords.slice(-10).reverse(),
  }
}

// ── getServerSideProps ────────────────────────────────────────────────────────

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  const ADMIN = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'
  if (!session || session.email !== ADMIN) {
    return { redirect: { destination: '/dashboard', permanent: false } }
  }

  let initialData = { summary: null, days: [], weeks: [], alerts: [], exchangeHistory: [] }
  try {
    let contact = await findContactByEmail(INVENTORY_EMAIL).catch(() => null)
    if (!contact) {
      await upsertContact({ email: INVENTORY_EMAIL, name: 'GreenGuard Inventory Tracker', metadata: {} })
      contact = await findContactByEmail(INVENTORY_EMAIL)
    }
    const rawNotes = await getNotesForContact(contact.id, 60)
    initialData = await computeProjection(rawNotes)
  } catch (e) {
    console.error('tank-calendar SSR:', e)
  }

  return { props: { isAdmin: true, initialData } }
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function fmtDate(isoStr) {
  return new Date(isoStr + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function fmtWed(isoStr) {
  return new Date(isoStr + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const S = {
  card: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(122,171,130,0.2)', borderRadius: 10, padding: '16px 20px' },
  input: { width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 6, color: '#d4e6ca', fontSize: '0.88rem', boxSizing: 'border-box', fontFamily: 'inherit' },
  label: { display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4, color: 'rgba(212,230,202,0.55)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  badge: (status) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700,
    background: status === 'short' ? 'rgba(255,80,80,0.15)' : status === 'low' ? 'rgba(201,168,76,0.2)' : 'rgba(125,255,170,0.1)',
    color: status === 'short' ? '#ff6060' : status === 'low' ? '#c9a84c' : '#7dffaa',
  }),
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryBar({ summary, todayLoad }) {
  if (!summary) return null
  const { fullTanks, emptyTanks, damagedTotal, totalPool, nextDelivery, nextWednesday } = summary
  const stats = [
    ...(todayLoad ? [{ label: `Today's load (${todayLoad.appts || 0} appts)`, value: todayLoad.tanks, color: todayLoad.tanks > fullTanks ? '#ff8080' : '#7dffaa', note: todayLoad.tanks > fullTanks ? `short ${todayLoad.tanks - fullTanks}` : 'tanks needed' }] : []),
    { label: 'Full Tanks', value: fullTanks, color: '#7dffaa' },
    { label: 'Empty Tanks', value: emptyTanks, color: '#d4e6ca' },
    { label: 'Damaged (out)', value: damagedTotal, color: '#c9a84c' },
    { label: 'Total Tanks', value: totalPool, color: '#d4e6ca', note: 'incl. damaged' },
    { label: `Delivery ${fmtWed(nextWednesday)}`, value: `+${nextDelivery}`, color: '#c9a84c' },
  ]
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
      {stats.map(({ label, value, color, note }) => (
        <div key={label} style={{ ...S.card, minWidth: 110, textAlign: 'center' }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.5)', marginTop: 4, fontWeight: 700 }}>{label}</div>
          {note && <div style={{ fontSize: '0.65rem', color: 'rgba(212,230,202,0.35)' }}>{note}</div>}
        </div>
      ))}
    </div>
  )
}

function AlertsBanner({ alerts }) {
  if (!alerts?.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
      {alerts.map((a, i) => (
        <div key={i} style={{
          padding: '12px 16px', borderRadius: 8, fontSize: '0.88rem', fontWeight: 600,
          background: a.level === 'error' ? 'rgba(255,80,80,0.1)' : 'rgba(201,168,76,0.1)',
          border: `1px solid ${a.level === 'error' ? 'rgba(255,80,80,0.3)' : 'rgba(201,168,76,0.3)'}`,
          color: a.level === 'error' ? '#ff8080' : '#c9a84c',
        }}>
          {a.type === 'shortage'
            ? `🔴 Shortage projected ${fmtDate(a.affectedDate)} — ${a.deficit} tank${a.deficit !== 1 ? 's' : ''} short`
            : `⚠️ Low stock projected ${fmtDate(a.affectedDate)} — order soon to avoid shortfall`}
        </div>
      ))}
    </div>
  )
}

function ExchangeForm({ weekDate, onSubmit, onCancel, submitting }) {
  const [form, setForm] = useState({ emptiesPickedUp: '', fullsReceived: '', damagedTanks: '0', notes: '' })
  const [mode, setMode] = useState('exchange')
  const [overrideFull, setOverrideFull] = useState('')

  function set(k, v) { setForm((p) => ({ ...p, [k]: v })) }

  function handleSubmit(e) {
    e.preventDefault()
    if (mode === 'override') {
      onSubmit({ action: 'override', week: weekDate, fullTanksActual: overrideFull, notes: form.notes })
    } else {
      onSubmit({ action: 'exchange', week: weekDate, ...form })
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: '16px 20px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(122,171,130,0.15)' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button type="button" onClick={() => setMode('exchange')} style={{ padding: '4px 12px', borderRadius: 20, border: '1px solid rgba(122,171,130,0.4)', background: mode === 'exchange' ? 'rgba(122,171,130,0.15)' : 'transparent', color: '#d4e6ca', cursor: 'pointer', fontSize: '0.8rem' }}>Log Exchange</button>
        <button type="button" onClick={() => setMode('override')} style={{ padding: '4px 12px', borderRadius: 20, border: '1px solid rgba(122,171,130,0.4)', background: mode === 'override' ? 'rgba(122,171,130,0.15)' : 'transparent', color: '#d4e6ca', cursor: 'pointer', fontSize: '0.8rem' }}>Override Stock</button>
      </div>

      {mode === 'exchange' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
          {[
            { key: 'emptiesPickedUp', label: 'Empties picked up' },
            { key: 'fullsReceived', label: 'Fulls received' },
            { key: 'damagedTanks', label: 'Damaged removed' },
          ].map(({ key, label }) => (
            <div key={key}>
              <label style={S.label}>{label}</label>
              <input type="number" min={0} value={form[key]} onChange={(e) => set(key, e.target.value)} style={S.input} />
            </div>
          ))}
          <div>
            <label style={S.label}>Notes</label>
            <input type="text" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Optional" style={S.input} />
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, maxWidth: 400 }}>
          <div>
            <label style={S.label}>Full tanks actual</label>
            <input type="number" min={0} value={overrideFull} onChange={(e) => setOverrideFull(e.target.value)} style={S.input} required />
          </div>
          <div>
            <label style={S.label}>Reason</label>
            <input type="text" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="e.g. Emergency order received" style={S.input} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button type="submit" disabled={submitting} className="btn-gold" style={{ minWidth: 100 }}>
          {submitting ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid rgba(122,171,130,0.3)', borderRadius: 6, color: 'rgba(212,230,202,0.6)', cursor: 'pointer', fontSize: '0.88rem' }}>Cancel</button>
      </div>
    </form>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TankCalendarPage({ isAdmin, initialData }) {
  const [data, setData] = useState(initialData)
  const [expandedWeeks, setExpandedWeeks] = useState({})
  const [formWeek, setFormWeek] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [toast, setToast] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/tank-calendar')
      if (res.ok) setData(await res.json())
    } catch { /* silent */ }
  }, [])

  function toggleWeek(wed) {
    setExpandedWeeks((p) => ({ ...p, [wed]: !p[wed] }))
  }

  async function handleFormSubmit(payload) {
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/tank-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()
      setFormWeek(null)
      setToast('Saved')
      setTimeout(() => setToast(null), 3000)
      await refresh()
    } catch {
      setToast('Error — try again')
      setTimeout(() => setToast(null), 3000)
    } finally {
      setSubmitting(false)
    }
  }

  const { summary, days, weeks, alerts, exchangeHistory } = data

  // Today's load: lookup today's row in the projected days list.
  const todayIso = new Date().toISOString().slice(0, 10)
  const todayRow = days.find((d) => d.date === todayIso) || days[0]
  const todayLoad = todayRow ? { tanks: todayRow.tanksNeeded || 0, appts: todayRow.appointments || 0 } : null

  // Group days by weekOf for rendering
  const daysByWeek = {}
  for (const day of days) {
    if (!daysByWeek[day.weekOf]) daysByWeek[day.weekOf] = []
    daysByWeek[day.weekOf].push(day)
  }

  const thStyle = { padding: '8px 12px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: 'rgba(212,230,202,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid rgba(122,171,130,0.15)', whiteSpace: 'nowrap' }
  const tdStyle = (highlight) => ({ padding: '7px 12px', fontSize: '0.85rem', color: highlight ? '#ff6060' : '#d4e6ca', fontWeight: highlight ? 700 : 400, borderBottom: '1px solid rgba(122,171,130,0.06)' })

  return (
    <>
      <Head><title>Tank Calendar · GreenGuard Admin</title></Head>
      <PortalLayout title="Tank Calendar" isAdmin={isAdmin}>
        {toast && (
          <div style={{ position: 'fixed', top: 70, right: 20, padding: '10px 20px', background: toast === 'Saved' ? 'rgba(125,255,170,0.15)' : 'rgba(255,80,80,0.15)', border: `1px solid ${toast === 'Saved' ? 'rgba(125,255,170,0.4)' : 'rgba(255,80,80,0.4)'}`, borderRadius: 8, color: toast === 'Saved' ? '#7dffaa' : '#ff8080', fontWeight: 700, fontSize: '0.88rem', zIndex: 999 }}>
            {toast}
          </div>
        )}

        <SummaryBar summary={summary} todayLoad={todayLoad} />
        <AlertsBanner alerts={alerts} />

        {/* Projection table */}
        <div style={{ ...S.card, padding: 0, overflow: 'hidden', marginBottom: 32 }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(122,171,130,0.15)', fontSize: '0.8rem', color: 'rgba(212,230,202,0.45)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            8-Week Tank Projection — click a week to expand daily detail
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Delivery</th>
                  <th style={thStyle}>Available</th>
                  <th style={thStyle}>Appts</th>
                  <th style={thStyle}>Tanks Needed</th>
                  <th style={thStyle}>End Stock</th>
                  <th style={thStyle}>Deficit</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((wk) => {
                  const isOpen = expandedWeeks[wk.wednesday]
                  const wkDays = daysByWeek[wk.wednesday] || []
                  const hasIssue = wk.worstStatus !== 'ok'
                  return (
                    <React.Fragment key={`week-${wk.wednesday}`}>
                      <tr
                        onClick={() => toggleWeek(wk.wednesday)}
                        style={{ cursor: 'pointer', background: hasIssue ? (wk.worstStatus === 'short' ? 'rgba(255,80,80,0.06)' : 'rgba(201,168,76,0.06)') : 'rgba(255,255,255,0.02)' }}
                      >
                        <td style={{ ...tdStyle(false), fontWeight: 700, color: '#7dffaa' }}>
                          {isOpen ? '▾' : '▸'} Week of {fmtWed(wk.wednesday)}
                        </td>
                        <td style={tdStyle(false)}>{wk.delivery > 0 ? <span style={{ color: '#7dffaa', fontWeight: 700 }}>+{wk.delivery}</span> : '—'}</td>
                        <td style={tdStyle(false)}>{wk.startStock}</td>
                        <td style={tdStyle(false)}>{wk.totalAppts || '—'}</td>
                        <td style={tdStyle(false)}>{wk.totalTanksNeeded || '—'}</td>
                        <td style={tdStyle(wk.endStock < 0)}>{wk.endStock}</td>
                        <td style={tdStyle(wk.totalDeficit > 0)}>{wk.totalDeficit > 0 ? wk.totalDeficit : '—'}</td>
                        <td style={tdStyle(false)}><span style={S.badge(wk.worstStatus)}>{wk.worstStatus === 'ok' ? '✓ OK' : wk.worstStatus === 'low' ? '⚠ Low' : '🔴 Short'}</span></td>
                      </tr>
                      {isOpen && wkDays.map((day) => (
                        <React.Fragment key={`day-${day.date}`}>
                          <tr style={{ background: day.status === 'short' ? 'rgba(255,80,80,0.08)' : day.status === 'low' ? 'rgba(201,168,76,0.05)' : 'transparent' }}>
                            <td style={{ ...tdStyle(false), paddingLeft: 28, borderLeft: day.isWednesday ? '3px solid #c9a84c' : '3px solid transparent', color: day.isWednesday ? '#c9a84c' : '#d4e6ca', fontWeight: day.isWednesday ? 700 : 400 }}>
                              {fmtDate(day.date)}{day.isWednesday ? ' 🚚' : ''}
                              {day.isOverridden && <span style={{ marginLeft: 6, fontSize: '0.7rem', color: 'rgba(212,230,202,0.4)' }}>override</span>}
                            </td>
                            <td style={tdStyle(false)}>{day.delivery > 0 ? <span style={{ color: '#7dffaa', fontWeight: 700 }}>+{day.delivery}</span> : '—'}</td>
                            <td style={tdStyle(false)}>{day.fullsAvailable}</td>
                            <td style={tdStyle(false)}>{day.appointments || '—'}</td>
                            <td style={tdStyle(false)}>{day.tanksNeeded || '—'}</td>
                            <td style={tdStyle(day.fullsEnd < 0)}>{day.fullsEnd}</td>
                            <td style={tdStyle(day.deficit > 0)}>{day.deficit > 0 ? <strong>{day.deficit}</strong> : '—'}</td>
                            <td style={tdStyle(false)}>
                              {day.isWednesday && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setFormWeek(formWeek === day.date ? null : day.date) }}
                                  style={{ padding: '3px 10px', background: day.logged ? 'rgba(125,255,170,0.1)' : 'rgba(201,168,76,0.15)', border: `1px solid ${day.logged ? 'rgba(125,255,170,0.3)' : 'rgba(201,168,76,0.3)'}`, borderRadius: 4, color: day.logged ? '#7dffaa' : '#c9a84c', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}
                                >
                                  {day.logged ? '✓ Logged' : 'Log'}
                                </button>
                              )}
                            </td>
                          </tr>
                          {formWeek === day.date && (
                            <tr>
                              <td colSpan={8} style={{ padding: 0 }}>
                                <ExchangeForm
                                  key={day.date}
                                  weekDate={day.date}
                                  onSubmit={handleFormSubmit}
                                  onCancel={() => setFormWeek(null)}
                                  submitting={submitting}
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Exchange history */}
        <div style={S.card}>
          <button
            onClick={() => setHistoryOpen((o) => !o)}
            style={{ width: '100%', background: 'transparent', border: 'none', color: '#d4e6ca', cursor: 'pointer', textAlign: 'left', padding: 0, fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(212,230,202,0.5)' }}
          >
            {historyOpen ? '▾' : '▸'} Exchange History (last 10)
          </button>
          {historyOpen && (
            <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
              {!exchangeHistory?.length && <div style={{ color: 'rgba(212,230,202,0.4)', fontSize: '0.88rem' }}>No exchanges logged yet.</div>}
              {exchangeHistory?.map((r, i) => (
                <div key={i} style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(122,171,130,0.15)', fontSize: '0.85rem' }}>
                  <div style={{ fontWeight: 700, color: '#c9a84c', marginBottom: 6 }}>{r.week ? `Week of ${fmtWed(r.week)}` : 'Exchange record'}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '4px 16px' }}>
                    <span><span style={{ color: 'rgba(212,230,202,0.5)' }}>Empties out: </span>{r.emptiesPickedUp}</span>
                    <span><span style={{ color: 'rgba(212,230,202,0.5)' }}>Fulls received: </span>{r.fullsReceived}</span>
                    <span><span style={{ color: 'rgba(212,230,202,0.5)' }}>Damaged removed: </span>{r.damagedTanks}</span>
                  </div>
                  {r.notes && <div style={{ marginTop: 6, color: 'rgba(212,230,202,0.5)', fontSize: '0.8rem' }}>{r.notes}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </PortalLayout>
    </>
  )
}
