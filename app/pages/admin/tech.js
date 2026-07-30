import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import PortalLayout from '../../components/PortalLayout'
import CustomerMap from '../../components/CustomerMap'
import TankCalendar from '../../components/TankCalendar'
import { StopRow, CompletedRoundsSection } from '../../components/StopCard'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'
import { getTodaysBookings } from '../../lib/gcal'
import { useLazyData } from '../../components/useLazyData'

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
    <div style={{ flex: '1 1 130px', background: 'var(--bg-card)', border: `1px solid ${warn ? 'rgba(var(--warn-rgb),0.25)' : 'rgba(var(--green-rgb),0.15)'}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: warn ? 'var(--warn)' : 'var(--text-dim)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: '1.45rem', fontWeight: 900, lineHeight: 1, color: warn ? 'var(--warn)' : 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 4 }}>{sub}</div>}
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
      <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 14 }}>
        Tech Notes
      </div>

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

  // Invoice status per stop (same endpoint /admin/rounds uses) — a stop with
  // an invoice is finalized and drops into the Completed Rounds area below.
  const [stopInvoices, setStopInvoices] = useState({})
  useEffect(() => {
    const payload = todayStops
      .map((s, i) => ({ key: String(i), email: s.email, calBookingUid: s.calBookingUid, serviceDate: todayStr }))
      .filter((s) => s.email)
    if (payload.length === 0) { setStopInvoices({}); return }
    let cancelled = false
    fetch('/api/admin/stop-invoices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stops: payload }),
    })
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d?.invoices) setStopInvoices(d.invoices) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [todayStops, todayStr])

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
            <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 10 }}>
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
            <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--green)', marginBottom: 10 }}>
              Today&apos;s Route
            </div>
            <CustomerMap customers={routeMapData} mapsKey={mapsKey} height={320} compact />
          </section>
        )}

        {/* Today's stops */}
        <section style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--green)' }}>
              Today — {todayStops.length} {todayStops.length === 1 ? 'stop' : 'stops'}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={refreshDistances} disabled={distLoading}
                title="Recalculate driving distance from your current location to each stop"
                style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(var(--info-rgb),0.35)', background: 'rgba(var(--info-rgb),0.08)', color: 'var(--info)', fontSize: '0.9rem', fontWeight: 800, cursor: distLoading ? 'wait' : 'pointer', opacity: distLoading ? 0.6 : 1 }}>
                {distLoading ? 'Locating…' : 'My Distance'}
              </button>
              <Link href="/admin/rounds" style={{ fontSize: '0.78rem', color: 'var(--green-muted)', fontWeight: 700 }}>
                All Rounds →
              </Link>
            </div>
          </div>

          {todayStops.length === 0 ? (
            <div style={{
              background: 'var(--bg-card)', border: '1px solid rgba(var(--green-rgb),0.15)',
              borderRadius: 12, padding: '32px 24px', textAlign: 'center',
              color: 'var(--text-muted)', fontSize: '0.9rem',
            }}>
              No stops scheduled for today.
            </div>
          ) : (() => {
            const finalized = (i) => !!stopInvoices[String(i)]
            const completed = todayStops.map((_, i) => i).filter(finalized)
            return (
              <>
                {todayStops.map((stop, i) => finalized(i) ? null : (
                  <StopRow key={stop.id || i} stop={stop} index={i} dateStr={todayStr} distance={distances[stop.email || stop.title]} />
                ))}
                <CompletedRoundsSection count={completed.length}>
                  {completed.map((i) => (
                    <StopRow key={todayStops[i].id || i} stop={todayStops[i]} index={i} dateStr={todayStr} done distance={distances[todayStops[i].email || todayStops[i].title]} />
                  ))}
                </CompletedRoundsSection>
              </>
            )
          })()}
        </section>

        {/* Tomorrow's rounds preview removed — the tech only works today's
            stops, and showing tomorrow's list alongside caused confusion. */}

        {/* Quick links */}
        <section>
          <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 14 }}>
            Quick Access
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Timesheet', href: '/admin/timesheet', desc: 'Clock in/out, hours' },
              { label: 'Expenses', href: '/admin/expenses', desc: 'Upload receipts' },
              { label: 'Customer Rounds', href: '/admin/rounds', desc: 'Log service stops' },
              { label: 'Daily Inventory', href: '/admin/inventory', desc: 'Tank & equipment counts' },
              { label: 'Route Plan', href: '/admin/route', desc: 'Weekly route map' },
              { label: 'Route Map', href: '/admin/map', desc: 'View all stops' },
            ].map(({ label, href, desc }) => (
              <Link key={href} href={href} style={{
                display: 'block', padding: '16px 18px', borderRadius: 10,
                background: 'var(--bg-card)', border: '1px solid rgba(var(--green-rgb),0.15)',
                textDecoration: 'none', transition: 'border-color 0.15s',
              }}>
                <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{desc}</div>
              </Link>
            ))}
          </div>
        </section>

      </PortalLayout>
    </>
  )
}
