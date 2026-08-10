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
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  let tankData = { history: [], tankCalendar: [], scheduleByDate: {}, expectedDelivery: null, weeklyTankTotal: 0, today }
  try { tankData = await buildTankCalendarData(tz) } catch {}
  const { history, tankCalendar, scheduleByDate, expectedDelivery, weeklyTankTotal } = tankData
  return { props: { history, tankCalendar, scheduleByDate, expectedDelivery, weeklyTankTotal, today: tankData.today } }
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

  // Pulled from shared lib/catalog so adding a new inventory-tracked item in
  // catalog.js shows up here automatically. Existing keys preserved so the
  // historical HubSpot tank-log notes still match by key (don't rename in
  // catalog.js without a migration).
  const { inventoryItems } = require('../../lib/catalog')
  const EQUIPMENT_ITEMS = inventoryItems()

  // Default emptiesPickedUp to this week's scheduled tank total
  // (empties collected Wednesday = tanks serviced this week = full tanks needed next week)
  const defaultEmptiesPickedUp = weeklyTankTotal > 0 ? String(weeklyTankTotal) : ''

  // Prefill from the most recent history entry that actually has a value for
  // this field. 0 IS a valid value (e.g. "we used every empty tank this week")
  // and should round-trip — the previous skip-zero logic caused the form to
  // show blank with a "0" placeholder whenever the latest save included 0 or
  // a blank-defaulted-to-0 field, which felt like prefill was broken.
  function lastKnown(field) {
    for (const entry of initialHistory) {
      const v = entry?.[field]
      if (v != null && v !== '') return v
    }
    return null
  }
  function lastKnownEquip(key) {
    for (const entry of initialHistory) {
      const v = entry?.equipment?.[key]
      if (v != null && v !== '') return v
    }
    return null
  }
  const lastFullEnd       = lastKnown('fullEnd')
  const lastEmptyEnd      = lastKnown('emptyEnd')
  const lastEmptiesPickup = lastKnown('emptiesPickedUp')
  const lastFullDelivered = lastKnown('fullDelivered')

  const [form, setForm] = useState({
    date: today,
    fullEnd: lastFullEnd != null ? String(lastFullEnd) : '',
    emptyEnd: lastEmptyEnd != null ? String(lastEmptyEnd) : '',
    neededTomorrow: String(tomorrowTanks),
    // Pre-populate with the scheduled total when available; if not, fall back
    // to whatever was last actually picked up.
    emptiesPickedUp: defaultEmptiesPickedUp || (lastEmptiesPickup != null ? String(lastEmptiesPickup) : ''),
    fullDelivered: lastFullDelivered != null ? String(lastFullDelivered) : '',
    notes: '',
    equipment: Object.fromEntries(EQUIPMENT_ITEMS.map((e) => {
      const v = lastKnownEquip(e.key)
      return [e.key, v != null ? String(v) : '']
    })),
  })

  // Placeholders showing the last known value — visible when the field is
  // cleared so the admin always sees what last time looked like.
  const placeholders = {
    fullEnd: lastFullEnd != null ? `last: ${lastFullEnd}` : '0',
    emptyEnd: lastEmptyEnd != null ? `last: ${lastEmptyEnd}` : '0',
    emptiesPickedUp: lastEmptiesPickup != null ? `last: ${lastEmptiesPickup}` : '0',
    fullDelivered: lastFullDelivered != null ? `last: ${lastFullDelivered}` : '0',
    equipment: Object.fromEntries(EQUIPMENT_ITEMS.map((e) => {
      const v = lastKnownEquip(e.key)
      return [e.key, v != null ? `last: ${v}` : '0']
    })),
  }
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
    // Only include fields the admin actually filled in. Previously a blank
    // field became `parseInt('' || 0) = 0` and got persisted, which poisoned
    // every future prefill — the "last entry" would have zeros for whatever
    // was left blank that day, and the read side could no longer distinguish
    // "intentional zero" from "I didn't touch this field".
    const num = (v) => (v === '' || v == null ? undefined : parseInt(v))
    const equipmentEntries = Object.entries(form.equipment)
      .map(([k, v]) => [k, num(v)])
      .filter(([, v]) => v !== undefined)
    const payload = {
      date: form.date,
      ...(num(form.fullEnd) !== undefined        && { fullEnd: num(form.fullEnd) }),
      ...(num(form.emptyEnd) !== undefined       && { emptyEnd: num(form.emptyEnd) }),
      ...(num(form.neededTomorrow) !== undefined && { neededTomorrow: num(form.neededTomorrow) }),
      ...(isFormWednesday && num(form.emptiesPickedUp) !== undefined && { emptiesPickedUp: num(form.emptiesPickedUp) }),
      ...(isFormWednesday && num(form.fullDelivered)  !== undefined && { fullDelivered:  num(form.fullDelivered) }),
      ...(equipmentEntries.length > 0 && { equipment: Object.fromEntries(equipmentEntries) }),
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

  const input = { width: '100%', padding: '12px 16px', boxSizing: 'border-box', border: '1px solid rgba(var(--border-rgb),0.25)', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--text)', fontSize: '0.95rem', fontFamily: 'inherit', textAlign: 'left' }
  const lbl = { fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(var(--text-rgb),0.6)', display: 'block', marginBottom: 8 }
  const section = { fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(var(--text-rgb),0.3)', margin: '18px 0 10px', paddingBottom: 6, borderBottom: '1px solid rgba(var(--border-rgb),0.1)' }

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
          <p style={{ fontSize: '0.85rem', color: 'rgba(var(--text-rgb),0.45)', margin: 0 }}>
            CO₂ tank tracking · Depot stock: <strong style={{ color: 'var(--green)', fontSize: '1.05rem' }}>{stockDisplay}</strong> full tanks
            {expectedDelivery > 0 && <span style={{ marginLeft: 12, color: 'rgba(var(--gold-rgb),0.7)' }}>· Next delivery est. {expectedDelivery} tanks</span>}
          </p>
        </div>

        <div style={{ maxWidth: 540, margin: '0 auto' }}>
          {/* Tomorrow indicator (read-only, auto-calculated from schedule) */}
          <div style={{ marginBottom: 18, padding: '14px 18px', borderRadius: 10, background: tomorrowTanks > 0 ? 'rgba(var(--gold-rgb),0.08)' : 'rgba(var(--green-rgb),0.05)', border: `1px solid ${tomorrowTanks > 0 ? 'rgba(var(--gold-rgb),0.3)' : 'rgba(var(--green-rgb),0.18)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: tomorrowTanks > 0 ? 'var(--gold)' : 'rgba(var(--text-rgb),0.4)', marginBottom: 4 }}>
                Tanks Needed Tomorrow
              </div>
              <div style={{ fontSize: '0.78rem', color: 'rgba(var(--text-rgb),0.55)' }}>
                {tomorrowTanks > 0 ? `From ${scheduleByDate[tomorrow]?.appts || 0} scheduled visit${(scheduleByDate[tomorrow]?.appts || 0) !== 1 ? 's' : ''}` : 'No visits scheduled for tomorrow'}
              </div>
            </div>
            <div style={{ fontSize: '2.4rem', fontWeight: 900, lineHeight: 1, color: tomorrowTanks > 0 ? 'var(--gold)' : 'rgba(var(--green-rgb),0.6)' }}>
              {tomorrowTanks}
            </div>
          </div>

          {/* Log form — full Tank Calendar lives on /admin/home */}
          <div style={{ fontWeight: 800, fontSize: '0.7rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 12 }}>
            {selectedDay ? `Log for ${selectedDay}` : 'Daily Log Entry'}
          </div>
          <div className="card">
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Date</label>
              <input style={{ ...input, textAlign: 'left', width: '100%', WebkitAppearance: 'none', appearance: 'none', minHeight: 48, boxSizing: 'border-box' }} type="date" value={form.date} onChange={set('date')} />
            </div>

              {todayTanks > 0 && (
                <div style={{ marginBottom: 14, padding: '8px 12px', borderRadius: 6, background: 'rgba(var(--green-rgb),0.05)', border: '1px solid rgba(var(--green-rgb),0.15)', fontSize: '0.8rem', color: 'rgba(var(--text-rgb),0.7)' }}>
                  📅 {todayTanks} tank{todayTanks > 1 ? 's' : ''} needed · {todayAppts} visit{todayAppts !== 1 ? 's' : ''}
                </div>
              )}

              <div style={section}>End of Day Counts</div>

              <div style={{ marginBottom: 18 }}>
                <label style={lbl}>Full tanks at end of day</label>
                <input style={input} type="number" min="0" placeholder={placeholders.fullEnd} value={form.fullEnd} onChange={set('fullEnd')} />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={lbl}>Empty tanks at end of day</label>
                <input style={input} type="number" min="0" placeholder={placeholders.emptyEnd} value={form.emptyEnd} onChange={set('emptyEnd')} />
              </div>

              {/* Tomorrow forecast — Tanks Needed Tomorrow is auto-calculated and shown
                  as a banner at the top of the page; no form input needed */}
              {forecastTomorrow != null && (
                <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: forecastTomorrow < 0 ? 'rgba(var(--danger-rgb),0.08)' : 'rgba(var(--green-rgb),0.05)', border: `1px solid ${forecastTomorrow < 0 ? 'rgba(var(--danger-rgb),0.25)' : 'rgba(var(--green-rgb),0.15)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.8rem', color: 'rgba(var(--text-rgb),0.55)' }}>Forecast after tomorrow</span>
                    <span style={{ fontWeight: 900, fontSize: '1rem', color: forecastTomorrow < 0 ? 'var(--danger)' : 'var(--green)' }}>{forecastTomorrow}</span>
                  </div>
                  {forecastTomorrow < 0 && (
                    <div style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 700 }}>⚠️ Deficit of {Math.abs(forecastTomorrow)} — reorder needed!</div>
                  )}
                </div>
              )}

              {/* Wednesday only */}
              {isFormWednesday && (
                <div style={{ padding: '14px', background: 'rgba(var(--gold-rgb),0.05)', border: '1px solid rgba(var(--gold-rgb),0.2)', borderRadius: 8, marginBottom: 14 }}>
                  <div style={{ ...section, marginTop: 0, color: 'var(--gold)', borderColor: 'rgba(var(--gold-rgb),0.2)' }}>Wednesday Exchange</div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ ...lbl, color: 'var(--gold)' }}>Empty tanks picked up today</label>
                    <input style={input} type="number" min="0" placeholder={placeholders.emptiesPickedUp} value={form.emptiesPickedUp} onChange={set('emptiesPickedUp')} />
                    <p style={{ fontSize: '0.7rem', color: 'rgba(var(--gold-rgb),0.55)', margin: '4px 0 0' }}>
                      Pre-filled from the next 7 days&apos; schedule ({weeklyTankTotal} tanks). Adjust if actual pickups differ. This becomes next week&apos;s expected delivery.
                    </p>
                  </div>
                  <div>
                    <label style={{ ...lbl, color: 'var(--gold)' }}>Full tanks delivered today</label>
                    <input style={input} type="number" min="0" placeholder={placeholders.fullDelivered} value={form.fullDelivered} onChange={set('fullDelivered')} />
                  </div>
                </div>
              )}

              <div style={section}>Equipment Counts</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 14px', marginBottom: 18 }}>
                {EQUIPMENT_ITEMS.map((item) => (
                  <div key={item.key} style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ ...lbl, fontSize: '0.65rem', minHeight: 28, lineHeight: 1.25, display: 'flex', alignItems: 'flex-end', marginBottom: 8 }}>{item.label}</label>
                    <input style={{ ...input, marginTop: 'auto' }} type="number" min="0" placeholder={placeholders.equipment[item.key]} value={form.equipment[item.key]} onChange={setEquip(item.key)} />
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={lbl}>Notes</label>
                <textarea rows={2} style={{ ...input, textAlign: 'left', resize: 'vertical' }} placeholder="Delivery notes, issues…" value={form.notes} onChange={set('notes')} />
              </div>

              {msg && (
                <div style={{ padding: '8px 12px', borderRadius: 6, background: msg.startsWith('Error') ? 'rgba(var(--danger-rgb),0.08)' : msg.includes('⚠️') ? 'rgba(var(--warn-rgb),0.08)' : 'rgba(var(--green-rgb),0.06)', border: `1px solid ${msg.startsWith('Error') ? 'rgba(var(--danger-rgb),0.2)' : msg.includes('⚠️') ? 'rgba(var(--warn-rgb),0.2)' : 'rgba(var(--green-rgb),0.2)'}`, color: msg.startsWith('Error') ? 'var(--danger)' : msg.includes('⚠️') ? 'var(--warn)' : 'var(--green)', fontSize: '0.82rem', marginBottom: 12 }}>
                  {msg}
                </div>
              )}

              <button onClick={save} disabled={saving}
                style={{ width: '100%', padding: 12, borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 900, fontSize: '0.9rem', fontFamily: 'inherit', background: saving ? 'rgba(var(--green-rgb),0.2)' : 'var(--green)', color: 'var(--text-on-accent)', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Save Daily Log'}
              </button>
          </div>
        </div>
      </PortalLayout>
    </>
  )
}
