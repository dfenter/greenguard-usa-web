import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import PortalLayout from '../../components/PortalLayout'
import CustomerMap from '../../components/CustomerMap'
import TankCalendar from '../../components/TankCalendar'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'
import { getTodaysBookings } from '../../lib/gcal'
import { useLazyData } from '../../components/useLazyData'
import { fmtDayLabel, getGreeting, SectionLabel, TankKpiStrip, TodayStopsSection, QuickAccessGrid, useStopDistances, useStopInvoices } from '../../components/AdminToday'

export async function getServerSideProps({ req, res }) {
  res?.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=60')
  const session = await getSessionFromRequest(req, res)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }
  const tz = process.env.CALENDAR_TIMEZONE || 'America/Chicago'
  const now = new Date()
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: tz })
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toLocaleDateString('en-CA', { timeZone: tz })
  const bookings = await getTodaysBookings().catch((err) => {
    console.error('[tech] SSR GCal fallback error:', err.message)
    return []
  })
  const initialStops = bookings.map((b) => ({
    gcalEventId: b.id || null,
    title: b.customerName || b.name || 'Customer',
    serviceType: b.title || '',
    startTime: b.startTime || null,
    endTime: b.endTime || null,
    address: b.address || '',
    email: b.email || '',
    phone: b.phone || '',
    tanks: null,
    firstAppointment: false,
    rescheduleUrl: null,
    appointmentNotes: b.appointmentNotes || null,
    clientNotes: [],
  }))
  return { props: { adminEmail: session.email, todayStr, tomorrowStr, initialStops } }
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
      <SectionLabel style={{ marginBottom: 14 }}>Tech Notes</SectionLabel>

      {/* Input */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(var(--green-rgb),0.2)', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
        <textarea
          ref={textareaRef}
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save() }}
          placeholder="Quick note for the day…"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(var(--green-rgb),0.25)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: '1rem', resize: 'vertical', boxSizing: 'border-box', outline: 'none', lineHeight: 1.5 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <span style={{ fontSize: '0.72rem', color: msg ? (msg === 'Saved.' ? 'var(--green)' : 'var(--danger)') : 'var(--text-dim)' }}>
            {msg || '⌘↵ to save'}
          </span>
          <button
            onClick={save}
            disabled={saving || !body.trim()}
            style={{ padding: '10px 22px', borderRadius: 8, border: 'none', background: saving || !body.trim() ? 'rgba(var(--green-rgb),0.2)' : 'var(--green)', color: 'var(--text-on-accent)', fontWeight: 900, fontSize: '0.95rem', cursor: saving || !body.trim() ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Saving…' : 'Save Note'}
          </button>
        </div>
      </div>

      {/* History */}
      {notes.length === 0 ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', textAlign: 'center', padding: '16px 0' }}>No notes this week.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {notes.map((n) => (
            <div key={n.id} style={{ background: 'var(--bg-card)', border: '1px solid rgba(var(--green-rgb),0.12)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: '1rem', color: 'var(--text)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{n.body}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 6 }}>{fmtNoteTime(n.timestamp)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default function TechDashboard({ adminEmail, todayStr, tomorrowStr, initialStops = [] }) {
  const { data, error, reload } = useLazyData('/api/admin/tech-data')
  const fallback = {
    adminEmail,
    todayStr,
    tomorrowStr,
    todayStops: initialStops,
    tomorrowStops: [],
  }
  return <TechDashboardView {...(data || fallback)} lazyError={error} onRetry={reload} />
}

function TechDashboardView({ adminEmail, todayStr, tomorrowStr, todayStops = [], tomorrowStops = [], mapsKey = '', tankData = null, fullTanksOnHand = null, tanksNeededThisWeek = null, expectedDeliveryThisWeek = null, lazyError = null, onRetry }) {
  const { distances, distLoading, refreshDistances } = useStopDistances(todayStops)
  const stopInvoices = useStopInvoices(todayStops, todayStr)

  const routeMapData = todayStops
    .filter(s => s.address)
    .map((s, i) => ({ id: `stop_${i}`, name: `${i + 1}. ${s.title}`, address: s.address, status: 'active' }))
  const greeting = getGreeting()

  const firstName = adminEmail?.split('@')[0]?.split('.')?.[0] || 'there'
  const displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1)

  return (
    <>
      <Head><title>Today&apos;s Route · GreenGuard</title></Head>
      <PortalLayout isAdmin>

        {lazyError && (
          <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(var(--warn-rgb),0.35)', background: 'rgba(var(--warn-rgb),0.08)', color: 'var(--warn)', fontSize: '0.82rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span>Live route data is unavailable; showing the server-rendered route.</span>
            <button onClick={onRetry} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(var(--warn-rgb),0.4)', background: 'transparent', color: 'var(--warn)', fontWeight: 800, cursor: 'pointer' }}>Retry</button>
          </div>
        )}

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 4 }}>Field Tech</div>
          <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
            {greeting}, {displayName}
          </h1>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{fmtDayLabel(todayStr)}</div>
        </div>

        {/* KPI strip — same four cards as admin home, same data + styling */}
        <TankKpiStrip
          todayStops={todayStops}
          tomorrowStops={tomorrowStops}
          fullTanksOnHand={fullTanksOnHand}
          tanksNeededThisWeek={tanksNeededThisWeek}
          expectedDeliveryThisWeek={expectedDeliveryThisWeek}
        />

        {/* Tech Notes — moved directly below the KPI cards */}
        <TechNotes />

        {/* Tank Calendar — above the route map per Bruce's prep flow */}
        {tankData && (
          <section style={{ marginBottom: 28, maxWidth: 520 }}>
            <SectionLabel color="var(--gold)" style={{ marginBottom: 10 }}>Tank Calendar</SectionLabel>
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
            <SectionLabel color="var(--green)" style={{ marginBottom: 10 }}>Today&apos;s Route</SectionLabel>
            <CustomerMap customers={routeMapData} mapsKey={mapsKey} height={320} compact />
          </section>
        )}

        {/* Today's stops */}
        <TodayStopsSection
          todayStops={todayStops}
          todayStr={todayStr}
          distances={distances}
          distLoading={distLoading}
          refreshDistances={refreshDistances}
          stopInvoices={stopInvoices}
        />

        {/* Tomorrow's rounds preview removed — the tech only works today's
            stops, and showing tomorrow's list alongside caused confusion. */}

        {/* Quick links */}
        <QuickAccessGrid items={[
          { label: 'Timesheet', href: '/admin/timesheet', desc: 'Clock in/out, my hours' },
          { label: 'Expenses', href: '/admin/expenses', desc: 'Upload receipts' },
          { label: 'Customer Rounds', href: '/admin/rounds', desc: 'Log service stops' },
          { label: 'Daily Inventory', href: '/admin/inventory', desc: 'Tank & equipment counts' },
          { label: 'Route Plan', href: '/admin/route', desc: 'Weekly route map' },
          { label: 'Route Map', href: '/admin/map', desc: 'View all stops' },
        ]} />

      </PortalLayout>
    </>
  )
}
