import { useState, useEffect, useMemo } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'
import { getBookingsForDate } from '../../lib/gcal'

const TZ = 'America/Chicago'
const DAY_START_HOUR = 8   // 8 AM
const DAY_END_HOUR = 19    // 7 PM
const PX_PER_MIN = 1.4     // grid scale: 1 hour = 84px

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }

  const tz = process.env.CALENDAR_TIMEZONE || TZ
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz })

  let bookings = []
  try { bookings = await getBookingsForDate(today) } catch {}

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

export default function CalendarPage({ today, initialBookings }) {
  const [date, setDate] = useState(today)
  const [bookings, setBookings] = useState(initialBookings)
  const [loading, setLoading] = useState(false)
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

  useEffect(() => {
    if (date === today) return // initial load
    setLoading(true)
    fetch(`/api/admin/bookings?date=${date}`)
      .then((r) => r.json())
      .then((d) => setBookings(d.bookings || []))
      .catch(() => setBookings([]))
      .finally(() => setLoading(false))
  }, [date, today])

  const week = useMemo(() => buildWeek(date), [date])
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
              <button onClick={() => setViewMode('day')}
                title="Day grid"
                style={{ background: viewMode === 'day' ? '#7dffaa' : 'transparent', color: viewMode === 'day' ? '#0d1a10' : 'rgba(212,230,202,0.6)', border: 'none', padding: '6px 10px', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'Nunito Sans, sans-serif' }}>
                Day
              </button>
              <button onClick={() => setViewMode('agenda')}
                title="Agenda list"
                style={{ background: viewMode === 'agenda' ? '#7dffaa' : 'transparent', color: viewMode === 'agenda' ? '#0d1a10' : 'rgba(212,230,202,0.6)', border: 'none', borderLeft: '1px solid rgba(122,171,130,0.25)', padding: '6px 10px', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'Nunito Sans, sans-serif' }}>
                Agenda
              </button>
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

        {!loading && bookings.length === 0 && (
          <div className="empty">No appointments scheduled.</div>
        )}

        {bookings.length > 0 && viewMode === 'agenda' && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...bookings].sort((a, b) => new Date(a.startTime) - new Date(b.startTime)).map((ev) => {
              const isSelected = selectedEventId === ev.id
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
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff', marginBottom: 4 }}>
                    {ev.customerName || 'Customer'}
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

        {bookings.length > 0 && viewMode === 'day' && (
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

            <div className="event-area" style={{ position:'absolute', left:0, right:0, top:0, bottom:0 }}>
              {positioned.map((ev) => {
                const top = (ev.startMin - DAY_START_HOUR * 60) * PX_PER_MIN
                const height = Math.max(28, (ev.endMin - ev.startMin) * PX_PER_MIN - 2)
                const colWidth = `calc((100% - ${(ev._cols - 1) * 4}px) / ${ev._cols})`
                const left = `calc((${colWidth} + 4px) * ${ev._col})`
                return (
                  <div key={ev.id} className="event"
                    style={{ top, left, width: colWidth, height, ...(selectedEventId === ev.id ? { outline: '2px solid #c9a84c', outlineOffset: 1 } : {}) }}
                    title={`${ev.customerName} · ${ev.title}\n${fmtTime(ev.startTime)}–${fmtTime(ev.endTime)}\n${ev.address || ''}`}
                    onClick={() => setSelectedEventId(ev.id)}>
                    <div className="event-name">{ev.customerName || 'Customer'}</div>
                    <div className="event-title">{ev.title}</div>
                    <div className="event-time">{fmtTime(ev.startTime)}–{fmtTime(ev.endTime)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {date >= today_ && (
          <Link href="/admin/quote" className="fab" title="New booking via quote">+</Link>
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

          {ev.isLegacyAcuity && (
            <div style={{ marginBottom: 12, padding: '8px 10px', background: 'rgba(255,160,80,0.08)', border: '1px solid rgba(255,160,80,0.25)', borderRadius: 6, fontSize: '0.72rem', color: '#ffb060' }}>
              ⚠ Legacy Acuity booking. Use Cal.com or Google Calendar to reschedule going forward.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
            {ev.htmlLink && (
              <a href={ev.htmlLink} target="_blank" rel="noopener noreferrer"
                style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(91,196,255,0.3)', color: '#5bc4ff', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 700, textAlign: 'center' }}>
                Open in Google Calendar ↗
              </a>
            )}
            {ev.rescheduleUrl && !ev.isLegacyAcuity && (
              <a href={ev.rescheduleUrl} target="_blank" rel="noopener noreferrer"
                style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(125,255,170,0.3)', color: '#7dffaa', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 700, textAlign: 'center' }}>
                Reschedule via Cal.com ↗
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
