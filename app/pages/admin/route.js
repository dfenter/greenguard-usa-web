import { useState, useCallback } from 'react'
import Head from 'next/head'
import path from 'path'
import fs from 'fs'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'
import { getTodaysBookings } from '../../lib/gcal'

const ADMIN_EMAIL = 'admin@greenguard-usa.com'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (session.email !== ADMIN_EMAIL) return { redirect: { destination: '/dashboard', permanent: false } }

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

  // If no route plan or today isn't in the plan, build a live view from Google Calendar
  const todayInPlan = routePlan?.days?.some((d) => d.date === today)
  let todayBookings = []
  if (!todayInPlan) {
    try {
      todayBookings = await getTodaysBookings()
    } catch {}
  }

  // If we have today's calendar bookings but no route plan, synthesize a minimal plan
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

  return { props: { routePlan, today, todayBookings } }
}

function buildMapsEmbedUrl(day) {
  const stops = day.stops || []
  if (stops.length === 0) return null
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!key) return null

  const encode = (s) => encodeURIComponent(s)
  const depot = stops[0]?.address || ''
  const last = stops[stops.length - 1]?.address || ''
  const waypoints = stops.slice(0, -1).map((s) => encode(s.address)).join('|')

  return `https://www.google.com/maps/embed/v1/directions?key=${key}&origin=${encode(depot)}&destination=${encode(last)}${waypoints ? `&waypoints=${waypoints}` : ''}`
}

export default function RoutePage({ routePlan, today }) {
  const days = routePlan?.days || []
  // Default to today's tab if it exists
  const todayIdx = days.findIndex((d) => d.date === today)
  const [selectedDay, setSelectedDay] = useState(todayIdx >= 0 ? todayIdx : 0)
  const day = days[selectedDay]
  const [triggering, setTriggering] = useState(false)
  const [triggerMsg, setTriggerMsg] = useState(null)

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

  const embedUrl = day ? buildMapsEmbedUrl(day) : null

  return (
    <>
      <Head><title>Route Plan · GreenGuard Admin</title></Head>
      <PortalLayout title="Route Plan" isAdmin>
        {/* Trigger button */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
          <button onClick={triggerOptimizer} disabled={triggering}
            style={{ padding: '9px 18px', borderRadius: 6, border: 'none', cursor: triggering ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: '0.82rem', fontFamily: 'Nunito Sans, sans-serif', background: triggering ? 'rgba(201,168,76,0.2)' : '#c9a84c', color: triggering ? 'rgba(212,230,202,0.4)' : '#0d1a10' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
              <span className="tag">Week {routePlan.week}</span>
              <span style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.4)' }}>
                {days.length} day{days.length !== 1 ? 's' : ''} · {days.reduce((s, d) => s + (d.stops?.length || 0), 0)} total stops
              </span>
            </div>

            {/* Day tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              {days.map((d, i) => (
                <button
                  key={d.date}
                  onClick={() => setSelectedDay(i)}
                  style={{
                    padding: '7px 16px', borderRadius: 4, border: 'none', cursor: 'pointer',
                    fontWeight: 700, fontSize: '0.82rem', fontFamily: 'Nunito Sans, sans-serif',
                    background: selectedDay === i ? '#7dffaa' : 'rgba(122,171,130,0.1)',
                    color: selectedDay === i ? '#0d1a10' : 'rgba(212,230,202,0.7)',
                    transition: 'all 0.15s',
                  }}
                >
                  {new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </button>
              ))}
            </div>

            {day && (
              <>
                {/* Map */}
                <div style={{ marginBottom: 20 }}>
                  {embedUrl ? (
                    <iframe
                      src={embedUrl}
                      width="100%"
                      height="420"
                      style={{ border: 'none', borderRadius: 8, display: 'block' }}
                      allowFullScreen
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      title="Route map"
                    />
                  ) : (
                    <div className="card" style={{ color: 'rgba(212,230,202,0.4)', fontSize: '0.88rem' }}>
                      Maps Embed API key not configured — set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.
                    </div>
                  )}
                </div>

                {/* Day summary + open in maps */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.55)' }}>
                    {(day.stops || []).length} stops
                    {day.total_drive_time ? ` · ${day.total_drive_time} drive time` : ''}
                    {day.total_service_time ? ` · ${day.total_service_time} service` : ''}
                  </div>
                  {day.maps_url && (
                    <a
                      href={day.maps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-gold"
                      style={{ fontSize: '0.82rem' }}
                    >
                      Open in Google Maps →
                    </a>
                  )}
                </div>

                {/* Stop list */}
                {(day.stops || []).length > 0 && (
                  <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(122,171,130,0.15)' }}>
                          {['#', 'Customer', 'Address', 'Duration'].map((h) => (
                            <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 800, fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.35)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {day.stops.map((stop, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(122,171,130,0.08)' }}>
                            <td style={{ padding: '10px 16px', fontWeight: 800, color: '#7dffaa', width: 36 }}>{idx + 1}</td>
                            <td style={{ padding: '10px 16px', fontWeight: 700 }}>{stop.customer_name || stop.name || '—'}</td>
                            <td style={{ padding: '10px 16px', color: 'rgba(212,230,202,0.6)' }}>{stop.address}</td>
                            <td style={{ padding: '10px 16px', color: 'rgba(212,230,202,0.5)' }}>{stop.duration_min ? `${stop.duration_min} min` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
