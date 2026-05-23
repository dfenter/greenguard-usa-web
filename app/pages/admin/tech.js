import { useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'
import { getTodaysBookings, getBookingsForDateRange } from '../../lib/gcal'
import { findContactByEmail } from '../../lib/hubspot'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }

  const tz = process.env.CALENDAR_TIMEZONE || 'America/Chicago'
  const now = new Date()
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: tz })

  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toLocaleDateString('en-CA', { timeZone: tz })
  const tomorrowStart = new Date(tomorrowStr + 'T00:00:00-05:00').toISOString()
  const tomorrowEnd = new Date(tomorrowStr + 'T23:59:59-05:00').toISOString()

  const [todayStops, tomorrowStops] = await Promise.all([
    getTodaysBookings().catch(() => []),
    getBookingsForDateRange(tomorrowStart, tomorrowEnd).catch(() => []),
  ])

  // Look up phone + customer name from HubSpot for today's stops
  const allEmails = [...new Set([...todayStops, ...tomorrowStops].map(s => s.email).filter(Boolean))]
  const contactMap = {}
  await Promise.all(allEmails.map(async (email) => {
    try {
      const c = await findContactByEmail(email)
      if (c) contactMap[email.toLowerCase()] = {
        name: [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(' '),
        phone: c.properties?.phone || '',
        tanks: parseInt(c.properties?.trap_count || c.properties?.tank_count || '0', 10) || null,
      }
    } catch {}
  }))

  function serializeStop(s) {
    const info = contactMap[s.email?.toLowerCase()] || {}
    return {
      id: s.id || null,
      title: info.name || s.title || '',
      serviceType: s.title || '',
      startTime: s.startTime || null,
      endTime: s.endTime || null,
      address: s.address || '',
      email: s.email || '',
      phone: info.phone || '',
      tanks: info.tanks || null,
    }
  }

  return {
    props: {
      adminEmail: session.email,
      todayStr,
      tomorrowStr,
      todayStops: todayStops.map(serializeStop),
      tomorrowStops: tomorrowStops.map(serializeStop),
    },
  }
}

function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Chicago' })
}

function fmtDayLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function StopCard({ stop, index, dateStr }) {
  const roundsUrl = `/admin/rounds?date=${dateStr}&email=${encodeURIComponent(stop.email)}`
  const mapsUrl = stop.address
    ? `https://maps.apple.com/?daddr=${encodeURIComponent(stop.address)}`
    : null

  return (
    <div style={{
      background: 'rgba(26,46,31,0.7)',
      border: '1px solid rgba(122,171,130,0.2)',
      borderRadius: 12,
      padding: '18px 20px',
      marginBottom: 12,
      display: 'flex',
      gap: 16,
      alignItems: 'flex-start',
    }}>
      {/* Stop number */}
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: 'rgba(201,168,76,0.18)', border: '2px solid rgba(201,168,76,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 900, fontSize: '0.95rem', color: '#c9a84c', flexShrink: 0,
      }}>
        {index + 1}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 900, fontSize: '1rem', marginBottom: 2 }}>{stop.title || 'Service Visit'}</div>
        {stop.serviceType && (
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#c9a84c', marginBottom: 4 }}>{stop.serviceType}</div>
        )}

        {stop.startTime && (
          <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.55)', fontWeight: 700, marginBottom: 4 }}>
            {fmtTime(stop.startTime)}{stop.endTime ? ` – ${fmtTime(stop.endTime)}` : ''}
          </div>
        )}

        {stop.address && (
          <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.55)', marginBottom: 4, lineHeight: 1.4 }}>
            📍 {stop.address}
          </div>
        )}

        {stop.tanks > 0 && (
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7dffaa', marginBottom: 8 }}>
            🪣 {stop.tanks} tank{stop.tanks > 1 ? 's' : ''} required
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {stop.email && (
            <Link href={roundsUrl} style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '9px 16px', borderRadius: 6,
              background: '#c9a84c', color: '#0d1a10',
              fontWeight: 800, fontSize: '0.85rem', textDecoration: 'none',
              minHeight: 44,
            }}>
              Open Rounds
            </Link>
          )}

          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '9px 16px', borderRadius: 6,
              background: 'rgba(125,255,170,0.12)', border: '1px solid rgba(125,255,170,0.25)',
              color: '#7dffaa', fontWeight: 800, fontSize: '0.85rem', textDecoration: 'none',
              minHeight: 44,
            }}>
              Navigate
            </a>
          )}

          {stop.phone && (
            <a href={`sms:${stop.phone.replace(/[^\d+]/g, '')}`} style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '9px 16px', borderRadius: 6,
              background: 'rgba(91,196,255,0.1)', border: '1px solid rgba(91,196,255,0.2)',
              color: '#5bc4ff', fontWeight: 800, fontSize: '0.85rem', textDecoration: 'none',
              minHeight: 44,
            }}>
              💬 Text
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TechDashboard({ adminEmail, todayStr, tomorrowStr, todayStops, tomorrowStops }) {
  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  const firstName = adminEmail?.split('@')[0]?.split('.')?.[0] || 'there'
  const displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1)

  return (
    <>
      <Head><title>Today&apos;s Route · GreenGuard</title></Head>
      <PortalLayout isAdmin>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#c9a84c', marginBottom: 4 }}>Field Tech</div>
          <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
            {greeting}, {displayName}
          </h1>
          <div style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.5)' }}>{fmtDayLabel(todayStr)}</div>
        </div>

        {/* Today's stops */}
        <section style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7dffaa' }}>
              Today — {todayStops.length} {todayStops.length === 1 ? 'stop' : 'stops'}
            </div>
            <Link href="/admin/rounds" style={{ fontSize: '0.78rem', color: '#7aab82', fontWeight: 700 }}>
              All Rounds →
            </Link>
          </div>

          {todayStops.length === 0 ? (
            <div style={{
              background: 'rgba(26,46,31,0.5)', border: '1px solid rgba(122,171,130,0.15)',
              borderRadius: 12, padding: '32px 24px', textAlign: 'center',
              color: 'rgba(212,230,202,0.4)', fontSize: '0.9rem',
            }}>
              No stops scheduled for today.
            </div>
          ) : (
            todayStops.map((stop, i) => (
              <StopCard key={stop.id || i} stop={stop} index={i} dateStr={todayStr} />
            ))
          )}
        </section>

        {/* Tomorrow preview */}
        {tomorrowStops.length > 0 && (
          <section style={{ marginBottom: 36 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.35)', marginBottom: 14 }}>
              Tomorrow — {tomorrowStops.length} {tomorrowStops.length === 1 ? 'stop' : 'stops'} ({fmtDayLabel(tomorrowStr).split(',')[0]})
            </div>
            {tomorrowStops.map((stop, i) => (
              <div key={stop.id || i} style={{
                background: 'rgba(26,46,31,0.35)', border: '1px solid rgba(122,171,130,0.1)',
                borderRadius: 10, padding: '14px 18px', marginBottom: 8, opacity: 0.7,
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 2 }}>{stop.title || 'Service Visit'}</div>
                {stop.startTime && <div style={{ fontSize: '0.8rem', color: 'rgba(201,168,76,0.7)', marginBottom: 3 }}>{fmtTime(stop.startTime)}</div>}
                {stop.address && <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.4)' }}>{stop.address}</div>}
              </div>
            ))}
          </section>
        )}

        {/* Quick links */}
        <section>
          <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.35)', marginBottom: 14 }}>
            Quick Access
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Customer Rounds', href: '/admin/rounds', desc: 'Log service stops' },
              { label: 'Daily Inventory', href: '/admin/inventory', desc: 'Tank & equipment counts' },
              { label: 'Client List', href: '/admin/clients', desc: 'Customer details' },
              { label: 'Route Map', href: '/admin/map', desc: 'View all stops' },
            ].map(({ label, href, desc }) => (
              <Link key={href} href={href} style={{
                display: 'block', padding: '16px 18px', borderRadius: 10,
                background: 'rgba(26,46,31,0.6)', border: '1px solid rgba(122,171,130,0.15)',
                textDecoration: 'none', transition: 'border-color 0.15s',
              }}>
                <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(212,230,202,0.45)' }}>{desc}</div>
              </Link>
            ))}
          </div>
        </section>

      </PortalLayout>
    </>
  )
}
