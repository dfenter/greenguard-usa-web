import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'
import { getBookingsForDate } from '../../lib/gcal'
import { findContactsByEmails, tanksForCustomer } from '../../lib/hubspot'

const TZ = 'America/Chicago'
const DAY_START_HOUR = 8   // 8 AM
const DAY_END_HOUR = 19    // 7 PM
const PX_PER_MIN = 1.4     // grid scale: 1 hour = 84px

export async function getServerSideProps({ req, res }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }

  // Browser-cache the rendered calendar for 15 min so repeat visits load
  // instantly and the page only re-fetches from the server every ~15 min.
  // Private (per-browser, not a shared CDN) since it's behind admin auth.
  // stale-while-revalidate lets it serve the cached copy while quietly
  // refreshing in the background once the window passes.
  res?.setHeader('Cache-Control', 'private, max-age=900, stale-while-revalidate=300')

  const tz = process.env.CALENDAR_TIMEZONE || TZ
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz })

  let bookings = []
  try {
    bookings = await getBookingsForDate(today)
    // Enrich with canonical HubSpot tank counts so the initial render
    // matches what rounds shows (no flash of incorrect title-derived counts).
    const emails = [...new Set(bookings.map((b) => b.email).filter(Boolean).map((e) => e.toLowerCase()))]
    if (emails.length > 0) {
      try {
        const contactMap = await findContactsByEmails(emails)
        const tanksByEmail = {}
        for (const email of emails) {
          const c = contactMap.get(email)
          if (!c) continue
          const t = tanksForCustomer(c.properties)
          if (t > 0) tanksByEmail[email] = t
        }
        bookings = bookings.map((b) => ({
          ...b,
          hubspotTanks: b.email ? (tanksByEmail[b.email.toLowerCase()] || null) : null,
        }))
      } catch {}
    }
  } catch {}

  return { props: { today, initialBookings: bookings } }
}

function toLocalHM(iso, tz = TZ) {
  if (!iso) return { h: 0, m: 0 }
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(d)
  const h = parseInt(parts.find((p) => p.type === 'hour').value, 10)
  const m = parseInt(parts.find((p) => p.type === 'minute').value, 10)
  return { h: h % 24, m }
}

function fmtTime(iso, tz = TZ) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', '')
}

function fmtDateLong(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function fmtMonth(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'long' })
}

// Assign overlapping events to columns (greedy lane packing).
function layoutEvents(bookings) {
  const events = bookings
    .map((b) => {
      const s = toLocalHM(b.startTime)
      const e = toLocalHM(b.endTime)
      const startMin = s.h * 60 + s.m
      const endMin = (e.h * 60 + e.m) || (startMin + 60)
      return { ...b, startMin, endMin: endMin > startMin ? endMin : startMin + 30 }
    })
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)

  // Group into clusters of overlapping events
  const clusters = []
  let current = null
  for (const ev of events) {
    if (!current || ev.startMin >= current.endMax) {
      current = { events: [], endMax: ev.endMin }
      clusters.push(current)
    }
    current.events.push(ev)
    if (ev.endMin > current.endMax) current.endMax = ev.endMin
  }

  // Within each cluster, assign each event the lowest free column
  const positioned = []
  for (const cluster of clusters) {
    const columns = [] // array of [{endMin}]
    for (const ev of cluster.events) {
      let col = 0
      while (col < columns.length && columns[col] > ev.startMin) col++
      columns[col] = ev.endMin
      ev._col = col
    }
    const cols = columns.length
    for (const ev of cluster.events) {
      positioned.push({ ...ev, _col: ev._col, _cols: cols })
    }
  }
  return positioned
}

function buildWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const dow = d.getDay() // 0 Sun
  const sunday = new Date(d)
  sunday.setDate(d.getDate() - dow)
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(sunday)
    x.setDate(sunday.getDate() + i)
    return x.toLocaleDateString('en-CA')
  })
}

// Build a 6-row × 7-col month grid starting from the Sunday on/before the 1st.
function buildMonthGrid(dateStr) {
  const ref = new Date(dateStr + 'T12:00:00')
  const first = new Date(ref.getFullYear(), ref.getMonth(), 1)
  const startDow = first.getDay()
  const start = new Date(first)
  start.setDate(first.getDate() - startDow)
  return Array.from({ length: 42 }, (_, i) => {
    const x = new Date(start)
    x.setDate(start.getDate() + i)
    return x.toLocaleDateString('en-CA')
  })
}

// Extract a tank count from event titles like "One - 20 pound CO2 Tank Exchange"
// or "CO2 Tank Exchange - 4 Tanks". Returns null if not a tank exchange.
//
// Word form is checked BEFORE digit form because Cal.com titles like
// "One - 20 pound CO2 Tank Exchange" contain a digit ("20") that refers to
// the tank weight, not the count — matching the digit form first gave us 20.
function tankCountFromTitle(title) {
  if (!title) return null
  const t = title.toLowerCase()
  if (!/tank.*exchange|exchange.*tank|tank.*refill/.test(t)) return null

  // Word form first: "Two -20 pound...", "Ten Tank Service"
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
  for (const [w, n] of Object.entries(words)) {
    if (new RegExp(`\\b${w}\\b.*tank`).test(t)) return n
  }
  // Digit form: must be adjacent to "tank", not separated by "pound" etc.
  // Also require a space or string-start BEFORE the digit so we don't grab
  // the 2 out of "co2 tank" (which was matching "2 tank" as 2 tanks).
  const dm = t.match(/(?:^|\s)(\d+)\s*(?:-|−)?\s*(?:co2\s*)?tanks?\b/)
  if (dm) return parseInt(dm[1], 10)
  return 1
}

