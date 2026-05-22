import { useState, useCallback } from 'react'
import Head from 'next/head'
import path from 'path'
import fs from 'fs'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'
import { getTodaysBookings } from '../../lib/gcal'
import { findContactByEmail } from '../../lib/hubspot'
import { listAllCustomers } from '../../lib/stripe'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }

  const tz = process.env.CALENDAR_TIMEZONE || 'America/Chicago'
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz })

  const dataDir = path.join(process.cwd(), 'public', 'data')
  let routePlan = null

  try {
    const files = fs.readdirSync(dataDir).filter((f) => f.startsWith('route_plan_') && f.endsWith('.json'))
    if (files.length > 0) {
      files.sort().reverse()
      const raw = fs.readFileSync(path.join(dataDir, files[0]), 'utf8')
      routePlan = JSON.parse(raw)
    }
  } catch {}

  const todayInPlan = routePlan?.days?.some((d) => d.date === today)
  let todayBookings = []
  if (!todayInPlan) {
    try {
      todayBookings = await getTodaysBookings()
    } catch {}
  }

  if (!routePlan && todayBookings.length > 0) {
    routePlan = {
      week: `${today} (live)`,
      days: [{
        date: today,
        stops: todayBookings.map((b) => ({
          customer_name: b.title,
          address: b.address || '',
          email: b.email || '',
          scheduled_time: b.startTime,
          duration_min: b.endTime && b.startTime
            ? Math.round((new Date(b.endTime) - new Date(b.startTime)) / 60000)
            : null,
        })),
      }],
      source: 'calendar',
    }
  }

  // Resolve customer names from HubSpot + Stripe for all stops
  if (routePlan) {
    const allEmails = [...new Set(
      (routePlan.days || []).flatMap(d => (d.stops || []).map(s => s.email).filter(Boolean))
    )]
    const hubspotNameByEmail = {}
    const stripeNameByEmail = {}
    await Promise.all([
      listAllCustomers().then(cs => cs.forEach(c => {
        if (c.email && c.name) stripeNameByEmail[c.email.toLowerCase()] = c.name
      })).catch(() => {}),
      ...allEmails.map(email =>
        findContactByEmail(email).then(c => {
          if (!c) return
          const full = [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(' ')
          if (full) hubspotNameByEmail[email.toLowerCase()] = full
        }).catch(() => {})
      ),
    ])
    routePlan = {
      ...routePlan,
      days: (routePlan.days || []).map(day => ({
        ...day,
        stops: (day.stops || []).map(stop => {
          const key = stop.email?.toLowerCase()
          const resolvedName = hubspotNameByEmail[key] || stripeNameByEmail[key] || stop.customer_name || stop.name
          return { ...stop, customer_name: resolvedName }
        }),
      })),
    }
  }

  return { props: { routePlan, today } }
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

export default function RoutePage({ routePlan, today }) {
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
        .day-tab { padding: 10px 18px; border-radius: 6px; border: none; cursor: pointer; font-weight: 700; font-size: 0.85rem; font-family: 'Nunito Sans', sans-serif; min-height: 44px; transition: all 0.15s; }
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
              </span>
            </div>

            {/* Day tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              {days.map((d, i) => (
                <button key={d.date} onClick={() => setSelectedDay(i)} className="day-tab"
                  style={{ background: selectedDay === i ? '#7dffaa' : 'rgba(122,171,130,0.1)', color: selectedDay === i ? '#0d1a10' : 'rgba(212,230,202,0.7)' }}>
                  {new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  {d.date === today && <span style={{ marginLeft: 6, fontSize: '0.7rem', opacity: 0.7 }}>TODAY</span>}
                </button>
              ))}
            </div>

            {day && (
              <>
                {/* Map */}
                {embedUrl ? (
                  <div style={{ marginBottom: 20, borderRadius: 8, overflow: 'hidden' }}>
                    <iframe src={embedUrl} width="100%" style={{ height: 'min(420px, 55vw)', minHeight: 220, border: 'none', display: 'block' }}
                      allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="Route map" />
                  </div>
                ) : null}

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
                            <div className="stop-name">{name}</div>
                            {time && <div className="stop-time">{time}</div>}
                            {stop.service_type && <div style={{ fontSize: '0.75rem', color: 'rgba(212,230,202,0.4)', marginBottom: 2 }}>{stop.service_type}</div>}
                            <div className="stop-addr">{stop.address || 'No address'}</div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                              <a href={roundsUrl} className="nav-btn" style={{ background: 'rgba(201,168,76,0.15)', borderColor: 'rgba(201,168,76,0.3)', color: '#c9a84c' }}>
                                Open Rounds
                              </a>
                              {stop.address && (
                                <a href={navUrl(stop.address)} target="_blank" rel="noopener noreferrer" className="nav-btn">
                                  ↗ Navigate
                                </a>
                              )}
                              {stop.cal_booking_uid && (
                                <a
                                  href={`https://cal.com/reschedule/${stop.cal_booking_uid}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="nav-btn"
                                  style={{ background: 'rgba(91,196,255,0.08)', borderColor: 'rgba(91,196,255,0.2)', color: '#5bc4ff' }}
                                >
                                  Reschedule
                                </a>
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
              </>
            )}
          </>
        )}
      </PortalLayout>
    </>
  )
}
