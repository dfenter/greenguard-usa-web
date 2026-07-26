import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import PortalLayout from '../../components/PortalLayout'
import TankCalendar from '../../components/TankCalendar'
import CustomerMap from '../../components/CustomerMap'
import { StopRow } from '../../components/StopCard'
import { getSessionFromRequest, isAdminEmail, isOwnerEmail } from '../../lib/auth'
import { useLazyData, LazyLoading, LazyError } from '../../components/useLazyData'

export async function getServerSideProps({ req, res }) {
  // Repeat loads within 60s serve the cached shell while revalidating.
  res?.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=60')
  const session = await getSessionFromRequest(req, res)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }
  // This page shows Stripe balances, open invoices and customer data. Crew get
  // the tech dashboard instead.
  if (!isOwnerEmail(session.email)) return { redirect: { destination: '/admin/tech', permanent: false } }
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
    <div style={{ flex: '1 1 130px', background: 'var(--bg-card)', border: `1px solid ${warn ? 'rgba(var(--warn-rgb),0.25)' : 'rgba(var(--green-rgb),0.15)'}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: warn ? 'var(--warn)' : 'var(--text-dim)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: '1.45rem', fontWeight: 900, lineHeight: 1, color: warn ? 'var(--warn)' : 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 4 }}>{sub}</div>}
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
        <h2 style={{ fontSize: '0.85rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)', margin: 0 }}>Customers Due for Service</h2>
        <button onClick={load} disabled={loading} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(var(--green-rgb),0.25)', background: 'transparent', color: 'var(--green)', cursor: loading ? 'wait' : 'pointer', fontWeight: 700, fontSize: '0.75rem', }}>
          {loading ? 'Loading…' : opened ? '↻ Refresh' : 'Show'}
        </button>
      </div>
      {data && (
        data.due.length === 0 ? (
          <div className="card" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            ✓ No customers due for service in the next {data.horizonDays} days.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.due.map((c) => (
              <div key={c.email} className="card" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>{c.name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {c.systemType}{c.hasTimer ? ' (timer)' : ''} · {c.lifetime}-day · last serviced {new Date(c.lastVisit).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: c.overdue ? 'var(--danger)' : c.daysUntilDue <= 2 ? 'var(--gold)' : 'var(--green)' }}>
                    {c.overdue ? `${Math.abs(c.daysUntilDue)}d overdue` : `due in ${c.daysUntilDue}d`}
                  </span>
                  <Link href={`/admin/booking?email=${encodeURIComponent(c.email)}&name=${encodeURIComponent(c.name)}`} style={{ padding: '5px 12px', borderRadius: 5, background: 'var(--gold)', color: 'var(--text-on-accent)', fontWeight: 800, fontSize: '0.75rem', textDecoration: 'none', }}>
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
          <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 4 }}>Admin</div>
          <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 2px' }}>{greeting}</h1>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{fmtDayLabel(todayStr)}</div>
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
            <h2 style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 10 }}>
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
              <div style={{ marginTop: 8, fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                Click a day to log tanks →
              </div>
            </div>
          </section>
        )}

        {/* Open invoices alert */}
        {openInvoiceList.length > 0 && (
          <div style={{ marginBottom: 24, padding: '14px 16px', background: 'rgba(var(--warn-rgb),0.06)', border: '1px solid rgba(var(--warn-rgb),0.2)', borderRadius: 10 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--warn)', marginBottom: 10 }}>⚠ Unpaid Invoices</div>
            {openInvoiceList.map(inv => (
              <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(var(--warn-rgb),0.1)' }}>
                <div style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{inv.email || inv.id}</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontWeight: 800, color: 'var(--warn)', fontSize: '0.85rem' }}>{fmt$(inv.amount)}</span>
                  {(() => {
                    const st = reminderState[inv.id]
                    const label = st === 'sending' ? 'Sending…' : st === 'sent' ? 'Sent ✓' : st === 'error' ? 'Retry' : 'Send Reminder'
                    return (
                      <button
                        onClick={() => sendReminder(inv.id)}
                        disabled={st === 'sending' || st === 'sent'}
                        title="Re-send this invoice email to the customer as a past-due reminder"
                        style={{ whiteSpace: 'nowrap', fontSize: '0.72rem', padding: '3px 10px', borderRadius: 4, border: 'none', background: st === 'sent' ? 'var(--green)' : st === 'error' ? 'var(--danger)' : 'var(--gold)', color: 'var(--text-on-accent)', fontWeight: 800, cursor: st === 'sending' || st === 'sent' ? 'default' : 'pointer' }}>
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
            <div style={{ fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--green)' }}>
              Today — {todayStops.length} {todayStops.length === 1 ? 'stop' : 'stops'}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={refreshDistances} disabled={distLoading}
                title="Recalculate driving distance from your current location to each stop"
                style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(var(--info-rgb),0.35)', background: 'rgba(var(--info-rgb),0.08)', color: 'var(--info)', fontSize: '0.9rem', fontWeight: 800, cursor: distLoading ? 'wait' : 'pointer', opacity: distLoading ? 0.6 : 1 }}>
                {distLoading ? 'Locating…' : 'My Distance'}
              </button>
              <Link href="/admin/rounds" style={{ fontSize: '0.78rem', color: 'var(--green-muted)', fontWeight: 700 }}>All Rounds →</Link>
            </div>
          </div>

          {todayStops.length === 0 ? (
            <div style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid rgba(var(--green-rgb),0.1)', borderRadius: 12, color: 'var(--text-dim)', fontSize: '0.88rem', textAlign: 'center' }}>
              No stops scheduled for today.
            </div>
          ) : (
            todayStops.map((stop, i) => <StopRow key={stop.id || i} stop={stop} index={i} dateStr={todayStr} distance={distances[stop.email || stop.title]} />)
          )}
        </section>

        {/* Tomorrow preview */}
        {tomorrowStops.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 12 }}>
              Tomorrow — {tomorrowStops.length} {tomorrowStops.length === 1 ? 'stop' : 'stops'}
            </div>
            {tomorrowStops.map((stop, i) => <StopRow key={stop.id || i} stop={stop} index={i} dateStr={tomorrowStr} preview />)}
          </section>
        )}

        <VisitsDuePanel />

        {/* Customer map — moved down */}
        {customerMapData.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h2 style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)', margin: 0 }}>
                Customer Map ({customerMapData.length})
              </h2>
              <Link href="/admin/map" style={{ fontSize: '0.78rem', color: 'var(--green-muted)', fontWeight: 700 }}>Full map →</Link>
            </div>
            <CustomerMap customers={customerMapData} mapsKey={mapsKey} height={360} compact />
          </section>
        )}

        {/* Quick links */}
        <section>
          <div style={{ fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 12 }}>Quick Access</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Tech View', href: '/admin/tech', desc: "Today's route & navigation" },
              { label: 'Payroll', href: '/admin/payroll', desc: 'Approve time, run payroll' },
              { label: 'Timesheet', href: '/admin/timesheet', desc: 'Clock in/out, my hours' },
              { label: 'Expenses', href: '/admin/expenses', desc: 'Receipts to review' },
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
              <Link key={href} href={href} style={{ display: 'block', padding: '14px 16px', borderRadius: 10, background: 'var(--bg-card)', border: '1px solid rgba(var(--green-rgb),0.12)', textDecoration: 'none' }}>
                <div style={{ fontWeight: 800, fontSize: '0.88rem', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{desc}</div>
              </Link>
            ))}
          </div>
        </section>

      </PortalLayout>
    </>
  )
}
