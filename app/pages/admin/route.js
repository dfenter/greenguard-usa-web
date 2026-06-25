import { useState, useCallback } from 'react'
import Head from 'next/head'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'
import { useLazyData, LazyLoading, LazyError } from '../../components/useLazyData'

export async function getServerSideProps({ req, res }) {
  res?.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=60')
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }
  return { props: {} }
}

function mapsEmbedUrl(day) {
  const stops = (day.stops || []).filter((s) => s.address)
  if (stops.length === 0) return null
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!key) return null
  const enc = (s) => encodeURIComponent(s)
  const origin = enc(stops[0].address)
  const dest = enc(stops[stops.length - 1].address)
  const wps = stops.slice(1, -1).map((s) => enc(s.address)).join('|')
  return `https://www.google.com/maps/embed/v1/directions?key=${key}&origin=${origin}&destination=${dest}${wps ? `&waypoints=${wps}` : ''}`
}

function navUrl(address) {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(address)}`
}

function formatTime(iso) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Chicago' })
  } catch { return null }
}

function RouteCalendar({ days, selectedDay, setSelectedDay, today }) {
  const [viewMonth, setViewMonth] = useState(() => {
    const ref = days[selectedDay]?.date || today
    const d = new Date(ref + 'T12:00:00')
    return { year: d.getFullYear(), month: d.getMonth() }
  })

  const { year, month } = viewMonth
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // Map date strings to day indices
  const dateToIdx = {}
  days.forEach((d, i) => { dateToIdx[d.date] = i })

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const pad = (n) => String(n).padStart(2, '0')

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
        <button onClick={() => setViewMonth(({ year, month }) => month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 })}
          style={{ background: 'none', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 6, color: '#7aab82', cursor: 'pointer', padding: '4px 12px', fontFamily: 'Inter, sans-serif', fontSize: '1rem' }}>‹</button>
        <div style={{ fontWeight: 800, fontSize: '0.95rem', flex: 1, textAlign: 'center' }}>{monthLabel}</div>
        <button onClick={() => setViewMonth(({ year, month }) => month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 })}
          style={{ background: 'none', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 6, color: '#7aab82', cursor: 'pointer', padding: '4px 12px', fontFamily: 'Inter, sans-serif', fontSize: '1rem' }}>›</button>
      </div>

      {/* Day labels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 3 }}>
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: '0.68rem', fontWeight: 800, color: 'rgba(212,230,202,0.35)', padding: '4px 0' }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />
          const dateStr = `${year}-${pad(month + 1)}-${pad(d)}`
          const hasStops = dateStr in dateToIdx
          const isSelected = hasStops && dateToIdx[dateStr] === selectedDay
          const isToday = dateStr === today
          const stopCount = hasStops ? (days[dateToIdx[dateStr]].stops?.length || 0) : 0
          return (
            <div key={dateStr}
              onClick={() => hasStops && setSelectedDay(dateToIdx[dateStr])}
              style={{
                borderRadius: 8, padding: '8px 4px 6px', textAlign: 'center',
                cursor: hasStops ? 'pointer' : 'default',
                background: isSelected ? '#7dffaa' : hasStops ? 'rgba(125,255,170,0.08)' : 'transparent',
                border: isToday ? '2px solid rgba(201,168,76,0.5)' : `1px solid ${hasStops ? 'rgba(125,255,170,0.2)' : 'rgba(122,171,130,0.08)'}`,
                transition: 'all 0.12s',
              }}
            >
              <div style={{ fontWeight: isSelected ? 900 : 700, fontSize: '0.88rem', color: isSelected ? '#0d1a10' : hasStops ? '#d4e6ca' : 'rgba(212,230,202,0.3)' }}>{d}</div>
              {hasStops && <div style={{ fontSize: '0.62rem', fontWeight: 800, marginTop: 2, color: isSelected ? '#0d1a10' : '#7dffaa' }}>{stopCount} stop{stopCount !== 1 ? 's' : ''}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function fmtPlanFreshness(iso) {
  if (!iso) return null
  const ageH = (Date.now() - new Date(iso).getTime()) / 3600000
  if (ageH < 1) return 'updated just now'
  if (ageH < 24) return `updated ${Math.round(ageH)}h ago`
  return `updated ${Math.round(ageH / 24)}d ago`
}

export default function RoutePage() {
  const { data, error, reload } = useLazyData('/api/admin/route-data')
  if (error) return <LazyError error={error} onRetry={reload} />
  if (!data) return <LazyLoading />
  return <RoutePageView {...data} />
}

function RoutePageView({ routePlan, today, planGeneratedAt }) {
  const days = routePlan?.days || []
  const todayIdx = days.findIndex((d) => d.date === today)
  const [selectedDay, setSelectedDay] = useState(todayIdx >= 0 ? todayIdx : 0)
  const [triggering, setTriggering] = useState(false)
  const [triggerMsg, setTriggerMsg] = useState(null)

  const day = days[selectedDay]

  const triggerOptimizer = useCallback(async () => {
    setTriggering(true)
    setTriggerMsg(null)
    try {
      const res = await fetch('/api/admin/trigger-route', { method: 'POST' })
      const json = await res.json()
      setTriggerMsg(res.ok ? 'Route optimizer triggered — check back in ~5 minutes.' : `Error: ${json.error}`)
    } catch { setTriggerMsg('Request failed') }
    finally { setTriggering(false) }
  }, [])

  const embedUrl = day ? mapsEmbedUrl(day) : null

  const efficiencyScore = (() => {
    if (!day?.total_drive_time || !day?.total_service_time) return null
    const drive = parseInt(day.total_drive_time)
    const service = parseInt(day.total_service_time)
    const total = drive + service
    return total > 0 ? { score: Math.round((service / total) * 100), drive, service } : null
  })()

  return (
    <>
      <Head><title>Route Plan · GreenGuard Admin</title></Head>
      <style>{`
        .stop-card { display: flex; align-items: flex-start; gap: 14px; padding: 16px; border-bottom: 1px solid rgba(122,171,130,0.1); }
        .stop-card:last-child { border-bottom: none; }
        .stop-num { width: 32px; height: 32px; border-radius: 50%; background: rgba(125,255,170,0.12); color: #7dffaa; font-weight: 900; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
        .stop-body { flex: 1; min-width: 0; }
        .stop-name { font-weight: 800; font-size: 1rem; color: #fff; margin-bottom: 3px; }
        .stop-time { font-size: 0.8rem; color: #c9a84c; font-weight: 700; margin-bottom: 4px; }
        .stop-addr { font-size: 0.82rem; color: rgba(212,230,202,0.6); margin-bottom: 10px; word-break: break-word; }
        .stop-meta { font-size: 0.75rem; color: rgba(212,230,202,0.38); }
        .nav-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; background: #1a3a26; border: 1px solid rgba(122,171,130,0.3); border-radius: 6px; color: #7dffaa; font-size: 0.8rem; font-weight: 800; text-decoration: none; letter-spacing: 0.04em; white-space: nowrap; }
        .day-tab { padding: 10px 18px; border-radius: 6px; border: none; cursor: pointer; font-weight: 700; font-size: 0.85rem; font-family: 'Inter', sans-serif; min-height: 44px; transition: all 0.15s; }
        @media (max-width: 480px) {
          .stop-card { padding: 14px 12px; gap: 10px; }
          .stop-name { font-size: 0.95rem; }
          .nav-btn { padding: 10px 14px; font-size: 0.78rem; }
          .day-tab { padding: 10px 14px; font-size: 0.8rem; }
        }
      `}</style>

      <PortalLayout title="Route Plan" isAdmin>

        {/* Trigger */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
          <button onClick={triggerOptimizer} disabled={triggering} className="day-tab"
            style={{ background: triggering ? 'rgba(201,168,76,0.2)' : '#c9a84c', color: triggering ? 'rgba(212,230,202,0.4)' : '#0d1a10', fontWeight: 800, fontSize: '0.82rem' }}>
            {triggering ? 'Triggering…' : 'Run Route Optimizer Now'}
          </button>
          {triggerMsg && <span style={{ fontSize: '0.82rem', color: triggerMsg.startsWith('Error') ? '#ff8080' : '#7dffaa' }}>{triggerMsg}</span>}
        </div>

        {routePlan?.source === 'calendar' && (
          <div style={{ padding: '8px 14px', borderRadius: 6, background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', fontSize: '0.82rem', color: '#c9a84c', marginBottom: 16 }}>
            Showing live Google Calendar data — no optimized route plan yet for this week.
          </div>
        )}

        {!routePlan ? (
          <div className="card" style={{ maxWidth: 480 }}>
            <p style={{ color: 'rgba(212,230,202,0.5)', margin: 0 }}>
              No appointments found for today and no route plan for this week. The optimizer runs every Monday morning — or trigger it manually above.
            </p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <span className="tag">Week {routePlan.week}</span>
              <span style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.4)' }}>
                {days.length} day{days.length !== 1 ? 's' : ''} · {days.reduce((s, d) => s + (d.stops?.length || 0), 0)} total stops
                {planGeneratedAt && <span style={{ marginLeft: 8 }}>· plan {fmtPlanFreshness(planGeneratedAt)}</span>}
                {day?.stops?.some((s) => s.hydrated_from_gcal) && (
                  <span style={{ marginLeft: 8, color: '#7dffaa' }}>· live GCal times</span>
                )}
              </span>
            </div>

            {/* Calendar date picker */}
            <RouteCalendar days={days} selectedDay={selectedDay} setSelectedDay={setSelectedDay} today={today} />

            {day && (
              <>
                {/* Efficiency */}
                {efficiencyScore && (() => {
                  const { score, drive, service } = efficiencyScore
                  const color = score >= 70 ? '#7dffaa' : score >= 50 ? '#c9a84c' : '#ff8080'
                  return (
                    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, padding: '14px 20px', flexWrap: 'wrap' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 900, fontSize: '1.8rem', color, lineHeight: 1 }}>{score}%</div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', marginTop: 2 }}>Efficiency</div>
                      </div>
                      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', minWidth: 80 }}>
                        <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: 4 }} />
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'rgba(212,230,202,0.5)' }}>
                        {service}m service · {drive}m drive
                        {day.total_distance_miles ? ` · ${day.total_distance_miles} mi` : ''}
                      </div>
                    </div>
                  )
                })()}

                {/* Day header + open in maps */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.55)' }}>
                    {(day.stops || []).length} stops
                    {day.total_drive_time ? ` · ${day.total_drive_time} drive` : ''}
                    {day.total_service_time ? ` · ${day.total_service_time} service` : ''}
                  </div>
                  {day.maps_url && (
                    <a href={day.maps_url} target="_blank" rel="noopener noreferrer" className="nav-btn">
                      Open Full Route in Maps →
                    </a>
                  )}
                </div>

                {/* Stop cards */}
                {(day.stops || []).length > 0 && (
                  <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {day.stops.map((stop, idx) => {
                      const name = stop.customer_name || stop.name || '—'
                      const time = formatTime(stop.scheduled_time || stop.start_time)
                      const roundsUrl = stop.email
                        ? `/admin/rounds?date=${day.date}&email=${encodeURIComponent(stop.email)}`
                        : `/admin/rounds?date=${day.date}`
                      return (
                        <div key={idx} className="stop-card">
                          <div className="stop-num">{idx + 1}</div>
                          <div className="stop-body">
                            <div className="stop-name">
                              {name}
                              {stop.booking_source === 'legacy' && (
                                <span style={{ marginLeft: 8, fontSize: '0.62rem', fontWeight: 800, color: '#c9a84c', background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: 4, padding: '1px 5px', verticalAlign: 'middle', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Legacy</span>
                              )}
                            </div>
                            {time && <div className="stop-time">{time}</div>}
                            {stop.service_type && <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#c9a84c', marginBottom: 2 }}>{stop.service_type}</div>}
                            <div className="stop-addr">📍 {stop.address || 'No address'}</div>
                            {stop.tanks > 0 && <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7dffaa', marginBottom: 6 }}>🫙 {stop.tanks} tank{stop.tanks > 1 ? 's' : ''} required</div>}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                              <a href={roundsUrl} className="nav-btn" style={{ background: 'rgba(201,168,76,0.15)', borderColor: 'rgba(201,168,76,0.3)', color: '#c9a84c' }}>
                                Open Rounds
                              </a>
                              {stop.address && (
                                <a href={navUrl(stop.address)} target="_blank" rel="noopener noreferrer" className="nav-btn">
                                  ↗ Navigate
                                </a>
                              )}
                              {stop.booking_source === 'legacy' ? (
                                stop.gcal_event_link && (
                                  <a href={stop.gcal_event_link} target="_blank" rel="noopener noreferrer" className="nav-btn"
                                    style={{ background: 'rgba(201,168,76,0.08)', borderColor: 'rgba(201,168,76,0.2)', color: '#c9a84c' }}>
                                    Edit in GCal
                                  </a>
                                )
                              ) : (
                                stop.cal_booking_uid && (
                                  <a href={`https://cal.com/reschedule/${stop.cal_booking_uid}`} target="_blank" rel="noopener noreferrer" className="nav-btn"
                                    style={{ background: 'rgba(91,196,255,0.08)', borderColor: 'rgba(91,196,255,0.2)', color: '#5bc4ff' }}>
                                    Reschedule
                                  </a>
                                )
                              )}
                              {stop.duration_min && (
                                <span className="stop-meta">{stop.duration_min} min</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Map — below stop list so address panel doesn't overlap content */}
                {embedUrl && (
                  <div style={{ marginTop: 20, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(122,171,130,0.15)' }}>
                    <iframe src={embedUrl} width="100%" style={{ height: 'min(380px, 60vw)', minHeight: 220, border: 'none', display: 'block' }}
                      allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="Route map" />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </PortalLayout>
    </>
  )
}