// Canonical tank count for a booking — prefers HubSpot tank_count (same
// source rounds uses via tanksForCustomer), falls back to the title regex
// only when the booking has no HubSpot match. Keeps calendar / rounds /
// tank-calendar / daily-route email in agreement.
function tanksFor(ev) {
  if (ev?.hubspotTanks > 0) return ev.hubspotTanks
  return tankCountFromTitle(ev?.title)
}

export default function CalendarPage({ today, initialBookings }) {
  const router = useRouter()
  const [date, setDate] = useState(today)
  const [bookings, setBookings] = useState(initialBookings)
  const [loading, setLoading] = useState(false)

  // Translate a click on the empty day-grid background into a YYYY-MM-DDTHH:mm
  // value and hand off to /admin/booking with the time prefilled. Rounds to
  // the nearest 15 minutes so dropdowns aren't full of weird offsets.
  function handleGridClick(e) {
    // Ignore clicks that originated on an event (they have their own handler).
    if (e.target.closest('.event')) return
    const rect = e.currentTarget.getBoundingClientRect()
    const yPx = e.clientY - rect.top
    const totalMin = yPx / PX_PER_MIN
    const minutesFromDayStart = Math.max(0, Math.round(totalMin / 15) * 15)
    const hour = DAY_START_HOUR + Math.floor(minutesFromDayStart / 60)
    const minute = minutesFromDayStart % 60
    if (hour < DAY_START_HOUR || hour >= DAY_END_HOUR + 1) return
    const hh = String(hour).padStart(2, '0')
    const mm = String(minute).padStart(2, '0')
    const startLocal = `${date}T${hh}:${mm}`
    router.push(`/admin/booking?start=${encodeURIComponent(startLocal)}`)
  }
  const [picker, setPicker] = useState(false)
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [details, setDetails] = useState(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === 'undefined') return 'agenda'
    return window.localStorage.getItem('gg.calendar.viewMode') || 'agenda'
  })
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem('gg.calendar.viewMode', viewMode)
  }, [viewMode])

  useEffect(() => {
    if (!selectedEventId) { setDetails(null); return }
    setDetailsLoading(true)
    fetch(`/api/admin/appointment-details?eventId=${encodeURIComponent(selectedEventId)}`)
      .then((r) => r.json())
      .then(setDetails)
      .catch(() => setDetails({ error: 'Failed to load' }))
      .finally(() => setDetailsLoading(false))
  }, [selectedEventId])

  // Multi-day fetch buffer for week/month views: { 'YYYY-MM-DD': bookings[] }
  const [rangeBookings, setRangeBookings] = useState({})
  const week = useMemo(() => buildWeek(date), [date])
  const monthGrid = useMemo(() => buildMonthGrid(date), [date])

  useEffect(() => {
    if (viewMode === 'agenda' || viewMode === 'day') {
      if (date === today && bookings === initialBookings) return // initial
      setLoading(true)
      fetch(`/api/admin/bookings?date=${date}`)
        .then((r) => r.json())
        .then((d) => setBookings(d.bookings || []))
        .catch(() => setBookings([]))
        .finally(() => setLoading(false))
      return
    }
    // Week / Month: fetch all days in the visible range in parallel.
    const days = viewMode === 'week' ? week : monthGrid
    setLoading(true)
    Promise.all(days.map((d) =>
      fetch(`/api/admin/bookings?date=${d}`).then((r) => r.json()).then((j) => [d, j.bookings || []]).catch(() => [d, []])
    )).then((pairs) => {
      const map = {}
      for (const [d, b] of pairs) map[d] = b
      setRangeBookings(map)
    }).finally(() => setLoading(false))
  }, [date, viewMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const positioned = useMemo(() => layoutEvents(bookings), [bookings])

  const totalMin = (DAY_END_HOUR - DAY_START_HOUR) * 60
  const gridHeight = totalMin * PX_PER_MIN
  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i)
  const today_ = today

  return (
    <>
      <Head><title>Calendar · GreenGuard Admin</title></Head>
      <PortalLayout isAdmin>
        <style jsx>{`
          .hdr-month { display:flex; align-items:center; gap:6px; font-size:1.4rem; font-weight:900; cursor:pointer; color:#d4e6ca; }
          .week-strip { display:grid; grid-template-columns:repeat(7,1fr); gap:4px; margin:18px 0 12px; }
          .day-cell { display:flex; flex-direction:column; align-items:center; gap:6px; padding:8px 0; border-radius:10px; cursor:pointer; user-select:none; }
          .day-cell.selected { background:#7dffaa; color:#0d1a10; }
          .day-cell.today { outline:1px dashed rgba(125,255,170,0.5); outline-offset:-2px; }
          .day-cell:not(.selected):hover { background:rgba(125,255,170,0.06); }
          .dow { font-size:0.7rem; font-weight:800; letter-spacing:0.08em; color:rgba(212,230,202,0.4); text-transform:uppercase; }
          .day-cell.selected .dow { color:rgba(13,26,16,0.6); }
          .dom { font-size:1.05rem; font-weight:800; }
          .day-title { text-align:center; padding:14px 0 6px; border-top:1px solid rgba(122,171,130,0.15); margin-top:4px; }
          .day-title-name { font-size:1rem; font-weight:800; color:#d4e6ca; }
          .day-title-sub { font-size:0.78rem; color:rgba(212,230,202,0.5); margin-top:2px; }
          .grid-wrap { position:relative; margin-top:6px; padding-left:54px; padding-right:8px; }
          .hour-row { position:absolute; left:0; right:8px; border-top:1px solid rgba(122,171,130,0.12); }
          .hour-label { position:absolute; left:0; width:46px; transform:translateY(-50%); font-size:0.7rem; font-weight:800; color:rgba(212,230,202,0.4); text-align:right; padding-right:8px; }
          .now-line { position:absolute; left:54px; right:8px; height:2px; background:#ff5252; z-index:5; pointer-events:none; }
          .now-dot { position:absolute; left:-5px; top:-4px; width:10px; height:10px; border-radius:50%; background:#ff5252; }
          .event-area { position:relative; }
          .event { position:absolute; box-sizing:border-box; padding:8px 10px; border-radius:10px; background:rgba(189,154,255,0.18); border:1px solid rgba(189,154,255,0.45); color:#e6dcff; font-size:0.82rem; line-height:1.25; overflow:hidden; cursor:pointer; transition:transform 0.08s; }
          .event:hover { transform:translateY(-1px); background:rgba(189,154,255,0.28); }
          .event-name { font-weight:800; color:#fff; margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .event-title { color:rgba(230,220,255,0.85); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:0.78rem; }
          .event-time { color:rgba(230,220,255,0.65); font-size:0.72rem; margin-top:2px; }
          .empty { text-align:center; color:rgba(212,230,202,0.45); padding:40px 16px; font-size:0.9rem; }
          .fab { position:fixed; right:24px; bottom:96px; width:56px; height:56px; border-radius:50%; background:#0d1a10; color:#7dffaa; font-size:1.6rem; border:1px solid rgba(125,255,170,0.4); display:flex; align-items:center; justify-content:center; box-shadow:0 6px 20px rgba(0,0,0,0.4); cursor:pointer; z-index:10; text-decoration:none; }
        `}</style>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap: 8 }}>
          <button onClick={() => setPicker(!picker)} style={{ background:'transparent', border:'none', padding:0 }} className="hdr-month">
            <span>{fmtMonth(date)}</span>
            <span style={{ fontSize:'0.9rem', opacity:0.7 }}>▾</span>
          </button>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <button onClick={() => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() - 7); setDate(d.toLocaleDateString('en-CA')) }}
              aria-label="Previous week"
              style={{ background:'transparent', border:'1px solid rgba(122,171,130,0.25)', color:'rgba(212,230,202,0.7)', padding:'6px 10px', borderRadius:6, fontWeight:800, fontSize:'0.85rem', cursor:'pointer', minWidth:32 }}>‹</button>
            <button onClick={() => setDate(today_)} style={{ background:'transparent', border:'1px solid rgba(125,255,170,0.3)', color:'#7dffaa', padding:'6px 14px', borderRadius:6, fontWeight:800, fontSize:'0.78rem', cursor:'pointer' }}>
              Today
            </button>
            <div style={{ display: 'flex', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 6, overflow: 'hidden' }}>
              {['day', 'agenda', 'week', 'month'].map((v, i) => (
                <button key={v} onClick={() => setViewMode(v)}
                  title={v[0].toUpperCase() + v.slice(1)}
                  style={{ background: viewMode === v ? '#7dffaa' : 'transparent', color: viewMode === v ? '#0d1a10' : 'rgba(212,230,202,0.6)', border: 'none', borderLeft: i === 0 ? 'none' : '1px solid rgba(122,171,130,0.25)', padding: '6px 10px', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'Nunito Sans, sans-serif', textTransform: 'capitalize' }}>
                  {v}
                </button>
              ))}
            </div>
            <button onClick={() => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() + 7); setDate(d.toLocaleDateString('en-CA')) }}
              aria-label="Next week"
              style={{ background:'transparent', border:'1px solid rgba(122,171,130,0.25)', color:'rgba(212,230,202,0.7)', padding:'6px 10px', borderRadius:6, fontWeight:800, fontSize:'0.85rem', cursor:'pointer', minWidth:32 }}>›</button>
          </div>
        </div>

        {picker && (
          <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setPicker(false) }}
            style={{ marginTop:10, width:'100%', padding:'10px 14px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(122,171,130,0.25)', borderRadius:8, color:'#d4e6ca', fontSize:'1rem' }} />
        )}

        <div className="week-strip">
          {week.map((d) => {
            const dd = new Date(d + 'T12:00:00')
            const dow = ['S','M','T','W','T','F','S'][dd.getDay()]
            const dom = dd.getDate()
            return (
              <div key={d} className={`day-cell ${d === date ? 'selected' : ''} ${d === today_ ? 'today' : ''}`} onClick={() => setDate(d)}>
                <div className="dow">{dow}</div>
                <div className="dom">{dom}</div>
              </div>
            )
          })}
        </div>

        <div className="day-title">
          <div className="day-title-name">{fmtDateLong(date)}</div>
          <div className="day-title-sub">{loading ? 'Loading…' : `${bookings.length} appointment${bookings.length === 1 ? '' : 's'}`}</div>
        </div>

        {!loading && bookings.length === 0 && viewMode === 'agenda' && (
          <div className="empty">No appointments scheduled.</div>
        )}

        {bookings.length > 0 && (viewMode === 'agenda') && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...bookings].sort((a, b) => new Date(a.startTime) - new Date(b.startTime)).map((ev) => {
              const isSelected = selectedEventId === ev.id
              const tanks = tanksFor(ev)
              return (
                <div key={ev.id} onClick={() => setSelectedEventId(ev.id)}
                  style={{
                    cursor: 'pointer',
                    padding: '14px 16px',
                    borderRadius: 12,
                    background: 'rgba(189,154,255,0.14)',
                    border: `1px solid ${isSelected ? '#c9a84c' : 'rgba(189,154,255,0.35)'}`,
                    color: '#e6dcff',
                    transition: 'transform 0.08s',
                  }}>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {ev.customerName || 'Customer'}
                    {tanks != null && (
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#7dffaa', background: 'rgba(125,255,170,0.12)', border: '1px solid rgba(125,255,170,0.3)', padding: '2px 7px', borderRadius: 4 }}>
                        🛢 {tanks} tank{tanks === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.88rem', color: 'rgba(230,220,255,0.85)', lineHeight: 1.4, marginBottom: 4 }}>
                    {ev.title}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'rgba(230,220,255,0.7)', marginBottom: 4 }}>
                    {fmtTime(ev.startTime)}{ev.endTime ? `–${fmtTime(ev.endTime)}` : ''} · GreenGuard USA
                  </div>
                  {ev.address && (
                    <div style={{ fontSize: '0.82rem', color: 'rgba(230,220,255,0.65)' }}>
                      📍 {ev.address}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {viewMode === 'day' && (
          <div className="grid-wrap" style={{ height: gridHeight }}>
            {hours.map((h) => {
              const top = (h - DAY_START_HOUR) * 60 * PX_PER_MIN
              const label = h === 12 ? 'NOON' : h < 12 ? `${h}AM` : `${h - 12}PM`
              return (
                <div key={h}>
                  <div className="hour-label" style={{ top }}>{label}</div>
                  <div className="hour-row" style={{ top }} />
                </div>
              )
            })}

            <NowLine date={date} today={today_} dayStartHour={DAY_START_HOUR} pxPerMin={PX_PER_MIN} dayEndHour={DAY_END_HOUR} />

            <div className="event-area" onClick={handleGridClick}
                 style={{ position:'absolute', left:0, right:0, top:0, bottom:0, cursor:'crosshair' }}
                 title="Click an empty time slot to start a new booking">
              {positioned.map((ev) => {
                const top = (ev.startMin - DAY_START_HOUR * 60) * PX_PER_MIN
                const height = Math.max(28, (ev.endMin - ev.startMin) * PX_PER_MIN - 2)
                const colWidth = `calc((100% - ${(ev._cols - 1) * 4}px) / ${ev._cols})`
                const left = `calc((${colWidth} + 4px) * ${ev._col})`
                const tanks = tanksFor(ev)
                return (
                  <div key={ev.id} className="event"
                    style={{ top, left, width: colWidth, height, ...(selectedEventId === ev.id ? { outline: '2px solid #c9a84c', outlineOffset: 1 } : {}) }}
                    title={`${ev.customerName} · ${ev.title}\n${fmtTime(ev.startTime)}–${fmtTime(ev.endTime)}\n${ev.address || ''}`}
                    onClick={() => setSelectedEventId(ev.id)}>
                    <div className="event-name">
                      {ev.customerName || 'Customer'}
                      {tanks != null && <span style={{ marginLeft: 6, fontSize: '0.68rem', color: '#7dffaa' }}>🛢{tanks}</span>}
                    </div>
                    <div className="event-title">{ev.title}</div>
                    <div className="event-time">{fmtTime(ev.startTime)}–{fmtTime(ev.endTime)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {viewMode === 'week' && (
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {week.map((d) => {
              const dd = new Date(d + 'T12:00:00')
              const dayBookings = (rangeBookings[d] || []).slice().sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
              const dayTanks = dayBookings.reduce((s, ev) => s + (tanksFor(ev) || 0), 0)
              const isToday = d === today_
              return (
                <div key={d} style={{ minHeight: 200, padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `1px solid ${isToday ? 'rgba(125,255,170,0.4)' : 'rgba(122,171,130,0.12)'}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: isToday ? '#7dffaa' : 'rgba(212,230,202,0.55)' }}>
                      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dd.getDay()]} {dd.getDate()}
                    </div>
                    {dayTanks > 0 && <span style={{ fontSize: '0.62rem', color: '#7dffaa', fontWeight: 800 }}>🛢{dayTanks}</span>}
                  </div>
                  {dayBookings.length === 0 && <div style={{ fontSize: '0.7rem', color: 'rgba(212,230,202,0.2)', textAlign: 'center', padding: '20px 0' }}>—</div>}
                  {dayBookings.map((ev) => {
                    const tanks = tanksFor(ev)
                    return (
                      <div key={ev.id} onClick={() => setSelectedEventId(ev.id)}
                        style={{ padding: '4px 6px', borderRadius: 4, background: 'rgba(189,154,255,0.16)', border: '1px solid rgba(189,154,255,0.3)', color: '#e6dcff', fontSize: '0.7rem', cursor: 'pointer', lineHeight: 1.3 }}>
                        <div style={{ fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {fmtTime(ev.startTime)} {ev.customerName?.split(' ')[0] || '?'}
                          {tanks != null && <span style={{ marginLeft: 4, color: '#7dffaa' }}>🛢{tanks}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}

        {viewMode === 'month' && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, fontSize: '0.7rem', fontWeight: 800, color: 'rgba(212,230,202,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => <div key={d} style={{ textAlign: 'center', padding: '4px 0' }}>{d}</div>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
              {monthGrid.map((d) => {
                const dd = new Date(d + 'T12:00:00')
                const inMonth = dd.getMonth() === new Date(date + 'T12:00:00').getMonth()
                const isToday = d === today_
                const dayBookings = rangeBookings[d] || []
                const dayTanks = dayBookings.reduce((s, ev) => s + (tanksFor(ev) || 0), 0)
                return (
                  <div key={d} onClick={() => { setDate(d); setViewMode('day') }}
                    style={{ minHeight: 78, padding: 5, borderRadius: 5, background: inMonth ? 'rgba(255,255,255,0.02)' : 'transparent', border: `1px solid ${isToday ? 'rgba(125,255,170,0.45)' : 'rgba(122,171,130,0.08)'}`, cursor: 'pointer', opacity: inMonth ? 1 : 0.35 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: isToday ? 900 : 700, color: isToday ? '#7dffaa' : 'rgba(212,230,202,0.7)' }}>{dd.getDate()}</div>
                      {dayTanks > 0 && <span style={{ fontSize: '0.6rem', color: '#7dffaa', fontWeight: 800 }}>🛢{dayTanks}</span>}
                    </div>
                    {dayBookings.slice(0, 3).map((ev) => (
                      <div key={ev.id} style={{ fontSize: '0.62rem', color: '#e6dcff', background: 'rgba(189,154,255,0.16)', borderRadius: 3, padding: '1px 4px', marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {fmtTime(ev.startTime)} {ev.customerName?.split(' ')[0] || '?'}
                      </div>
                    ))}
                    {dayBookings.length > 3 && (
                      <div style={{ fontSize: '0.6rem', color: 'rgba(212,230,202,0.45)', textAlign: 'center', marginTop: 1 }}>+{dayBookings.length - 3} more</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {date >= today_ && (
          <Link href="/admin/booking" className="fab" title="New booking">+</Link>
        )}
        {selectedEventId && (
          <DetailDock details={details} loading={detailsLoading}
            onClose={() => setSelectedEventId(null)} />
        )}
      </PortalLayout>
    </>
  )
}

function EventNotesSection({ eventId, customerEmail }) {
  const [notes, setNotes] = useState([])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function load() {
    try {
      const res = await fetch(`/api/admin/event-notes?eventId=${encodeURIComponent(eventId)}`)
      const j = await res.json()
      if (res.ok) setNotes(j.notes || [])
    } catch { /* silent */ }
  }
  useEffect(() => { load() }, [eventId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!body.trim()) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/admin/event-notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, customerEmail, body }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setBody(''); setMsg({ ok: true, text: 'Saved.' })
      load()
      setTimeout(() => setMsg(null), 2000)
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    } finally { setBusy(false) }
  }

  async function del(id) {
    if (!window.confirm('Delete this note?')) return
    await fetch(`/api/admin/event-notes?id=${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div style={{ marginBottom: 14, padding: 12, background: 'rgba(125,255,170,0.04)', border: '1px solid rgba(125,255,170,0.18)', borderRadius: 6 }}>
      <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7dffaa', marginBottom: 8 }}>
        This appointment&apos;s notes
      </div>
      {notes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {notes.map((n) => (
            <div key={n.id} style={{ padding: '7px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 4, fontSize: '0.78rem', color: 'rgba(212,230,202,0.85)', position: 'relative' }}>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{n.body}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span style={{ fontSize: '0.66rem', color: 'rgba(212,230,202,0.4)' }}>
                  {n.author_email?.split('@')[0]} · {new Date(n.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ })}
                </span>
                <button onClick={() => del(n.id)} title="Delete"
                  style={{ background: 'none', border: 'none', color: 'rgba(255,128,128,0.55)', cursor: 'pointer', fontSize: '0.72rem', padding: 0, fontFamily: 'inherit' }}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)}
        placeholder="Gate code today, side gate only, customer requested AM…"
        style={{ width: '100%', padding: '7px 9px', borderRadius: 5, border: '1px solid rgba(122,171,130,0.25)', background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.82rem', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
        <button onClick={save} disabled={busy || !body.trim()}
          style={{ padding: '5px 12px', borderRadius: 4, border: 'none', background: '#7dffaa', color: '#0d1a10', fontWeight: 800, fontSize: '0.76rem', cursor: busy || !body.trim() ? 'not-allowed' : 'pointer', opacity: busy || !body.trim() ? 0.5 : 1, fontFamily: 'Nunito Sans, sans-serif' }}>
          {busy ? 'Saving…' : 'Add'}
        </button>
        {msg && <span style={{ fontSize: '0.74rem', color: msg.ok ? '#7dffaa' : '#ff8080' }}>{msg.text}</span>}
      </div>
    </div>
  )
}

function DockNoteComposer({ email, hsContactId }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  async function save() {
    if (!body.trim()) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/admin/add-note', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, contactId: hsContactId, body }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setBody(''); setMsg({ ok: true, text: 'Saved to HubSpot.' })
      setTimeout(() => setMsg(null), 2500)
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    } finally { setBusy(false) }
  }
  return (
    <div>
      <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)}
        placeholder="Quick note about this customer…"
        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(122,171,130,0.25)', background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.85rem', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
        <button onClick={save} disabled={busy || !body.trim() || (!email && !hsContactId)}
          style={{ padding: '6px 14px', borderRadius: 5, border: 'none', background: '#7dffaa', color: '#0d1a10', fontWeight: 800, fontSize: '0.78rem', cursor: busy || !body.trim() ? 'not-allowed' : 'pointer', opacity: busy || !body.trim() ? 0.5 : 1, fontFamily: 'Nunito Sans, sans-serif' }}>
          {busy ? 'Saving…' : 'Save note'}
        </button>
        {!email && !hsContactId && <span style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.4)' }}>No HubSpot contact found</span>}
        {msg && <span style={{ fontSize: '0.78rem', color: msg.ok ? '#7dffaa' : '#ff8080' }}>{msg.text}</span>}
      </div>
    </div>
  )
}

function NowLine({ date, today, dayStartHour, dayEndHour, pxPerMin }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(i)
  }, [])
  if (date !== today) return null
  const { h, m } = toLocalHM(new Date().toISOString())
  const min = h * 60 + m
  if (min < dayStartHour * 60 || min > dayEndHour * 60) return null
  const top = (min - dayStartHour * 60) * pxPerMin
  return <div className="now-line" style={{ top }}><div className="now-dot" /></div>
}

function fmtDockDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ })
}
function fmtDockTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ })
}

function cleanDescription(desc) {
  if (!desc) return ''
  // Strip Acuity/Cal.com noise lines so notes are readable
  return desc
    .split(/\r?\n/)
    .filter((l) => !/^(Change Appointment:|Please use Acuity|AcuityID=|\(created by Acuity|Calendar:|Name:|Phone:|Email:|Price:|Location|Address|====|Rental Terms)/i.test(l.trim()))
    .join('\n')
    .trim()
}

function DetailDock({ details, loading, onClose }) {
  const d = details || {}
  const ev = d.event || {}
  const p = d.contact?.properties || {}
  const customerName = [p.firstname, p.lastname].filter(Boolean).join(' ') || ev.summary?.split(':')[0] || 'Unknown'
  const phone = p.phone || ''
  const address = p.address || ev.location || ''
  const email = d.email || p.email || ''
  const notes = cleanDescription(ev.description)
  const billingContact = p.billing_contact_name
  // Parse Cal.com booking UID from reschedule URL (last path segment).
  const bookingUid = (ev.rescheduleUrl || '').match(/\/(?:reschedule|booking)\/([^/?#]+)/)?.[1] || null

  const [editMode, setEditMode] = useState(false)
  const [newStart, setNewStart] = useState(ev.start ? new Date(ev.start).toISOString().slice(0, 16) : '')
  const [editBusy, setEditBusy] = useState(false)
  const [editMsg, setEditMsg] = useState(null)

  async function saveReschedule() {
    if (!newStart) return
    setEditBusy(true); setEditMsg(null)
    try {
      const res = await fetch('/api/admin/reschedule-booking', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingUid, eventId: ev.id, newStartIso: new Date(newStart).toISOString() }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Reschedule failed')
      setEditMsg({ kind: 'ok', text: 'Rescheduled. Refresh to see updated times.' })
      setEditMode(false)
    } catch (err) {
      setEditMsg({ kind: 'err', text: err.message })
    } finally { setEditBusy(false) }
  }

  async function doCancel() {
    if (!bookingUid) {
      window.alert('Legacy Acuity event — cancel manually in Google Calendar.')
      return
    }
    if (!window.confirm(`Cancel ${customerName}'s appointment?`)) return
    setEditBusy(true); setEditMsg(null)
    try {
      const res = await fetch('/api/admin/cancel-booking', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: bookingUid, customerEmail: email, reason: 'Cancelled by admin', action: 'cancel' }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Cancel failed')
      setEditMsg({ kind: 'ok', text: 'Cancelled. Refresh to update.' })
    } catch (err) {
      setEditMsg({ kind: 'err', text: err.message })
    } finally { setEditBusy(false) }
  }

  return (
    <div style={{
      position: 'fixed', right: 0, top: 60, bottom: 0, width: 'min(420px, 95vw)',
      background: '#0d1a10', borderLeft: '1px solid rgba(122,171,130,0.25)',
      boxShadow: '-4px 0 24px rgba(0,0,0,0.4)', zIndex: 50, overflow: 'auto',
      color: '#d4e6ca', fontFamily: 'Nunito Sans, sans-serif',
    }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(122,171,130,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#0d1a10', zIndex: 1 }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.45)' }}>Appointment Details</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(212,230,202,0.5)', cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1, padding: 0 }}>×</button>
      </div>

      {loading && <div style={{ padding: 20, color: 'rgba(212,230,202,0.5)', fontSize: '0.85rem' }}>Loading…</div>}
      {!loading && d.error && <div style={{ padding: 20, color: '#ff8080', fontSize: '0.85rem' }}>{d.error}</div>}
      {!loading && !d.error && (
        <div style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: 2 }}>{customerName}</div>
          {billingContact && (
            <div style={{ fontSize: '0.7rem', color: '#c9a84c', fontWeight: 700, background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', padding: '2px 8px', borderRadius: 4, display: 'inline-block', marginBottom: 6 }}>
              Bill to: {billingContact}
            </div>
          )}

          <div style={{ marginTop: 10, marginBottom: 14, padding: '10px 12px', background: 'rgba(125,255,170,0.05)', border: '1px solid rgba(125,255,170,0.15)', borderRadius: 6 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>{ev.summary?.replace(/\s*\(GreenGuard USA\)\s*$/, '') || '—'}</div>
            <div style={{ fontSize: '0.78rem', color: '#7dffaa', fontWeight: 700 }}>{fmtDockDate(ev.start)} · {fmtDockTime(ev.start)}{ev.end ? ` – ${fmtDockTime(ev.end)}` : ''}</div>
          </div>

          {(phone || email || address) && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', marginBottom: 6 }}>Customer</div>
              {phone && <div style={{ fontSize: '0.85rem', marginBottom: 3 }}>📞 <a href={`tel:${phone}`} style={{ color: '#7dffaa', textDecoration: 'none' }}>{phone}</a></div>}
              {email && <div style={{ fontSize: '0.85rem', marginBottom: 3 }}>✉ <a href={`mailto:${email}`} style={{ color: '#7dffaa', textDecoration: 'none' }}>{email}</a></div>}
              {address && (
                <div style={{ fontSize: '0.85rem', marginBottom: 3 }}>
                  📍 <a href={`https://maps.apple.com/?daddr=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer" style={{ color: '#7dffaa', textDecoration: 'none' }}>{address}</a>
                </div>
              )}
            </div>
          )}

          {(p.system_type || p.trap_count || p.tank_count || p.recurring_addons) && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', marginBottom: 6 }}>Service Profile</div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(212,230,202,0.75)' }}>
                {p.system_type && <div>System: <strong>{p.system_type}</strong></div>}
                {p.trap_count && <div>Traps: <strong>{p.trap_count}</strong></div>}
                {p.tank_count && <div>Tanks: <strong>{p.tank_count}</strong></div>}
                {p.recurring_addons && <div>Recurring: <strong>{p.recurring_addons}</strong></div>}
              </div>
            </div>
          )}

          {/* Property notes — gate code, pets, access, special instructions */}
          {(p.gate_code || p.access_notes || p.pets_on_property || p.special_instructions) && (
            <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', marginBottom: 2 }}>Property Notes</div>
              {p.pets_on_property && (
                <div style={{ fontSize: '0.78rem', padding: '6px 10px', background: 'rgba(255,160,80,0.08)', border: '1px solid rgba(255,160,80,0.3)', borderRadius: 6, color: '#ffb060' }}>
                  🐕 <strong>Pets:</strong> {p.pets_on_property}
                </div>
              )}
              {p.gate_code && (
                <div style={{ fontSize: '0.78rem', padding: '6px 10px', background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 6, color: '#c9a84c' }}>
                  🔑 <strong>Gate code:</strong> {p.gate_code}
                </div>
              )}
              {p.access_notes && (
                <div style={{ fontSize: '0.78rem', padding: '6px 10px', background: 'rgba(91,196,255,0.07)', border: '1px solid rgba(91,196,255,0.25)', borderRadius: 6, color: '#5bc4ff' }}>
                  🚪 <strong>Access:</strong> {p.access_notes}
                </div>
              )}
              {p.special_instructions && (
                <div style={{ fontSize: '0.78rem', padding: '6px 10px', background: 'rgba(125,255,170,0.06)', border: '1px solid rgba(125,255,170,0.25)', borderRadius: 6, color: '#7dffaa' }}>
                  📝 <strong>Notes:</strong> {p.special_instructions}
                </div>
              )}
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', marginBottom: 6 }}>Appointment History</div>
            <div style={{ fontSize: '0.8rem', color: 'rgba(212,230,202,0.65)' }}>
              <div>Last visit: <strong style={{ color: '#d4e6ca' }}>{d.last ? fmtDockDate(d.last.start) : '—'}</strong></div>
              <div>Next visit: <strong style={{ color: '#d4e6ca' }}>{d.next ? fmtDockDate(d.next.start) : '—'}</strong></div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.4)', marginTop: 2 }}>Total appointments: {d.totalAppointments || 0}</div>
            </div>
          </div>

          {notes && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', marginBottom: 6 }}>Notes</div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(212,230,202,0.7)', whiteSpace: 'pre-wrap' }}>{notes}</div>
            </div>
          )}

          <EventNotesSection eventId={ev.id} customerEmail={email} />

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', marginBottom: 6 }}>Customer note (HubSpot timeline)</div>
            <DockNoteComposer email={email} hsContactId={d.contact?.id} />
          </div>

          {ev.isLegacyAcuity && (
            <div style={{ marginBottom: 12, padding: '8px 10px', background: 'rgba(255,160,80,0.08)', border: '1px solid rgba(255,160,80,0.25)', borderRadius: 6, fontSize: '0.72rem', color: '#ffb060' }}>
              ⚠ Legacy Acuity booking. Use Cal.com or Google Calendar to reschedule going forward.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
            {!editMode && (
              <button onClick={() => setEditMode(true)} disabled={editBusy}
                style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(201,168,76,0.4)', background: 'rgba(201,168,76,0.08)', color: '#c9a84c', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 800, fontFamily: 'Nunito Sans, sans-serif' }}>
                ✎ Edit appointment time
              </button>
            )}
            {editMode && (
              <div style={{ padding: 10, borderRadius: 6, border: '1px solid rgba(201,168,76,0.4)', background: 'rgba(201,168,76,0.05)' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#c9a84c', marginBottom: 6 }}>New start time (Central)</div>
                <input type="datetime-local" value={newStart} onChange={(e) => setNewStart(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 5, border: '1px solid rgba(122,171,130,0.3)', background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.85rem', fontFamily: 'Nunito Sans, sans-serif', marginBottom: 8 }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={saveReschedule} disabled={editBusy || !newStart}
                    style={{ flex: 1, padding: '7px 10px', borderRadius: 5, border: 'none', background: '#c9a84c', color: '#0d1a10', cursor: editBusy ? 'wait' : 'pointer', fontWeight: 900, fontSize: '0.82rem', fontFamily: 'Nunito Sans, sans-serif' }}>
                    {editBusy ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => { setEditMode(false); setEditMsg(null) }} disabled={editBusy}
                    style={{ padding: '7px 12px', borderRadius: 5, border: '1px solid rgba(122,171,130,0.3)', background: 'transparent', color: 'rgba(212,230,202,0.6)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, fontFamily: 'Nunito Sans, sans-serif' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <button onClick={doCancel} disabled={editBusy}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(255,128,128,0.35)', background: 'rgba(255,128,128,0.05)', color: '#ff8080', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 800, fontFamily: 'Nunito Sans, sans-serif' }}>
              ✕ Cancel appointment
            </button>
            {editMsg && (
              <div style={{ padding: '6px 10px', borderRadius: 4, fontSize: '0.78rem', color: editMsg.kind === 'ok' ? '#7dffaa' : '#ff8080', background: editMsg.kind === 'ok' ? 'rgba(125,255,170,0.08)' : 'rgba(255,128,128,0.08)' }}>
                {editMsg.text}
              </div>
            )}
            {ev.htmlLink && (
              <a href={ev.htmlLink} target="_blank" rel="noopener noreferrer"
                style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(91,196,255,0.3)', color: '#5bc4ff', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 700, textAlign: 'center' }}>
                Open in Google Calendar ↗
              </a>
            )}
            {ev.rescheduleUrl && !ev.isLegacyAcuity && (
              <a href={ev.rescheduleUrl} target="_blank" rel="noopener noreferrer"
                style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(125,255,170,0.3)', color: '#7dffaa', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 700, textAlign: 'center' }}>
                Customer self-reschedule link ↗
              </a>
            )}
            {email && (
              <Link href={`/admin/rounds?date=${(ev.start || '').slice(0,10)}&email=${encodeURIComponent(email)}`}
                style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(201,168,76,0.3)', color: '#c9a84c', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 700, textAlign: 'center' }}>
                Open in Rounds →
              </Link>
            )}
            {d.contact?.id && (
              <a href={`https://app.hubspot.com/contacts/0/contact/${d.contact.id}`} target="_blank" rel="noopener noreferrer"
                style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(122,171,130,0.25)', color: 'rgba(212,230,202,0.7)', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 700, textAlign: 'center' }}>
                Open in HubSpot ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
