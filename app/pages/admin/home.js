import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import PortalLayout from '../../components/PortalLayout'
import TankCalendar from '../../components/TankCalendar'
import CustomerMap from '../../components/CustomerMap'
import { StopRow } from '../../components/StopCard'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'
import { useLazyData, LazyLoading, LazyError } from '../../components/useLazyData'

export async function getServerSideProps({ req, res }) {
  // Repeat loads within 60s serve the cached shell while revalidating.
  res?.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=60')
  const session = await getSessionFromRequest(req, res)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }
  return { props: {} }
}

function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Chicago' })
}

function fmtDayLabel(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function fmt$(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function KPI({ label, value, sub, warn }) {
  return (
    <div style={{ flex: '1 1 130px', background: 'linear-gradient(165deg, rgba(125,255,170,0.05), rgba(201,168,76,0.022))', border: `1px solid ${warn ? 'rgba(255,160,80,0.25)' : 'rgba(122,171,130,0.15)'}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: warn ? '#ffb060' : 'rgba(212,230,202,0.35)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: '1.45rem', fontWeight: 900, lineHeight: 1, color: warn ? '#ffb060' : '#d4e6ca' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.35)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}


// Disabled-action style — keeps the button in the row but visibly inert.
function VisitsDuePanel() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [opened, setOpened] = useState(false)
  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/visits-due?days=10')
      const d = await r.json()
      setData(d)
      setOpened(true)
    } catch {}
    setLoading(false)
  }
  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <h2 style={{ fontSize: '0.85rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c9a84c', margin: 0 }}>Customers Due for Service</h2>
        <button onClick={load} disabled={loading} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(125,255,170,0.25)', background: 'transparent', color: '#7dffaa', cursor: loading ? 'wait' : 'pointer', fontWeight: 700, fontSize: '0.75rem', fontFamily: 'Inter, sans-serif' }}>
          {loading ? 'Loading…' : opened ? '↻ Refresh' : 'Show'}
        </button>
      </div>
      {data && (
        data.due.length === 0 ? (
          <div className="card" style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.5)' }}>
            ✓ No customers due for service in the next {data.horizonDays} days.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.due.map((c) => (
              <div key={c.email} className="card" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>{c.name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.5)' }}>
                    {c.systemType}{c.hasTimer ? ' (timer)' : ''} · {c.lifetime}-day · last serviced {new Date(c.lastVisit).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: c.overdue ? '#ff8080' : c.daysUntilDue <= 2 ? '#c9a84c' : '#7dffaa' }}>
                    {c.overdue ? `${Math.abs(c.daysUntilDue)}d overdue` : `due in ${c.daysUntilDue}d`}
                  </span>
                  <Link href={`/admin/booking?email=${encodeURIComponent(c.email)}&name=${encodeURIComponent(c.name)}`} style={{ padding: '5px 12px', borderRadius: 5, background: '#c9a84c', color: '#0d1a10', fontWeight: 800, fontSize: '0.75rem', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>
                    Book →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </section>
  )
}

export default function AdminHome() {
  const { data, error, reload } = useLazyData('/api/admin/home-data')
  if (error) return <LazyError error={error} onRetry={reload} />
  if (!data) return <LazyLoading />
  return <AdminHomeView {...data} />
}

function AdminHomeView({ todayStr, tomorrowStr, todayStops, tomorrowStops, mrr, activeCount, openInvoiceCount, openInvoiceTotal, openInvoiceList, balanceAvailable, tankData, fullTanksOnHand, tanksNeededThisWeek, expectedDeliveryThisWeek, customerMapData = [], mapsKey = '' }) {
  const [distances, setDistances] = useState({})
  const [distLoading, setDistLoading] = useState(false)
  const [reminderState, setReminderState] = useState({})

  async function sendReminder(invoiceId) {
    if (reminderState[invoiceId] === 'sending') return
    setReminderState((s) => ({ ...s, [invoiceId]: 'sending' }))
    try {
      const res = await fetch('/api/admin/send-invoice-reminder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId }),
      })
      setReminderState((s) => ({ ...s, [invoiceId]: res.ok ? 'sent' : 'error' }))
    } catch {
      setReminderState((s) => ({ ...s, [invoiceId]: 'error' }))
    }
  }

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

  const h = new Date().getHours()
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <>
      <Head><title>Home · GreenGuard Admin</title></Head>
      <PortalLayout isAdmin>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#c9a84c', marginBottom: 4 }}>Admin</div>
          <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 2px' }}>{greeting}</h1>
          <div style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.45)' }}>{fmtDayLabel(todayStr)}</div>
        </div>

        {/* KPI strip: Today's Tanks · Tomorrow's Tanks · Tanks at Depot · Tanks Needed This Week */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
          {(() => {
            const tanksToday = todayStops.reduce((s, x) => s + (x.tanks || 0), 0)
            const tanksTomorrow = tomorrowStops.reduce((s, x) => s + (x.tanks || 0), 0)
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
                  sub={todayStops.length === 0
                    ? 'no stops'
                    : `across ${todayStops.length} stop${todayStops.length === 1 ? '' : 's'}`}
                  warn={onHand != null && tanksToday > onHand}
                />
                <KPI
                  label="Tanks Needed Tomorrow"
                  value={tanksTomorrow}
                  sub={tomorrowStops.length === 0
                    ? 'no stops'
                    : `across ${tomorrowStops.length} stop${tomorrowStops.length === 1 ? '' : 's'}`}
                />
                <KPI
                  label="Tanks at Depot"
                  value={onHand != null ? onHand : '—'}
                  sub={onHand == null
                    ? 'no log yet'
                    : incoming > 0
                      ? `+${incoming} Wed delivery → ${projectedTotal} projected`
                      : 'on hand'}
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

        {/* Tank Calendar — moved up; full view lives on /admin/inventory */}
        {tankData && (
          <section style={{ marginBottom: 28, maxWidth: 520 }}>
            <h2 style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c9a84c', marginBottom: 10 }}>
              Tank Calendar
            </h2>
            <div className="card" style={{ padding: 14 }}>
              <TankCalendar
                tankCalendar={tankData.tankCalendar}
                scheduleByDate={tankData.scheduleByDate}
                today={tankData.today}
                currentStock={tankData.currentStock}
                expectedDelivery={tankData.expectedDelivery}
                onDayClick={(dateStr) => { window.location.href = `/admin/calendar?date=${dateStr}` }}
              />
              <div style={{ marginTop: 8, fontSize: '0.7rem', color: 'rgba(212,230,202,0.4)', textAlign: 'right' }}>
                Click a day to log tanks →
              </div>
            </div>
          </section>
        )}

        {/* Open invoices alert */}
        {openInvoiceList.length > 0 && (
          <div style={{ marginBottom: 24, padding: '14px 16px', background: 'rgba(255,160,80,0.06)', border: '1px solid rgba(255,160,80,0.2)', borderRadius: 10 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#ffb060', marginBottom: 10 }}>⚠ Unpaid Invoices</div>
            {openInvoiceList.map(inv => (
              <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(255,160,80,0.1)' }}>
                <div style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.82rem', color: 'rgba(212,230,202,0.65)' }}>{inv.email || inv.id}</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontWeight: 800, color: '#ffb060', fontSize: '0.85rem' }}>{fmt$(inv.amount)}</span>
                  {(() => {
                    const st = reminderState[inv.id]
                    const label = st === 'sending' ? 'Sending…' : st === 'sent' ? 'Sent ✓' : st === 'error' ? 'Retry' : 'Send Reminder'
                    return (
                      <button
                        onClick={() => sendReminder(inv.id)}
                        disabled={st === 'sending' || st === 'sent'}
                        title="Re-send this invoice email to the customer as a past-due reminder"
                        style={{ whiteSpace: 'nowrap', fontSize: '0.72rem', padding: '3px 10px', borderRadius: 4, border: 'none', background: st === 'sent' ? '#7dffaa' : st === 'error' ? '#ff8080' : '#c9a84c', color: '#0d1a10', fontWeight: 800, fontFamily: 'Inter, sans-serif', cursor: st === 'sending' || st === 'sent' ? 'default' : 'pointer' }}>
                        {label}
                      </button>
                    )
                  })()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Today's stops */}
        <section style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7dffaa' }}>
              Today — {todayStops.length} {todayStops.length === 1 ? 'stop' : 'stops'}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={refreshDistances} disabled={distLoading}
                title="Recalculate driving distance from your current location to each stop"
                style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(91,196,255,0.35)', background: 'rgba(91,196,255,0.08)', color: '#5bc4ff', fontSize: '0.9rem', fontWeight: 800, fontFamily: 'Inter, sans-serif', cursor: distLoading ? 'wait' : 'pointer', opacity: distLoading ? 0.6 : 1 }}>
                {distLoading ? 'Locating…' : 'My Distance'}
              </button>
              <Link href="/admin/rounds" style={{ fontSize: '0.78rem', color: '#7aab82', fontWeight: 700 }}>All Rounds →</Link>
            </div>
          </div>

          {todayStops.length === 0 ? (
            <div style={{ padding: '24px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(122,171,130,0.1)', borderRadius: 12, color: 'rgba(212,230,202,0.35)', fontSize: '0.88rem', textAlign: 'center' }}>
              No stops scheduled for today.
            </div>
          ) : (
            todayStops.map((stop, i) => <StopRow key={stop.id || i} stop={stop} index={i} dateStr={todayStr} distance={distances[stop.email || stop.title]} />)
          )}
        </section>

        {/* Tomorrow preview */}
        {tomorrowStops.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.3)', marginBottom: 12 }}>
              Tomorrow — {tomorrowStops.length} {tomorrowStops.length === 1 ? 'stop' : 'stops'}
            </div>
            {tomorrowStops.map((stop, i) => (
              <div key={stop.id || i} style={{ background: 'rgba(26,46,31,0.3)', border: '1px solid rgba(122,171,130,0.08)', borderRadius: 10, padding: '12px 16px', marginBottom: 8, display: 'flex', gap: 14, alignItems: 'center', opacity: 0.65 }}>
                <div style={{ minWidth: 52, textAlign: 'center' }}>
                  {stop.startTime && <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'rgba(201,168,76,0.6)' }}>{fmtTime(stop.startTime)}</div>}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{stop.title || 'Service Visit'}</div>
                  {stop.address && <div style={{ fontSize: '0.75rem', color: 'rgba(212,230,202,0.4)', marginTop: 2 }}>{stop.address}</div>}
                </div>
              </div>
            ))}
          </section>
        )}

        <VisitsDuePanel />

        {/* Customer map — moved down */}
        {customerMapData.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h2 style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c9a84c', margin: 0 }}>
                Customer Map ({customerMapData.length})
              </h2>
              <Link href="/admin/map" style={{ fontSize: '0.78rem', color: '#7aab82', fontWeight: 700 }}>Full map →</Link>
            </div>
            <CustomerMap customers={customerMapData} mapsKey={mapsKey} height={360} compact />
          </section>
        )}

        {/* Quick links */}
        <section>
          <div style={{ fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.3)', marginBottom: 12 }}>Quick Access</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Tech View', href: '/admin/tech', desc: "Today's route & navigation" },
              { label: 'My Account', href: '/dashboard?preview=1', desc: 'Preview the customer portal' },
              { label: 'All Invoices', href: '/admin/invoices', desc: 'Browse + filter history' },
              { label: 'Invoice Editor', href: '/admin/invoice', desc: 'Create or edit per customer' },
              { label: 'PDF Invoice', href: '/admin/invoice-pdf', desc: 'One-off / manual, print or save PDF' },
              { label: 'Reports', href: '/admin/reports', desc: 'Appointments, revenue, add-ons' },
              { label: 'Clients', href: '/admin/clients', desc: 'Customer profiles' },
              { label: 'Analytics', href: '/admin/analytics', desc: 'Revenue & traffic' },
              { label: 'Daily Inventory', href: '/admin/inventory', desc: 'Tank counts' },
              { label: 'Route Plan', href: '/admin/route', desc: 'Weekly map' },
              { label: 'New Booking', href: '/admin/booking', desc: 'Schedule a visit' },
              { label: 'Quote Builder', href: '/admin/quote', desc: 'Build & send a quote' },
            ].map(({ label, href, desc }) => (
              <Link key={href} href={href} style={{ display: 'block', padding: '14px 16px', borderRadius: 10, background: 'rgba(26,46,31,0.5)', border: '1px solid rgba(122,171,130,0.12)', textDecoration: 'none' }}>
                <div style={{ fontWeight: 800, fontSize: '0.88rem', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.4)' }}>{desc}</div>
              </Link>
            ))}
          </div>
        </section>

      </PortalLayout>
    </>
  )
}
