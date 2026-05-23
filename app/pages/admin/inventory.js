import { useState } from 'react'
import Head from 'next/head'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'
import { buildTankCalendarData } from '../../lib/tank-data'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }

  const tz = process.env.CALENDAR_TIMEZONE || 'America/Chicago'
  const { history, tankCalendar, scheduleByDate, expectedDelivery, weeklyTankTotal, today } = await buildTankCalendarData(tz)
  return { props: { history, tankCalendar, scheduleByDate, expectedDelivery, weeklyTankTotal, today } }
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
      <Head><title>Inventory · GreenGuard Admin</title></Head>
      <PortalLayout isAdmin>
        <div style={{ marginBottom: 24 }}>
          <span className="tag">Admin</span>
          <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Inventory</h1>
          <p style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.45)', margin: 0 }}>
            CO₂ tank tracking · Depot stock: <strong style={{ color: '#7dffaa', fontSize: '1.05rem' }}>{stockDisplay}</strong> full tanks
            {expectedDelivery > 0 && <span style={{ marginLeft: 12, color: 'rgba(201,168,76,0.7)' }}>· Next delivery est. {expectedDelivery} tanks</span>}
          </p>
        </div>

        <div style={{ maxWidth: 540, margin: '0 auto' }}>
          {/* Tomorrow indicator (read-only, auto-calculated from schedule) */}
          <div style={{ marginBottom: 18, padding: '14px 18px', borderRadius: 10, background: tomorrowTanks > 0 ? 'rgba(201,168,76,0.08)' : 'rgba(125,255,170,0.05)', border: `1px solid ${tomorrowTanks > 0 ? 'rgba(201,168,76,0.3)' : 'rgba(125,255,170,0.18)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: tomorrowTanks > 0 ? '#c9a84c' : 'rgba(212,230,202,0.4)', marginBottom: 4 }}>
                Tanks Needed Tomorrow
              </div>
              <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.55)' }}>
                {tomorrowTanks > 0 ? `From ${scheduleByDate[tomorrow]?.appts || 0} scheduled visit${(scheduleByDate[tomorrow]?.appts || 0) !== 1 ? 's' : ''}` : 'No visits scheduled for tomorrow'}
              </div>
            </div>
            <div style={{ fontSize: '2.4rem', fontWeight: 900, lineHeight: 1, color: tomorrowTanks > 0 ? '#c9a84c' : 'rgba(125,255,170,0.6)' }}>
              {tomorrowTanks}
            </div>
          </div>

          {/* Log form — full Tank Calendar lives on /admin/home */}
          <div style={{ fontWeight: 800, fontSize: '0.7rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#c9a84c', marginBottom: 12 }}>
            {selectedDay ? `Log for ${selectedDay}` : 'Daily Log Entry'}
          </div>
          <div className="card">
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Date</label>
              <input style={{ ...input, textAlign: 'left', maxWidth: 200, WebkitAppearance: 'none', appearance: 'none', minHeight: 42 }} type="date" value={form.date} onChange={set('date')} />
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

              {/* Tomorrow forecast — Tanks Needed Tomorrow is auto-calculated and shown
                  as a banner at the top of the page; no form input needed */}
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 12px', marginBottom: 14 }}>
                {EQUIPMENT_ITEMS.map((item) => (
                  <div key={item.key} style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ ...lbl, fontSize: '0.65rem', minHeight: 28, lineHeight: 1.25, display: 'flex', alignItems: 'flex-end', marginBottom: 6 }}>{item.label}</label>
                    <input style={{ ...input, padding: '7px 10px', marginTop: 'auto' }} type="number" min="0" placeholder="0" value={form.equipment[item.key]} onChange={setEquip(item.key)} />
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
      </PortalLayout>
    </>
  )
}
