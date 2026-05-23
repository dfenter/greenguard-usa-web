import { useState } from 'react'
import Head from 'next/head'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'
import { findContactByEmail } from '../../lib/hubspot'
import { getBookingsForDateRange } from '../../lib/gcal'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }

  const tz = process.env.CALENDAR_TIMEZONE || 'America/Chicago'
  const now = new Date()
  const today = now.toLocaleDateString('en-CA', { timeZone: tz })

  // Fetch next 60 days of appointments and calculate tanks needed per day
  const rangeEnd = new Date(now.getTime() + 60 * 86400 * 1000)
  let scheduleByDate = {} // 'YYYY-MM-DD' → { tanks, appts }
  try {
    const bookings = await getBookingsForDateRange(now.toISOString(), rangeEnd.toISOString())

    // Resolve trap_count for each unique email via HubSpot (default 2 tanks if unknown)
    const uniqueEmails = [...new Set(bookings.map((b) => b.email).filter(Boolean))]
    const trapCountMap = {}
    await Promise.all(
      uniqueEmails.map(async (email) => {
        try {
          const contact = await findContactByEmail(email)
          trapCountMap[email] = parseInt(contact?.properties?.trap_count || '2', 10) || 2
        } catch {
          trapCountMap[email] = 2
        }
      })
    )

    bookings.forEach(({ dateStr, email }) => {
      const tanks = trapCountMap[email] || 2
      if (!scheduleByDate[dateStr]) scheduleByDate[dateStr] = { tanks: 0, appts: 0 }
      scheduleByDate[dateStr].tanks += tanks
      scheduleByDate[dateStr].appts += 1
    })
  } catch {}

  let history = []
  let tankCalendar = {}

  try {
    const contact = await findContactByEmail(ADMIN_EMAIL)
    if (contact?.id) {
      const assocResp = await fetch(
        `https://api.hubapi.com/crm/v3/objects/contacts/${contact.id}/associations/notes?limit=100`,
        { headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}` } }
      )
      if (assocResp.ok) {
        const assocData = await assocResp.json()
        const noteIds = (assocData.results || []).map((r) => r.id).slice(0, 100)
        if (noteIds.length > 0) {
          const batchResp = await fetch('https://api.hubapi.com/crm/v3/objects/notes/batch/read', {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ inputs: noteIds.map((id) => ({ id: String(id) })), properties: ['hs_note_body', 'hs_timestamp'] }),
          })
          if (batchResp.ok) {
            const batchData = await batchResp.json()
            history = (batchData.results || [])
              .filter((n) => n.properties.hs_note_body?.startsWith('[TANK-LOG]'))
              .sort((a, b) => new Date(b.properties.hs_timestamp) - new Date(a.properties.hs_timestamp))
              .slice(0, 30)
              .map((n) => {
                try {
                  const json = JSON.parse(n.properties.hs_note_body.replace('[TANK-LOG]', ''))
                  return { ...json, timestamp: n.properties.hs_timestamp }
                } catch { return null }
              })
              .filter(Boolean)

            history.forEach((entry) => {
              if (entry.date) tankCalendar[entry.date] = entry
            })
          }
        }
      }
    }
  } catch {}

  // Last Wednesday's emptiesPickedUp → expected delivery next week
  const lastWedLog = history.find((e) => {
    const dow = new Date(e.date + 'T12:00:00').getDay()
    return dow === 3 && e.emptiesPickedUp > 0
  })
  const expectedDelivery = lastWedLog?.emptiesPickedUp || 0

  // Total tanks scheduled this week (Mon–Sun) → default for Wednesday emptiesPickedUp
  // This is the number of empties the tech should collect this Wednesday
  const todayDate = new Date(today + 'T12:00:00')
  const dayOfWeek = todayDate.getDay() // 0=Sun, 1=Mon ... 6=Sat
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const weekMonday = new Date(todayDate)
  weekMonday.setDate(todayDate.getDate() + mondayOffset)
  const weekSunday = new Date(weekMonday)
  weekSunday.setDate(weekMonday.getDate() + 6)

  let weeklyTankTotal = 0
  for (let d = new Date(weekMonday); d <= weekSunday; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: tz })
    weeklyTankTotal += scheduleByDate[dateStr]?.tanks || 0
  }

  return { props: { history, tankCalendar, scheduleByDate, expectedDelivery, weeklyTankTotal, today } }
}

// ── Calendar ───────────────────────────────────────────────────────────────────

function Calendar({ tankCalendar, scheduleByDate, onDayClick, today, currentStock, expectedDelivery }) {
  const [viewDate, setViewDate] = useState(new Date())
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // Build running stock forecast from today forward
  const forecastMap = {}
  let runningStock = currentStock
  const todayObj = new Date(today + 'T12:00:00')
  for (let d = 0; d < 60; d++) {
    const dt = new Date(todayObj.getTime() + d * 86400 * 1000)
    const ds = dt.toLocaleDateString('en-CA')
    const isWed = dt.getDay() === 3
    const dayData = scheduleByDate[ds] || { tanks: 0, appts: 0 }
    if (isWed && d > 0) runningStock += expectedDelivery
    runningStock -= dayData.tanks
    forecastMap[ds] = { tanks: dayData.tanks, appts: dayData.appts, forecast: runningStock }
  }

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ d, dateStr, log: tankCalendar[dateStr] || null, sched: forecastMap[dateStr] || null })
  }

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <button onClick={() => setViewDate(new Date(year, month - 1, 1))}
          style={{ background: 'none', border: 'none', color: 'rgba(212,230,202,0.6)', cursor: 'pointer', fontSize: '1.2rem', fontFamily: 'Nunito Sans, sans-serif' }}>‹</button>
        <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>{monthLabel}</span>
        <button onClick={() => setViewDate(new Date(year, month + 1, 1))}
          style={{ background: 'none', border: 'none', color: 'rgba(212,230,202,0.6)', cursor: 'pointer', fontSize: '1.2rem', fontFamily: 'Nunito Sans, sans-serif' }}>›</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 3, marginBottom: 3 }}>
        {dayLabels.map((l) => (
          <div key={l} style={{ textAlign: 'center', fontSize: '0.62rem', fontWeight: 800, color: 'rgba(212,230,202,0.35)', letterSpacing: '0.04em', padding: '4px 0' }}>{l}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 3 }}>
        {cells.map((cell, i) => {
          if (!cell) return <div key={`e${i}`} />
          const { d, dateStr, log, sched } = cell
          const isToday = dateStr === today
          const tanks = sched?.tanks || 0
          const appts = sched?.appts || 0
          const forecast = sched?.forecast
          const hasLog = !!log
          const deficit = forecast != null && tanks > 0 && forecast < 0

          let bg = 'rgba(255,255,255,0.03)'
          let border = 'rgba(122,171,130,0.12)'
          if (tanks > 0) {
            if (deficit) { bg = 'rgba(255,100,100,0.1)'; border = 'rgba(255,100,100,0.3)' }
            else { bg = 'rgba(125,255,170,0.06)'; border = 'rgba(125,255,170,0.2)' }
          }
          if (hasLog) { bg = 'rgba(201,168,76,0.07)'; border = 'rgba(201,168,76,0.3)' }
          if (isToday) border = '#c9a84c'

          return (
            <div key={dateStr} onClick={() => onDayClick(dateStr, log, tanks)}
              style={{ borderRadius: 6, border: `1px solid ${border}`, background: bg, padding: '6px 3px', cursor: 'pointer', minHeight: 72, minWidth: 0, overflow: 'hidden' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: isToday ? 900 : 600, color: isToday ? '#c9a84c' : 'rgba(212,230,202,0.75)', marginBottom: 2, textAlign: 'center' }}>{d}</div>
              {tanks > 0 && (
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: deficit ? '#ff8080' : '#7dffaa', textAlign: 'center', lineHeight: 1.15 }}>
                  {tanks}t
                </div>
              )}
              {appts > 0 && (
                <div style={{ fontSize: '0.62rem', color: 'rgba(212,230,202,0.5)', textAlign: 'center', lineHeight: 1.15 }}>{appts}v</div>
              )}
              {hasLog && (
                <div style={{ fontSize: '0.62rem', color: '#c9a84c', fontWeight: 700, marginTop: 2, textAlign: 'center' }}>✓</div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: '0.68rem', color: 'rgba(212,230,202,0.45)', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: 'rgba(125,255,170,0.15)', border: '1px solid rgba(125,255,170,0.25)', display: 'inline-block' }} /> On track</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: 'rgba(255,100,100,0.15)', border: '1px solid rgba(255,100,100,0.3)', display: 'inline-block' }} /> Deficit</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', display: 'inline-block' }} /> Logged</span>
        <span style={{ color: 'rgba(212,230,202,0.3)' }}>t = tanks · v = visits</span>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function Inventory({ history: initialHistory, tankCalendar: initialCalendar, scheduleByDate, expectedDelivery: initExpectedDelivery, weeklyTankTotal, today }) {
  const tz = 'America/Chicago'
  const todayDow = new Date().toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' })
  const isWednesday = todayDow === 'Wednesday'

  // Tomorrow's appointment count from schedule
  const tomorrowObj = new Date(new Date(today + 'T12:00:00').getTime() + 86400 * 1000)
  const tomorrow = tomorrowObj.toLocaleDateString('en-CA')
  const tomorrowTanks = scheduleByDate[tomorrow]?.tanks || 0

  const EQUIPMENT_ITEMS = [
    { key: 'bgTraps', label: 'Biogents Traps' },
    { key: 'mqTraps', label: 'Mosqitter Traps' },
    { key: 'bgTimers', label: 'Biogents Timers' },
    { key: 'regulators', label: 'CO₂ Regulators' },
    { key: 'bgSweetscent', label: 'BG Sweetscent Bait' },
    { key: 'bgFunnels', label: 'BG Funnels' },
    { key: 'bgNets', label: 'BG Trap Nets' },
    { key: 'bgPowerSupply', label: 'BG Power Supplies' },
    { key: 'extensions50', label: '50ft Extension Cords' },
    { key: 'extensions100', label: '100ft Extension Cords' },
    { key: 'splitters', label: 'Splitters' },
    { key: 'batteries9v', label: '9V Batteries' },
    { key: 'tankWashers', label: 'Tank Washers' },
  ]

  // Default emptiesPickedUp to this week's scheduled tank total
  // (empties collected Wednesday = tanks serviced this week = full tanks needed next week)
  const defaultEmptiesPickedUp = weeklyTankTotal > 0 ? String(weeklyTankTotal) : ''

  const [form, setForm] = useState({
    date: today,
    fullEnd: '',
    emptyEnd: '',
    neededTomorrow: String(tomorrowTanks),
    emptiesPickedUp: defaultEmptiesPickedUp,
    fullDelivered: '',
    notes: '',
    equipment: Object.fromEntries(EQUIPMENT_ITEMS.map((e) => [e.key, ''])),
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [history, setHistory] = useState(initialHistory)
  const [tankCalendar, setTankCalendar] = useState(initialCalendar)
  const [selectedDay, setSelectedDay] = useState(null)
  const [selectedTanks, setSelectedTanks] = useState(0)
  const [expectedDelivery, setExpectedDelivery] = useState(initExpectedDelivery)

  function set(field) { return (e) => setForm((f) => ({ ...f, [field]: e.target.value })) }
  function setEquip(key) { return (e) => setForm((f) => ({ ...f, equipment: { ...f.equipment, [key]: e.target.value } })) }

  const isFormWednesday = new Date(form.date + 'T12:00:00').getDay() === 3

  // Current stock = most recent logged fullEnd
  const lastEntry = history[0]
  const currentStock = lastEntry?.fullEnd ?? 0
  const stockDisplay = lastEntry?.fullEnd != null ? lastEntry.fullEnd : '—'

  // Forecast: fullEnd tomorrow = fullEnd today - neededTomorrow
  const fullEndNum = parseInt(form.fullEnd || 0)
  const neededTomNum = parseInt(form.neededTomorrow || 0)
  const forecastTomorrow = form.fullEnd ? fullEndNum - neededTomNum : null

  async function save() {
    setSaving(true)
    setMsg(null)
    const payload = {
      date: form.date,
      fullEnd: parseInt(form.fullEnd || 0),
      emptyEnd: parseInt(form.emptyEnd || 0),
      neededTomorrow: parseInt(form.neededTomorrow || 0),
      ...(isFormWednesday && {
        emptiesPickedUp: parseInt(form.emptiesPickedUp || 0),
        fullDelivered: parseInt(form.fullDelivered || 0),
      }),
      equipment: Object.fromEntries(
        Object.entries(form.equipment).map(([k, v]) => [k, parseInt(v || 0)])
      ),
      notes: form.notes,
    }
    const res = await fetch('/api/admin/save-inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (res.ok) {
      const resData = await res.json()
      const lowStock = payload.fullEnd < payload.neededTomorrow
      setMsg(lowStock ? `⚠️ Saved — only ${payload.fullEnd} full tanks, need ${payload.neededTomorrow} tomorrow!` : 'Log saved ✓')
      setHistory((prev) => [{ ...payload, timestamp: new Date().toISOString() }, ...prev].slice(0, 30))
      setTankCalendar((prev) => ({ ...prev, [form.date]: payload }))
      // Update expected delivery if Wednesday and empties were entered
      if (isFormWednesday && payload.emptiesPickedUp > 0) {
        setExpectedDelivery(payload.emptiesPickedUp)
      }
    } else {
      const j = await res.json().catch(() => ({}))
      setMsg(`Error: ${j.error || 'Failed'}`)
    }
  }

  function handleDayClick(dateStr, log, tanks) {
    setSelectedDay(dateStr)
    setSelectedTanks(tanks || 0)
    const dayTomorrow = new Date(new Date(dateStr + 'T12:00:00').getTime() + 86400 * 1000).toLocaleDateString('en-CA')
    const dayTomorrowAppts = scheduleByDate[dayTomorrow]?.tanks || 0
    if (log) {
      setForm({
        date: dateStr,
        fullEnd: String(log.fullEnd ?? ''),
        emptyEnd: String(log.emptyEnd ?? ''),
        neededTomorrow: String(log.neededTomorrow ?? dayTomorrowAppts),
        emptiesPickedUp: String(log.emptiesPickedUp ?? ''),
        fullDelivered: String(log.fullDelivered ?? ''),
        notes: log.notes || '',
        equipment: Object.fromEntries(EQUIPMENT_ITEMS.map((e) => [e.key, String(log.equipment?.[e.key] ?? '')])),
      })
    } else {
      setForm((f) => ({
        ...f,
        date: dateStr,
        fullEnd: '',
        emptyEnd: '',
        neededTomorrow: String(dayTomorrowAppts),
        emptiesPickedUp: '',
        fullDelivered: '',
        notes: '',
        equipment: Object.fromEntries(EQUIPMENT_ITEMS.map((e) => [e.key, ''])),
      }))
    }
  }

  const input = { width: '100%', padding: '9px 12px', boxSizing: 'border-box', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 8, background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.9rem', fontFamily: 'Nunito Sans, sans-serif', outline: 'none', textAlign: 'right' }
  const lbl = { fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.45)', display: 'block', marginBottom: 4 }
  const section = { fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.3)', margin: '18px 0 10px', paddingBottom: 6, borderBottom: '1px solid rgba(122,171,130,0.1)' }

  // Today's tank count from schedule
  const todayTanks = scheduleByDate[form.date]?.tanks || selectedTanks || 0
  const todayAppts = scheduleByDate[form.date]?.appts || 0

  return (
    <>
      <Head><title>Daily Rounds · GreenGuard Admin</title></Head>
      <PortalLayout isAdmin>
        <div style={{ marginBottom: 24 }}>
          <span className="tag">Admin</span>
          <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Daily Rounds</h1>
          <p style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.45)', margin: 0 }}>
            CO₂ tank tracking · Depot stock: <strong style={{ color: '#7dffaa', fontSize: '1.05rem' }}>{stockDisplay}</strong> full tanks
            {expectedDelivery > 0 && <span style={{ marginLeft: 12, color: 'rgba(201,168,76,0.7)' }}>· Next delivery est. {expectedDelivery} tanks</span>}
          </p>
        </div>

        <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>
          {/* Calendar + history */}
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.7rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#c9a84c', marginBottom: 12 }}>Tank Calendar</div>
            <div className="card">
              <Calendar
                tankCalendar={tankCalendar}
                scheduleByDate={scheduleByDate}
                onDayClick={handleDayClick}
                today={today}
                currentStock={currentStock}
                expectedDelivery={expectedDelivery}
              />
            </div>

            <div style={{ marginTop: 24, fontWeight: 800, fontSize: '0.7rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#c9a84c', marginBottom: 12 }}>Recent Logs</div>
            {history.slice(0, 7).map((entry, i) => (
              <div key={i} className="card" style={{ marginBottom: 8, padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>{entry.date}</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: entry.fullEnd < entry.neededTomorrow ? '#ff8080' : '#7dffaa' }}>
                    {entry.fullEnd} full · {entry.emptyEnd} empty
                  </span>
                </div>
                {entry.neededTomorrow > 0 && (
                  <div style={{ fontSize: '0.75rem', color: 'rgba(212,230,202,0.5)' }}>Need tomorrow: {entry.neededTomorrow}</div>
                )}
                {entry.emptiesPickedUp > 0 && (
                  <div style={{ fontSize: '0.75rem', color: '#c9a84c' }}>Wed: {entry.emptiesPickedUp} empties collected · {entry.fullDelivered} full delivered</div>
                )}
                {entry.notes && <div style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.4)', marginTop: 4 }}>{entry.notes}</div>}
              </div>
            ))}
          </div>

          {/* Log form */}
          <div style={{ position: 'sticky', top: 72 }}>
            <div style={{ fontWeight: 800, fontSize: '0.7rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#c9a84c', marginBottom: 12 }}>
              {selectedDay ? `Log for ${selectedDay}` : 'Daily Log Entry'}
            </div>
            <div className="card">
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Date</label>
                <input style={{ ...input, textAlign: 'left' }} type="date" value={form.date} onChange={set('date')} />
              </div>

              {todayTanks > 0 && (
                <div style={{ marginBottom: 14, padding: '8px 12px', borderRadius: 6, background: 'rgba(125,255,170,0.05)', border: '1px solid rgba(125,255,170,0.15)', fontSize: '0.8rem', color: 'rgba(212,230,202,0.7)' }}>
                  📅 {todayTanks} tank{todayTanks > 1 ? 's' : ''} needed · {todayAppts} visit{todayAppts !== 1 ? 's' : ''}
                </div>
              )}

              <div style={section}>End of Day Counts</div>

              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Full tanks at end of day</label>
                <input style={input} type="number" min="0" placeholder="0" value={form.fullEnd} onChange={set('fullEnd')} />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Empty tanks at end of day</label>
                <input style={input} type="number" min="0" placeholder="0" value={form.emptyEnd} onChange={set('emptyEnd')} />
              </div>

              <div style={section}>Tomorrow</div>

              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Tanks needed tomorrow {tomorrowTanks > 0 && !selectedDay ? <span style={{ color: 'rgba(201,168,76,0.7)', fontWeight: 700 }}>({tomorrowTanks} from schedule)</span> : ''}</label>
                <input style={input} type="number" min="0" placeholder="0" value={form.neededTomorrow} onChange={set('neededTomorrow')} />
              </div>

              {/* Tomorrow forecast */}
              {forecastTomorrow != null && (
                <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: forecastTomorrow < 0 ? 'rgba(255,100,100,0.08)' : 'rgba(125,255,170,0.05)', border: `1px solid ${forecastTomorrow < 0 ? 'rgba(255,100,100,0.25)' : 'rgba(125,255,170,0.15)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.8rem', color: 'rgba(212,230,202,0.55)' }}>Forecast after tomorrow</span>
                    <span style={{ fontWeight: 900, fontSize: '1rem', color: forecastTomorrow < 0 ? '#ff8080' : '#7dffaa' }}>{forecastTomorrow}</span>
                  </div>
                  {forecastTomorrow < 0 && (
                    <div style={{ marginTop: 4, fontSize: '0.75rem', color: '#ff8080', fontWeight: 700 }}>⚠️ Deficit of {Math.abs(forecastTomorrow)} — reorder needed!</div>
                  )}
                </div>
              )}

              {/* Wednesday only */}
              {isFormWednesday && (
                <div style={{ padding: '14px', background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 8, marginBottom: 14 }}>
                  <div style={{ ...section, marginTop: 0, color: '#c9a84c', borderColor: 'rgba(201,168,76,0.2)' }}>Wednesday Exchange</div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ ...lbl, color: '#c9a84c' }}>Empty tanks picked up today</label>
                    <input style={input} type="number" min="0" placeholder="0" value={form.emptiesPickedUp} onChange={set('emptiesPickedUp')} />
                    <p style={{ fontSize: '0.7rem', color: 'rgba(201,168,76,0.55)', margin: '4px 0 0' }}>
                      Pre-filled from this week&apos;s schedule ({weeklyTankTotal} tanks). Adjust if actual pickups differ. This becomes next week&apos;s expected delivery.
                    </p>
                  </div>
                  <div>
                    <label style={{ ...lbl, color: '#c9a84c' }}>Full tanks delivered today</label>
                    <input style={input} type="number" min="0" placeholder="0" value={form.fullDelivered} onChange={set('fullDelivered')} />
                  </div>
                </div>
              )}

              <div style={section}>Equipment Counts</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginBottom: 14 }}>
                {EQUIPMENT_ITEMS.map((item) => (
                  <div key={item.key}>
                    <label style={{ ...lbl, fontSize: '0.65rem' }}>{item.label}</label>
                    <input style={{ ...input, padding: '7px 10px' }} type="number" min="0" placeholder="0" value={form.equipment[item.key]} onChange={setEquip(item.key)} />
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Notes</label>
                <textarea rows={2} style={{ ...input, textAlign: 'left', resize: 'vertical' }} placeholder="Delivery notes, issues…" value={form.notes} onChange={set('notes')} />
              </div>

              {msg && (
                <div style={{ padding: '8px 12px', borderRadius: 6, background: msg.startsWith('Error') ? 'rgba(255,100,100,0.08)' : msg.includes('⚠️') ? 'rgba(255,160,80,0.08)' : 'rgba(125,255,170,0.06)', border: `1px solid ${msg.startsWith('Error') ? 'rgba(255,100,100,0.2)' : msg.includes('⚠️') ? 'rgba(255,160,80,0.2)' : 'rgba(125,255,170,0.2)'}`, color: msg.startsWith('Error') ? '#ff8080' : msg.includes('⚠️') ? '#ffb060' : '#7dffaa', fontSize: '0.82rem', marginBottom: 12 }}>
                  {msg}
                </div>
              )}

              <button onClick={save} disabled={saving}
                style={{ width: '100%', padding: 12, borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 900, fontSize: '0.9rem', fontFamily: 'Nunito Sans, sans-serif', background: saving ? 'rgba(125,255,170,0.2)' : '#7dffaa', color: '#0d1a10', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Save Daily Log'}
              </button>
            </div>
          </div>
        </div>
      </PortalLayout>
    </>
  )
}
