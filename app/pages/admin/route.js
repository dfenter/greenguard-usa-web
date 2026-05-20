import { useState } from 'react'
import Head from 'next/head'
import path from 'path'
import fs from 'fs'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'

const ADMIN_EMAIL = 'admin@greenguard-usa.com'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (session.email !== ADMIN_EMAIL) return { redirect: { destination: '/dashboard', permanent: false } }

  const dataDir = path.join(process.cwd(), 'public', 'data')
  let routePlan = null

  try {
    const files = fs.readdirSync(dataDir).filter((f) => f.startsWith('route_plan_') && f.endsWith('.json'))
    if (files.length > 0) {
      files.sort().reverse()
      const latest = files[0]
      const raw = fs.readFileSync(path.join(dataDir, latest), 'utf8')
      routePlan = JSON.parse(raw)
    }
  } catch {
    // no route plan yet
  }

  return { props: { routePlan } }
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

export default function RoutePage({ routePlan }) {
  const days = routePlan?.days || []
  const [selectedDay, setSelectedDay] = useState(0)
  const day = days[selectedDay]

  const embedUrl = day ? buildMapsEmbedUrl(day) : null

  return (
    <>
      <Head><title>Route Plan · GreenGuard Admin</title></Head>
      <PortalLayout title="Route Plan" isAdmin>
        {!routePlan ? (
          <div className="card" style={{ maxWidth: 480 }}>
            <p style={{ color: 'rgba(212,230,202,0.5)', margin: 0 }}>
              No route plan for this week yet. The optimizer runs every Monday morning.
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
