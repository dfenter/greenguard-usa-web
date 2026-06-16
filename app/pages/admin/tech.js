import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import PortalLayout from '../../components/PortalLayout'
import CustomerMap from '../../components/CustomerMap'
import TankCalendar from '../../components/TankCalendar'
import { StopRow } from '../../components/StopCard'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'
import { getTodaysBookings, getBookingsForDateRange } from '../../lib/gcal'
import { findContactsByEmails, getContactNotes, tanksForCustomer } from '../../lib/hubspot'
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

  // Resolve customer name/phone/tanks from HubSpot for all stops.
  // Use the SAME batch fetch (findContactsByEmails) + tanksForCustomer that
  // admin home uses, so tech's tank counts and KPIs are identical to admin.
  // The old per-email findContactByEmail loop rate-limited under load and
  // dropped some contacts, which undercounted the KPI totals.
  const allEmails = [...new Set([...todayStops, ...tomorrowStops].map(s => s.email).filter(Boolean))]
  const contactMap = {}
  const hsContacts = await findContactsByEmails(allEmails).catch(() => new Map())
  for (const [email, c] of hsContacts.entries()) {
    contactMap[email] = {
      name: [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(' '),
      phone: c.properties?.phone || '',
      address: c.properties?.address || '',
      tanks: tanksForCustomer(c.properties) || null,
      firstAppointment: c.properties?.first_appointment === 'true',
      _contactId: c.id,
    }
  }
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
      firstAppointment: info.firstAppointment || false,
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
      // Same KPI source values admin home uses, so the cards match exactly.
      fullTanksOnHand: tankData?.currentStock ?? null,
      tanksNeededThisWeek: tankData?.weeklyTankTotal ?? null,
      expectedDeliveryThisWeek: tankData?.expectedDelivery ?? null,
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


// KPI card — identical to the admin home page KPI cards (same markup,
// styling, and warn behavior) so the two dashboards stay consistent.
function KPI({ label, value, sub, warn }) {
  return (
    <div style={{ flex: '1 1 130px', background: 'linear-gradient(165deg, rgba(125,255,170,0.05), rgba(201,168,76,0.022))', border: `1px solid ${warn ? 'rgba(255,160,80,0.25)' : 'rgba(122,171,130,0.15)'}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: warn ? '#ffb060' : 'rgba(212,230,202,0.35)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: '1.45rem', fontWeight: 900, lineHeight: 1, color: warn ? '#ffb060' : '#d4e6ca' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.35)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}


function TechNotes() {
  const [notes, setNotes] = useState([])
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    fetch('/api/admin/tech-notes')
      .then((r) => r.json())
      .then((d) => setNotes(d.notes || []))
      .catch(() => {})
  }, [])

  async function save() {
    if (!body.trim()) return
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/tech-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      if (!res.ok) throw new Error('Failed')
      const newNote = { id: Date.now(), body: body.trim(), timestamp: new Date().toISOString() }
      setNotes((prev) => [newNote, ...prev])
      setBody('')
      setMsg('Saved.')
      setTimeout(() => setMsg(null), 2000)
      textareaRef.current?.focus()
    } catch {
      setMsg('Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  function fmtNoteTime(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    const now = new Date()
    const diffH = (now - d) / 3600000
    if (diffH < 1) return 'just now'
    if (diffH < 24) return `${Math.floor(diffH)}h ago`
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })
  }

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.35)', marginBottom: 14 }}>
        Tech Notes
      </div>

      {/* Input */}
      <div style={{ background: 'rgba(26,46,31,0.7)', border: '1px solid rgba(122,171,130,0.2)', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
        <textarea
          ref={textareaRef}
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save() }}
          placeholder="Quick note for the day…"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(122,171,130,0.25)', background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '1rem', fontFamily: 'Inter, sans-serif', resize: 'vertical', boxSizing: 'border-box', outline: 'none', lineHeight: 1.5 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <span style={{ fontSize: '0.72rem', color: msg ? (msg === 'Saved.' ? '#7dffaa' : '#ff8080') : 'rgba(212,230,202,0.3)' }}>
            {msg || '⌘↵ to save'}
          </span>
          <button
            onClick={save}
            disabled={saving || !body.trim()}
            style={{ padding: '10px 22px', borderRadius: 8, border: 'none', background: saving || !body.trim() ? 'rgba(125,255,170,0.2)' : '#7dffaa', color: '#0d1a10', fontWeight: 900, fontSize: '0.95rem', fontFamily: 'Inter, sans-serif', cursor: saving || !body.trim() ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Saving…' : 'Save Note'}
          </button>
        </div>
      </div>

      {/* History */}
      {notes.length === 0 ? (
        <div style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.3)', textAlign: 'center', padding: '16px 0' }}>No notes this week.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {notes.map((n) => (
            <div key={n.id} style={{ background: 'rgba(26,46,31,0.5)', border: '1px solid rgba(122,171,130,0.12)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: '1rem', color: '#d4e6ca', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{n.body}</div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.3)', marginTop: 6 }}>{fmtNoteTime(n.timestamp)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default function TechDashboard({ adminEmail, todayStr, tomorrowStr, todayStops, tomorrowStops, mapsKey = '', tankData = null, fullTanksOnHand = null, tanksNeededThisWeek = null, expectedDeliveryThisWeek = null }) {
  const [distances, setDistances] = useState({})
  const [distLoading, setDistLoading] = useState(false)

  function refreshDistances() {
    const addressable = todayStops.filter((s) => s.address)
    if (!addressable.length || !navigator.geolocation) return
    setDistLoading(true)
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const origin = `${pos.coords.latitude},${pos.coords.longitude}`
      try {
        const res = await fetch('/api/admin/distances', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ origin, addresses: addressable.map((s) => ({ id: s.email || s.title, address: s.address })) }),
        })
        setDistances(await res.json())
      } catch {}
      setDistLoading(false)
    }, () => setDistLoading(false))
  }

  useEffect(() => { refreshDistances() }, [todayStops]) // eslint-disable-line react-hooks/exhaustive-deps

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

        {/* KPI strip — same four cards as admin home, same data + styling */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
          {(() => {
            const tanksToday = todayStops.reduce((s, st) => s + (st.tanks || 0), 0)
            const tanksTomorrow = tomorrowStops.reduce((s, st) => s + (st.tanks || 0), 0)
            const onHand = fullTanksOnHand
            const incoming = expectedDeliveryThisWeek || 0
            const projectedTotal = (onHand ?? 0) + incoming
            const weekNeed = tanksNeededThisWeek
            const depotShort = onHand != null && weekNeed != null && projectedTotal < weekNeed
            return (
              <>
                <KPI
                  label="Tanks Needed Today"
                  value={tanksToday}
                  sub={todayStops.length === 0 ? 'no stops' : `across ${todayStops.length} stop${todayStops.length === 1 ? '' : 's'}`}
                  warn={onHand != null && tanksToday > onHand}
                />
                <KPI
                  label="Tanks Needed Tomorrow"
                  value={tanksTomorrow}
                  sub={tomorrowStops.length === 0 ? 'no stops' : `across ${tomorrowStops.length} stop${tomorrowStops.length === 1 ? '' : 's'}`}
                />
                <KPI
                  label="Tanks at Depot"
                  value={onHand != null ? onHand : '—'}
                  sub={onHand == null ? 'no log yet' : incoming > 0 ? `+${incoming} Wed delivery → ${projectedTotal} projected` : 'on hand'}
                  warn={depotShort}
                />
                <KPI
                  label="Tanks Needed This Week"
                  value={weekNeed != null ? weekNeed : '—'}
                  sub="rolling next 7 days"
                />
              </>
            )
          })()}
        </div>

        {/* Tech Notes — moved directly below the KPI cards */}
        <TechNotes />

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
                onDayClick={(dateStr) => { window.location.href = `/admin/calendar?date=${dateStr}` }}
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7dffaa' }}>
              Today — {todayStops.length} {todayStops.length === 1 ? 'stop' : 'stops'}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={refreshDistances} disabled={distLoading}
                title="Recalculate driving distance from your current location to each stop"
                style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(91,196,255,0.35)', background: 'rgba(91,196,255,0.08)', color: '#5bc4ff', fontSize: '0.9rem', fontWeight: 800, fontFamily: 'Inter, sans-serif', cursor: distLoading ? 'wait' : 'pointer', opacity: distLoading ? 0.6 : 1 }}>
                {distLoading ? 'Locating…' : 'My Distance'}
              </button>
              <Link href="/admin/rounds" style={{ fontSize: '0.78rem', color: '#7aab82', fontWeight: 700 }}>
                All Rounds →
              </Link>
            </div>
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
              <StopRow key={stop.id || i} stop={stop} index={i} dateStr={todayStr} distance={distances[stop.email || stop.title]} />
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
