import { useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import PortalLayout from '../../components/PortalLayout'
import CustomerMap from '../../components/CustomerMap'
import TankCalendar from '../../components/TankCalendar'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'
import { getTodaysBookings, getBookingsForDateRange } from '../../lib/gcal'
import { findContactByEmail, getContactNotes } from '../../lib/hubspot'
import { buildTankCalendarData } from '../../lib/tank-data'

export async function getServerSideProps({ req, res }) {
  const session = await getSessionFromRequest(req, res)
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

  const [todayStops, tomorrowStops, tankData] = await Promise.all([
    getTodaysBookings().catch(() => []),
    getBookingsForDateRange(tomorrowStart, tomorrowEnd).catch(() => []),
    buildTankCalendarData(tz).catch(() => null),
  ])

  // Look up name/phone/email/tanks from HubSpot — use GCal phone/name as primary for Cal.com events
  const allEmails = [...new Set([...todayStops, ...tomorrowStops].map(s => s.email).filter(Boolean))]
  const contactMap = {}
  await Promise.all(allEmails.map(async (email) => {
    try {
      const c = await findContactByEmail(email)
      if (c) contactMap[email.toLowerCase()] = {
        name: [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(' '),
        phone: c.properties?.phone || '',
        tanks: parseInt(c.properties?.trap_count || c.properties?.tank_count || '0', 10) || null,
        _contactId: c.id,
      }
    } catch {}
  }))
  const ADMIN_NOTE_RE = /^\[ADMIN-NOTE[^\]]*\]\s*/
  await Promise.all(Object.entries(contactMap).map(async ([email, info]) => {
    if (!info._contactId) return
    try {
      const notes = await getContactNotes(info._contactId, 20)
      const client = notes
        .filter(n => ADMIN_NOTE_RE.test((n.body || '').trim()))
        .slice(0, 3)
        .map(n => n.body.trim().replace(ADMIN_NOTE_RE, ''))
        .filter(Boolean)
      if (client.length) contactMap[email].clientNotes = client
    } catch {}
  }))

  function serializeStop(s) {
    const info = contactMap[s.email?.toLowerCase()] || {}
    // Cal.com events have customerName and phone in the GCal event; older events have email in description
    const resolvedName = info.name || s.customerName || s.name || s.title || ''
    const resolvedPhone = info.phone || s.phone || ''
    return {
      id: s.id || null,
      title: resolvedName,
      serviceType: s.title || '',
      startTime: s.startTime || null,
      endTime: s.endTime || null,
      address: s.address || '',
      email: s.email || '',
      phone: resolvedPhone,
      tanks: info.tanks || null,
      rescheduleUrl: s.rescheduleUrl || null,
      appointmentNotes: s.appointmentNotes || null,
      clientNotes: info.clientNotes || [],
    }
  }

  return {
    props: {
      adminEmail: session.email,
      todayStr,
      tomorrowStr,
      todayStops: todayStops.map(serializeStop),
      tomorrowStops: tomorrowStops.map(serializeStop),
      mapsKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
      tankData: tankData ? {
        tankCalendar: tankData.tankCalendar,
        scheduleByDate: tankData.scheduleByDate,
        today: tankData.today,
        currentStock: tankData.currentStock,
        expectedDelivery: tankData.expectedDelivery,
      } : null,
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

function ApptDetailModal({ stop, onClose }) {
  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
  const box = { background: '#0d1a10', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 14, padding: 24, maxWidth: 440, width: '100%', fontFamily: 'Nunito Sans, sans-serif', color: '#d4e6ca', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }
  const row = (label, value) => value ? (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(212,230,202,0.4)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: '0.9rem', color: '#d4e6ca' }}>{value}</div>
    </div>
  ) : null
  const fmtFull = (iso) => { try { return new Date(iso).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Chicago' }) } catch { return iso } }
  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', color: 'rgba(212,230,202,0.4)', fontSize: '1.3rem', cursor: 'pointer', lineHeight: 1 }}>×</button>
        <div style={{ fontWeight: 900, fontSize: '1.1rem', marginBottom: 18, paddingRight: 24 }}>{stop.title || stop.customerName || 'Service Visit'}</div>
        {row('Appointment time', stop.startTime ? fmtFull(stop.startTime) : null)}
        {row('Service', stop.serviceType)}
        {row('Address', stop.address)}
        {row('Email', stop.email)}
        {row('Phone', stop.phone)}
        {row('Tanks', stop.tanks > 0 ? `${stop.tanks} tank${stop.tanks > 1 ? 's' : ''}` : null)}
        {(stop.clientNotes || []).map((n, i) => row(i === 0 ? 'Notes' : '', n))}
      </div>
    </div>
  )
}

function StopCard({ stop, index, dateStr }) {
  const [showDetail, setShowDetail] = useState(false)
  const roundsUrl = `/admin/rounds?date=${dateStr}&email=${encodeURIComponent(stop.email || '')}`
  const mapsUrl = stop.address ? `https://maps.apple.com/?daddr=${encodeURIComponent(stop.address)}` : null
  const B = (bg, fg, border) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 96, padding: '8px 0', borderRadius: 6, fontWeight: 800,
    fontSize: '0.8rem', textDecoration: 'none', minHeight: 38,
    background: bg, color: fg, border: border || 'none',
  })

  return (
    <>
      {showDetail && <ApptDetailModal stop={stop} onClose={() => setShowDetail(false)} />}
      <div
        style={{ background: 'rgba(26,46,31,0.7)', border: '1px solid rgba(122,171,130,0.2)', borderRadius: 12, padding: '16px 18px', marginBottom: 12, display: 'flex', gap: 14, alignItems: 'flex-start', cursor: 'pointer' }}
        onClick={() => setShowDetail(true)}
      >
        {/* Stop number */}
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(201,168,76,0.18)', border: '2px solid rgba(201,168,76,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.9rem', color: '#c9a84c', flexShrink: 0, marginTop: 2 }}>
          {index + 1}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name + address */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
            <a
              href={stop.email ? `/admin/clients/${encodeURIComponent(stop.email)}` : '#'}
              style={{ fontWeight: 900, fontSize: '1rem', color: '#d4e6ca', textDecoration: 'none', borderBottom: '1px solid rgba(212,230,202,0.2)' }}
              onClick={e => e.stopPropagation()}
            >{stop.title || 'Service Visit'}</a>
            {stop.address && <span style={{ fontSize: '0.8rem', color: 'rgba(212,230,202,0.5)' }}>📍 {stop.address}</span>}
          </div>
          {/* Client notes from the client popup */}
          {(stop.clientNotes || []).map((note, i) => (
            <div key={i} style={{ fontSize: '0.8rem', color: 'rgba(212,230,202,0.75)', lineHeight: 1.5 }}>{note}</div>
          ))}
          {/* Service info */}
          <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.5)', marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
            {stop.startTime && <span style={{ color: '#c9a84c', fontWeight: 700 }}>{fmtTime(stop.startTime)}{stop.endTime ? ` – ${fmtTime(stop.endTime)}` : ''}</span>}
            {stop.serviceType && <span>{stop.serviceType}</span>}
            {stop.tanks > 0 && <span style={{ color: '#7dffaa', fontWeight: 700 }}>🫙 {stop.tanks} tank{stop.tanks > 1 ? 's' : ''}</span>}
          </div>
        </div>

        {/* Buttons — docked right, uniform width */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {stop.email && <Link href={roundsUrl} style={B('#c9a84c', '#0d1a10')}>Rounds</Link>}
          {mapsUrl && <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={B('rgba(125,255,170,0.12)', '#7dffaa', '1px solid rgba(125,255,170,0.25)')}>Navigate</a>}
          {stop.phone && <a href={`sms:${stop.phone.replace(/[^\d+]/g, '')}`} style={B('rgba(91,196,255,0.1)', '#5bc4ff', '1px solid rgba(91,196,255,0.2)')}>💬 Text</a>}
          {stop.rescheduleUrl && <a href={stop.rescheduleUrl} target="_blank" rel="noopener noreferrer" style={B('rgba(125,170,255,0.1)', '#7aabff', '1px solid rgba(125,170,255,0.2)')}>Reschedule</a>}
        </div>
      </div>
    </>
  )
}

export default function TechDashboard({ adminEmail, todayStr, tomorrowStr, todayStops, tomorrowStops, mapsKey = '', tankData = null }) {
  const routeMapData = todayStops
    .filter(s => s.address)
    .map((s, i) => ({ id: `stop_${i}`, name: `${i + 1}. ${s.title}`, address: s.address, status: 'active' }))
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
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#c9a84c', marginBottom: 4 }}>Field Tech</div>
          <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
            {greeting}, {displayName}
          </h1>
          <div style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.5)' }}>{fmtDayLabel(todayStr)}</div>
        </div>

        {/* KPI strip — what Bruce needs at a glance */}
        {(() => {
          const tanksToday = todayStops.reduce((s, st) => s + (st.tanks || 0), 0)
          const tanksTomorrow = tomorrowStops.reduce((s, st) => s + (st.tanks || 0), 0)
          const stopsToday = todayStops.length
          const KPI = ({ label, value, sub, color = '#7dffaa' }) => (
            <div style={{ flex: '1 1 130px', minWidth: 130, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(122,171,130,0.18)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, lineHeight: 1, color }}>{value}</div>
              {sub && <div style={{ fontSize: '0.7rem', color: 'rgba(212,230,202,0.4)', marginTop: 4 }}>{sub}</div>}
            </div>
          )
          return (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
              <KPI label="Tanks needed today" value={tanksToday} sub={`${stopsToday} stop${stopsToday === 1 ? '' : 's'}`} color="#7dffaa" />
              <KPI label="Tanks needed tomorrow" value={tanksTomorrow} sub={`${tomorrowStops.length} stop${tomorrowStops.length === 1 ? '' : 's'}`} color="#c9a84c" />
              <KPI label="Stops complete" value={`0 / ${stopsToday}`} sub="tap a stop to begin" color="rgba(212,230,202,0.6)" />
            </div>
          )
        })()}

        {/* Tank Calendar — above the route map per Bruce's prep flow */}
        {tankData && (
          <section style={{ marginBottom: 28, maxWidth: 520 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#c9a84c', marginBottom: 10 }}>
              Tank Calendar
            </div>
            <div className="card" style={{ padding: 14 }}>
              <TankCalendar
                tankCalendar={tankData.tankCalendar}
                scheduleByDate={tankData.scheduleByDate}
                today={tankData.today}
                currentStock={tankData.currentStock}
                expectedDelivery={tankData.expectedDelivery}
                onDayClick={() => { window.location.href = '/admin/inventory' }}
              />
            </div>
          </section>
        )}

        {/* Route map — today's stops */}
        {routeMapData.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7dffaa', marginBottom: 10 }}>
              Today&apos;s Route
            </div>
            <CustomerMap customers={routeMapData} mapsKey={mapsKey} height={320} compact />
          </section>
        )}

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
              { label: 'Route Plan', href: '/admin/route', desc: 'Weekly route map' },
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
