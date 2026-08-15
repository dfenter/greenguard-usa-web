import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import DetailDock from '../../components/AppointmentDetailDock'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'
import { getBookingsForDate } from '../../lib/gcal'
import { findContactsByEmails, tanksForCustomer } from '../../lib/hubspot'
import { bookingTanks } from '../../lib/tank-count'

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
  let gcalError = null
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
  } catch (err) {
    gcalError = err.message || 'Google Calendar connection failed'
    console.error('[calendar] GCal error:', err)
  }

  return { props: { today, initialBookings: bookings, gcalError } }
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

function addDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  return d.toLocaleDateString('en-CA')
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

// Canonical tank count for a booking — prefers HubSpot tank_count (same
// source rounds uses via tanksForCustomer), falls back to the title regex
// only when the booking has no HubSpot match. Lives in lib/tank-count.js so
// calendar / home / tech / rounds / tank-calendar all count the same way.
function tanksFor(ev) {
  return bookingTanks(ev?.hubspotTanks, ev?.title)
}

export default function CalendarPage({ today, initialBookings, gcalError = null }) {
  const router = useRouter()
  const [date, setDate] = useState(() => {
    const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('date') : null
    return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : today
  })
  const [bookings, setBookings] = useState(initialBookings)
  const [loading, setLoading] = useState(false)
  const [calendarError, setCalendarError] = useState(gcalError)
  const [retryNonce, setRetryNonce] = useState(0)

  // Translate a click on the empty day-grid background into a YYYY-MM-DDTHH:mm
  // value and hand off to /admin/booking with the time prefilled. Rounds to
  // the nearest 15 minutes so dropdowns aren't full of weird offsets.
  const isWeekend = (d) => { const day = new Date(d + 'T12:00:00').getDay(); return day === 0 || day === 6 }

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
    const qv = new URLSearchParams(window.location.search).get('view')
    if (qv === 'week' || qv === 'month' || qv === 'agenda') return qv
    if (qv === 'day') return 'agenda' // day view retired from the toggle; old links land on Daily
    const stored = window.localStorage.getItem('gg.calendar.viewMode')
    return ['agenda', 'week', 'month'].includes(stored) ? stored : 'agenda'
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
      if (date === today && bookings === initialBookings && !gcalError && retryNonce === 0) return // initial
      setLoading(true)
      fetch(`/api/admin/bookings?date=${date}`)
        .then((r) => r.json())
        .then((d) => {
          setBookings(d.bookings || [])
          setCalendarError(null)
        })
        .catch((err) => {
          setBookings([])
          setCalendarError(err.message || 'Google Calendar connection failed')
        })
        .finally(() => setLoading(false))
      return
    }
    // Week / Month: one range request for the visible window.
    const days = viewMode === 'week' ? week : monthGrid
    const start = days[0]
    const end = addDay(days[days.length - 1])
    setLoading(true)
    fetch(`/api/admin/bookings?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((j) => {
      const map = {}
      for (const booking of (j.bookings || [])) {
        const day = booking.dateStr || new Date(booking.startTime).toLocaleDateString('en-CA', { timeZone: TZ })
        if (!map[day]) map[day] = []
        map[day].push(booking)
      }
      setRangeBookings(map)
      setCalendarError(null)
    })
      .catch((err) => { setRangeBookings({}); setCalendarError(err.message || 'Google Calendar connection failed') })
      .finally(() => setLoading(false))
  }, [date, viewMode, gcalError, retryNonce]) // eslint-disable-line react-hooks/exhaustive-deps

  const positioned = useMemo(() => layoutEvents(bookings), [bookings])

  // Chronologically ordered stops for the day — shared by the agenda render
  // and the travel-time calculation so both use the same sequence.
  const sortedBookings = useMemo(
    () => [...bookings].sort((a, b) => new Date(a.startTime) - new Date(b.startTime)),
    [bookings]
  )

  // Drive distance + time for each leg between consecutive addressed stops.
  // Keyed by the destination booking id (the leg that arrives at that stop).
  const [legs, setLegs] = useState({})
  useEffect(() => {
    if (viewMode !== 'agenda' && viewMode !== 'day') { setLegs({}); return }
    const stops = sortedBookings.filter((b) => b.address)
    if (stops.length < 2) { setLegs({}); return }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/distances', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stops: stops.map((s) => ({ address: s.address })) }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const entries = {}
        const used = new Set()
        for (const leg of (data.legs || [])) {
          const index = stops.findIndex((s, i) => !used.has(i) && s.address.trim() === leg.from && stops[i + 1]?.address.trim() === leg.to)
          if (index >= 0) {
            used.add(index)
            entries[stops[index + 1].id] = leg
          }
        }
        if (!cancelled) setLegs(entries)
      } catch {
        if (!cancelled) setLegs({})
      }
    })()
    return () => { cancelled = true }
  }, [sortedBookings, viewMode])

  const driveTotals = useMemo(() => {
    const vals = Object.values(legs)
    if (!vals.length) return null
    const miles = vals.reduce((s, l) => s + (parseFloat(l.miles) || 0), 0)
    return { miles: miles.toFixed(1) }
  }, [legs])

  // Driving distance from the tech's CURRENT location to each stop, refreshed
  // on demand via the "My Distance" button. Keyed by booking id.
  const [myDistances, setMyDistances] = useState({})
  const [myDistLoading, setMyDistLoading] = useState(false)
  function refreshMyDistance() {
    const stops = sortedBookings.filter((b) => b.address)
    if (!stops.length || !navigator.geolocation) return
    setMyDistLoading(true)
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const origin = `${pos.coords.latitude},${pos.coords.longitude}`
      try {
        const res = await fetch('/api/admin/distances', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ origin, addresses: stops.map((s) => ({ id: s.id, address: s.address })) }),
        })
        setMyDistances(await res.json())
      } catch {}
      setMyDistLoading(false)
    }, () => setMyDistLoading(false), { enableHighAccuracy: true, timeout: 10000 })
  }

  const totalMin = (DAY_END_HOUR - DAY_START_HOUR) * 60
  const gridHeight = totalMin * PX_PER_MIN
  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i)
  const today_ = today

  return (
    <>
      <Head><title>Calendar · GreenGuard Admin</title></Head>
      <PortalLayout isAdmin topPadding="12px">
        <style jsx>{`
          .hdr-month { display:flex; align-items:center; gap:6px; font-size:1.4rem; font-weight:900; cursor:pointer; color:var(--text-muted); }
          /* Selection area stays pinned below the sticky top nav (76px tall) while
             the page scrolls. Horizontal scrolling is scoped to .week-scroll so this
             never pans off-screen with the week grid. */
          .cal-sticky { position:sticky; top:calc(76px + env(safe-area-inset-top, 0px)); z-index:40; background:var(--bg); padding-bottom:10px; box-shadow:0 8px 10px -10px rgba(0,0,0,0.35); }
          .week-strip { display:grid; grid-template-columns:repeat(7,1fr); gap:4px; margin:12px 0 0; }
          .week-scroll { margin-top:12px; overflow-x:auto; -webkit-overflow-scrolling:touch; }
          /* Sun-first week: slim weekend bookend columns, wide Mon-Fri */
          .week-grid { display:grid; grid-template-columns:minmax(95px, 0.5fr) repeat(5, minmax(195px, 1fr)) minmax(95px, 0.5fr); gap:4px; }
          .day-cell { display:flex; flex-direction:column; align-items:center; gap:6px; padding:8px 0; border-radius:10px; cursor:pointer; user-select:none; }
          .day-cell.selected { background:var(--green); color: var(--text-on-accent); }
          .day-cell.today { outline:1px dashed rgba(var(--green-rgb),0.5); outline-offset:-2px; }
          .day-cell:not(.selected):hover { background:rgba(var(--green-rgb),0.06); }
          .dow { font-size:0.7rem; font-weight:800; letter-spacing:0.08em; color:rgba(var(--text-rgb),0.4); text-transform:uppercase; }
          .day-cell.selected .dow { color:var(--text-on-accent); }
          .dom { font-size:1.05rem; font-weight:800; }
          .day-title { text-align:center; padding:14px 0 6px; border-top:1px solid rgba(var(--border-rgb),0.15); margin-top:4px; }
          .day-title-name { font-size:1rem; font-weight:800; color:var(--text-muted); }
          .day-title-sub { font-size:0.78rem; color:rgba(var(--text-rgb),0.5); margin-top:2px; }
          .grid-wrap { position:relative; margin-top:6px; padding-left:54px; padding-right:8px; }
          .hour-row { position:absolute; left:0; right:8px; border-top:1px solid rgba(var(--border-rgb),0.12); }
          .hour-label { position:absolute; left:0; width:46px; transform:translateY(-50%); font-size:0.7rem; font-weight:800; color:rgba(var(--text-rgb),0.4); text-align:right; padding-right:8px; }
          .now-line { position:absolute; left:54px; right:8px; height:2px; background:var(--danger); z-index:5; pointer-events:none; }
          .now-dot { position:absolute; left:-5px; top:-4px; width:10px; height:10px; border-radius:50%; background:var(--danger); }
          .event-area { position:relative; }
          .event { position:absolute; box-sizing:border-box; padding:8px 10px; border-radius:10px; background:rgba(var(--info-rgb),0.18); border:1px solid rgba(var(--info-rgb),0.45); color:var(--text); font-size:0.82rem; line-height:1.25; overflow:hidden; cursor:pointer; transition:transform 0.08s; }
          .event:hover { transform:translateY(-1px); background:rgba(var(--info-rgb),0.28); }
          .event-name { font-weight:800; color:var(--text); margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .event-title { color:rgba(var(--text-rgb),0.85); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:0.78rem; }
          .event-time { color:rgba(var(--text-rgb),0.65); font-size:0.72rem; margin-top:2px; }
          .empty { text-align:center; color:rgba(var(--text-rgb),0.45); padding:40px 16px; font-size:0.9rem; }
          .fab { position:fixed; right:24px; bottom:96px; width:56px; height:56px; border-radius:50%; background: var(--bg-card); color:var(--green); font-size:1.6rem; border:1px solid rgba(var(--green-rgb),0.4); display:flex; align-items:center; justify-content:center; box-shadow:0 6px 20px rgba(0,0,0,0.4); cursor:pointer; z-index:10; text-decoration:none; }
          .ctrl-row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
          .ctrl-right { display:flex; gap:6px; align-items:center; }
          .view-seg { display:flex; border:1px solid rgba(var(--border-rgb),0.25); border-radius:6; overflow:hidden; }
          .view-btn { background:transparent; color:rgba(var(--text-rgb),0.6); border:none; border-left:1px solid rgba(var(--border-rgb),0.25); padding:6px 10px; font-weight:800; font-size:0.78rem; cursor:pointer; font-family:inherit; text-transform:capitalize; }
          .view-btn:first-child { border-left:none; }
          .view-btn.active { background:var(--green); color: var(--text-on-accent); }
          @media (max-width:430px) {
            .ctrl-right { gap:3px; }
            .view-btn { padding:6px 6px; font-size:0.72rem; }
          }
        `}</style>

        <div className="cal-sticky">
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <div className="ctrl-row">
            <button onClick={() => setPicker(!picker)} style={{ background:'transparent', border:'none', padding:0, flexShrink:0 }} className="hdr-month">
              <span>{fmtMonth(date)}</span>
              <span style={{ fontSize:'0.9rem', opacity:0.7 }}>▾</span>
            </button>
            <div className="ctrl-right">
              <button onClick={() => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() - 7); setDate(d.toLocaleDateString('en-CA')) }}
                aria-label="Previous week"
                style={{ background:'transparent', border:'1px solid rgba(var(--border-rgb),0.25)', color:'rgba(var(--text-rgb),0.7)', padding:'6px 10px', borderRadius:6, fontWeight:800, fontSize:'0.85rem', cursor:'pointer' }}>‹</button>
              <button onClick={() => setDate(today_)} style={{ background:'transparent', border:'1px solid rgba(var(--green-rgb),0.3)', color:'var(--green)', padding:'6px 14px', borderRadius:6, fontWeight:800, fontSize:'0.78rem', cursor:'pointer' }}>
                Today
              </button>
              <button onClick={() => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() + 7); setDate(d.toLocaleDateString('en-CA')) }}
                aria-label="Next week"
                style={{ background:'transparent', border:'1px solid rgba(var(--border-rgb),0.25)', color:'rgba(var(--text-rgb),0.7)', padding:'6px 10px', borderRadius:6, fontWeight:800, fontSize:'0.85rem', cursor:'pointer' }}>›</button>
            </div>
          </div>
          <div className="view-seg" style={{ width:'100%' }}>
            {['agenda', 'week', 'month'].map((v) => (
              <button key={v} onClick={() => setViewMode(v)}
                className={`view-btn${viewMode === v ? ' active' : ''}`}
                style={{ flex:1 }}>
                {v === 'agenda' ? 'daily' : v}
              </button>
            ))}
          </div>
        </div>

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
        </div>

        {(viewMode === 'agenda' || viewMode === 'day') && bookings.length > 0 && (
          <button onClick={refreshMyDistance} disabled={myDistLoading}
            title="Driving distance from your current location to each stop"
            style={{ marginTop:10, alignSelf:'flex-start', padding:'10px 16px', borderRadius:8, border:'1px solid rgba(var(--info-rgb),0.35)', background:'rgba(var(--info-rgb),0.08)', color:'var(--info)', fontSize:'0.9rem', fontWeight:800, fontFamily:'inherit', cursor: myDistLoading ? 'wait' : 'pointer', opacity: myDistLoading ? 0.6 : 1 }}>
            {myDistLoading ? 'Locating…' : 'My Distance'}
          </button>
        )}

        {picker && (
          <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setPicker(false) }}
            style={{ marginTop:10, width:'100%', padding:'10px 14px', background:'var(--bg-card)', border:'1px solid rgba(var(--border-rgb),0.25)', borderRadius:8, color:'var(--text)', fontSize:'1rem' }} />
        )}

        {calendarError && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginTop:10, padding:'10px 14px', borderRadius:8, background:'rgba(var(--danger-rgb),0.08)', border:'1px solid rgba(var(--danger-rgb),0.28)', color:'var(--danger)', fontSize:'0.82rem', fontWeight:700 }}>
            <span>⚠️ Google Calendar unavailable — appointments may be incomplete.</span>
            <button onClick={() => setRetryNonce((n) => n + 1)} disabled={loading} style={{ padding:'6px 12px', borderRadius:6, border:'1px solid rgba(var(--danger-rgb),0.35)', background:'transparent', color:'var(--danger)', fontWeight:800, cursor:loading ? 'wait' : 'pointer', whiteSpace:'nowrap' }}>
              {loading ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}

        <div className="day-title">
          <div className="day-title-name">{fmtDateLong(date)}</div>
          <div className="day-title-sub">
            {loading
              ? 'Loading…'
              : `${bookings.length} appointment${bookings.length === 1 ? '' : 's'}${driveTotals ? ` · ${driveTotals.miles} mi total drive` : ''}`}
          </div>
        </div>

        {!loading && !calendarError && bookings.length === 0 && viewMode === 'agenda' && (
          <div className="empty">No appointments scheduled.</div>
        )}

        {bookings.length > 0 && (viewMode === 'agenda') && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sortedBookings.map((ev) => {
              const isSelected = selectedEventId === ev.id
              const tanks = tanksFor(ev)
              const leg = legs[ev.id]
              return (
                <div key={ev.id}>
                {leg && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0 8px 8px', fontSize: '0.74rem', fontWeight: 700, color: 'rgba(var(--text-rgb),0.45)' }}>
                    <span style={{ borderLeft: '2px dotted rgba(var(--green-rgb),0.35)', height: 14, marginLeft: 2 }} />
                    {leg.duration} drive · {leg.text}
                  </div>
                )}
                <div onClick={() => setSelectedEventId(ev.id)}
                  style={{
                    cursor: 'pointer',
                    padding: '14px 16px',
                    borderRadius: 12,
                    background: 'rgba(var(--info-rgb),0.14)',
                    border: `1px solid ${isSelected ? 'var(--gold)' : 'rgba(var(--info-rgb),0.35)'}`,
                    color: 'var(--text)',
                    transition: 'transform 0.08s',
                  }}>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {ev.customerName || 'Customer'}
                    {tanks != null && (
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--green)', background: 'rgba(var(--green-rgb),0.12)', border: '1px solid rgba(var(--green-rgb),0.3)', padding: '2px 7px', borderRadius: 4 }}>
                        🛢 {tanks} tank{tanks === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.88rem', color: 'rgba(var(--text-rgb),0.85)', lineHeight: 1.4, marginBottom: 4 }}>
                    {ev.title}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'rgba(var(--text-rgb),0.7)', marginBottom: 4 }}>
                    {fmtTime(ev.startTime)}{ev.endTime ? `–${fmtTime(ev.endTime)}` : ''} · GreenGuard USA
                  </div>
                  {ev.address && (
                    <div style={{ fontSize: '0.82rem', color: 'rgba(var(--text-rgb),0.65)' }}>
                      📍 {ev.address}
                    </div>
                  )}
                  {myDistances[ev.id] && (
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--info)', marginTop: 4 }}>
                      {myDistances[ev.id].text} · {myDistances[ev.id].duration} from you
                    </div>
                  )}
                </div>
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
                 style={{ position:'absolute', left:0, right:0, top:0, bottom:0, cursor:'crosshair', background: isWeekend(date) ? 'rgba(0,0,0,0.08)' : 'transparent' }}
                 title="Click an empty time slot to start a new booking">
              {positioned.map((ev) => {
                const top = (ev.startMin - DAY_START_HOUR * 60) * PX_PER_MIN
                const height = Math.max(28, (ev.endMin - ev.startMin) * PX_PER_MIN - 2)
                const colWidth = `calc((100% - ${(ev._cols - 1) * 4}px) / ${ev._cols})`
                const left = `calc((${colWidth} + 4px) * ${ev._col})`
                const tanks = tanksFor(ev)
                return (
                  <div key={ev.id} className="event"
                    style={{ top, left, width: colWidth, height, ...(selectedEventId === ev.id ? { outline: '2px solid var(--gold)', outlineOffset: 1 } : {}) }}
                    title={`${ev.customerName} · ${ev.title}\n${fmtTime(ev.startTime)}–${fmtTime(ev.endTime)}\n${ev.address || ''}`}
                    onClick={() => setSelectedEventId(ev.id)}>
                    <div className="event-name">
                      {ev.customerName || 'Customer'}
                      {tanks != null && <span style={{ marginLeft: 6, fontSize: '0.68rem', color: 'var(--green)' }}>🛢{tanks}</span>}
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
          <div className="week-scroll">
          <div className="week-grid">
            {week.map((d) => {
              const dd = new Date(d + 'T12:00:00')
              const dayBookings = (rangeBookings[d] || []).slice().sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
              const dayTanks = dayBookings.reduce((s, ev) => s + (tanksFor(ev) || 0), 0)
              const isToday = d === today_
              return (
                <div key={d} style={{ minHeight: 200, padding: 8, borderRadius: 8, background: isWeekend(d) ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.02)', border: `1px solid ${isToday ? 'rgba(var(--green-rgb),0.4)' : 'rgba(var(--border-rgb),0.12)'}`, display: 'flex', flexDirection: 'column', gap: 4, opacity: isWeekend(d) ? 0.5 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: isToday ? 'var(--green)' : 'rgba(var(--text-rgb),0.55)' }}>
                      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dd.getDay()]} {dd.getDate()}
                    </div>
                    {dayTanks > 0 && <span style={{ fontSize: '0.62rem', color: 'var(--green)', fontWeight: 800 }}>🛢{dayTanks}</span>}
                  </div>
                  {dayBookings.length === 0 && <div style={{ fontSize: '0.7rem', color: 'rgba(var(--text-rgb),0.2)', textAlign: 'center', padding: '20px 0' }}>—</div>}
                  {dayBookings.map((ev) => {
                    const tanks = tanksFor(ev)
                    return (
                      <div key={ev.id} onClick={() => setSelectedEventId(ev.id)}
                        style={{ padding: '4px 6px', borderRadius: 4, background: 'rgba(var(--info-rgb),0.16)', border: '1px solid rgba(var(--info-rgb),0.3)', color: 'var(--text)', fontSize: '0.7rem', cursor: 'pointer', lineHeight: 1.3 }}>
                        <div style={{ fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {fmtTime(ev.startTime)} {ev.customerName?.split(' ')[0] || '?'}
                          {tanks != null && <span style={{ marginLeft: 4, color: 'var(--green)' }}>🛢{tanks}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
          </div>
        )}

        {viewMode === 'month' && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              {['S','M','T','W','T','F','S'].map((d, i) => <div key={i} style={{ textAlign: 'center', padding: '3px 0' }}>{d}</div>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
              {monthGrid.map((d) => {
                const dd = new Date(d + 'T12:00:00')
                const inMonth = dd.getMonth() === new Date(date + 'T12:00:00').getMonth()
                const isToday = d === today_
                const weekend = isWeekend(d)
                const dayBookings = rangeBookings[d] || []
                const dayTanks = dayBookings.reduce((s, ev) => s + (tanksFor(ev) || 0), 0)
                return (
                  <div key={d} onClick={() => { setDate(d); setViewMode('day') }}
                    style={{ minHeight: 52, padding: '5px 4px 4px', borderRadius: 6, background: weekend ? 'rgba(0,0,0,0.1)' : inMonth ? 'rgba(0,0,0,0.025)' : 'transparent', border: `1px solid ${isToday ? 'rgba(var(--green-rgb),0.5)' : 'rgba(var(--border-rgb),0.15)'}`, cursor: 'pointer', opacity: inMonth ? (weekend ? 0.45 : 1) : 0.25, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isToday ? 'var(--green)' : 'transparent', flexShrink: 0 }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: isToday ? 900 : 600, color: isToday ? 'var(--text-on-accent)' : 'var(--text-muted)', lineHeight: 1 }}>{dd.getDate()}</span>
                    </div>
                    {dayBookings.length > 0 && (
                      <div style={{ fontSize: '0.62rem', fontWeight: 800, color: 'var(--green)', lineHeight: 1.3, textAlign: 'center' }}>
                        {dayBookings.length}V{dayTanks > 0 ? ` ${dayTanks}T` : ''}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div style={{ marginTop: 10, fontSize: '0.7rem', color: 'var(--text-dim)', textAlign: 'center' }}>Tap a day to see appointments</div>
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
