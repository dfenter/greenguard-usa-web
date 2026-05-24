import { useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import PortalLayout from '../../components/PortalLayout'
import TankCalendar from '../../components/TankCalendar'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'
import { getTodaysBookings, getBookingsForDateRange } from '../../lib/gcal'
import { findContactByEmail } from '../../lib/hubspot'
import { listAllActiveSubscriptions, listOpenInvoices, getBalance } from '../../lib/stripe'
import { buildTankCalendarData } from '../../lib/tank-data'

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

  const [todayStops, tomorrowStops, activeSubs, openInvoices, balance, tankData] = await Promise.all([
    getTodaysBookings().catch(() => []),
    getBookingsForDateRange(tomorrowStart, tomorrowEnd).catch(() => []),
    listAllActiveSubscriptions().catch(() => []),
    listOpenInvoices().catch(() => []),
    getBalance().catch(() => null),
    buildTankCalendarData(tz).catch(() => null),
  ])

  // Resolve customer name + phone from HubSpot for all stops
  const allEmails = [...new Set([...todayStops, ...tomorrowStops].map(s => s.email).filter(Boolean))]
  const contactMap = {}
  await Promise.all(allEmails.map(async (email) => {
    try {
      const c = await findContactByEmail(email)
      if (c) contactMap[email.toLowerCase()] = {
        name: [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(' '),
        phone: c.properties?.phone || '',
        address: c.properties?.address || '',
        tanks: parseInt(c.properties?.trap_count || c.properties?.tank_count || '0', 10) || null,
      }
    } catch {}
  }))

  function serializeStop(s) {
    const info = contactMap[s.email?.toLowerCase()] || {}
    return {
      id: s.id || null,
      title: info.name || s.name || '',
      serviceType: s.title || '',
      startTime: s.startTime || null,
      endTime: s.endTime || null,
      address: s.address || info.address || '',
      email: s.email || '',
      phone: info.phone || '',
      tanks: info.tanks || null,
    }
  }

  const mrr = activeSubs.reduce((sum, sub) =>
    sum + sub.items.data.reduce((s, i) => s + (i.price?.unit_amount || 0), 0), 0) / 100

  const openTotal = openInvoices.reduce((s, inv) => s + (inv.amount_due || 0), 0) / 100

  return {
    props: {
      todayStr,
      tomorrowStr,
      todayStops: todayStops.map(serializeStop),
      tomorrowStops: tomorrowStops.map(serializeStop),
      mrr: Math.round(mrr * 100) / 100,
      activeCount: activeSubs.length,
      openInvoiceCount: openInvoices.length,
      openInvoiceTotal: Math.round(openTotal * 100) / 100,
      openInvoiceList: openInvoices.slice(0, 5).map(inv => ({
        id: inv.id,
        email: inv.customer_email || '',
        amount: inv.amount_due / 100,
        hostedUrl: inv.hosted_invoice_url || null,
      })),
      balanceAvailable: balance ? balance.available / 100 : null,
      fullTanksOnHand: tankData?.currentStock ?? null,
      tanksNeededThisWeek: tankData?.weeklyTankTotal ?? null,
      expectedDeliveryThisWeek: tankData?.expectedDelivery ?? null,
      tankData: tankData ? {
        tankCalendar: tankData.tankCalendar,
        scheduleByDate: tankData.scheduleByDate,
        expectedDelivery: tankData.expectedDelivery,
        currentStock: tankData.currentStock,
        today: tankData.today,
      } : null,
    },
  }
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
    <div style={{ flex: '1 1 130px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${warn ? 'rgba(255,160,80,0.25)' : 'rgba(122,171,130,0.15)'}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: warn ? '#ffb060' : 'rgba(212,230,202,0.35)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: '1.45rem', fontWeight: 900, lineHeight: 1, color: warn ? '#ffb060' : '#d4e6ca' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.35)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function StopCard({ stop, dateStr }) {
  const [invoicing, setInvoicing] = useState(false)
  const roundsUrl = `/admin/rounds?date=${dateStr}&email=${encodeURIComponent(stop.email)}`
  const mapsUrl = stop.address ? `https://maps.apple.com/?daddr=${encodeURIComponent(stop.address)}` : null

  return (
    <div style={{ background: 'rgba(26,46,31,0.6)', border: '1px solid rgba(122,171,130,0.18)', borderRadius: 12, padding: '16px 18px', marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        {/* Time column */}
        <div style={{ minWidth: 52, textAlign: 'center', paddingTop: 2 }}>
          {stop.startTime && (
            <>
              <div style={{ fontSize: '0.88rem', fontWeight: 900, color: '#c9a84c', lineHeight: 1 }}>{fmtTime(stop.startTime).split(' ')[0]}</div>
              <div style={{ fontSize: '0.62rem', color: 'rgba(212,230,202,0.4)', marginTop: 1 }}>{fmtTime(stop.startTime).split(' ')[1]}</div>
            </>
          )}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: '1rem', marginBottom: 2 }}>{stop.title || 'Service Visit'}</div>
          {stop.serviceType && (
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#c9a84c', marginBottom: 4 }}>{stop.serviceType}</div>
          )}
          {stop.address && (
            <div style={{ fontSize: '0.8rem', color: 'rgba(212,230,202,0.5)', marginBottom: 6, lineHeight: 1.4 }}>📍 {stop.address}</div>
          )}
          {stop.tanks > 0 && (
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7dffaa', marginBottom: 8 }}>🪣 {stop.tanks} tank{stop.tanks > 1 ? 's' : ''} required</div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {stop.email && (
              <Link href={roundsUrl} style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 14px', borderRadius: 6, background: '#c9a84c', color: '#0d1a10', fontWeight: 800, fontSize: '0.8rem', textDecoration: 'none', minHeight: 36 }}>
                Rounds
              </Link>
            )}
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 14px', borderRadius: 6, background: 'rgba(125,255,170,0.1)', border: '1px solid rgba(125,255,170,0.2)', color: '#7dffaa', fontWeight: 800, fontSize: '0.8rem', textDecoration: 'none', minHeight: 36 }}>
                Navigate
              </a>
            )}
            {stop.phone && (
              <a href={`sms:${stop.phone.replace(/[^\d+]/g, '')}`} style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 14px', borderRadius: 6, background: 'rgba(91,196,255,0.08)', border: '1px solid rgba(91,196,255,0.18)', color: '#5bc4ff', fontWeight: 800, fontSize: '0.8rem', textDecoration: 'none', minHeight: 36 }}>
                💬 Text
              </a>
            )}
            {stop.email && (
              <Link href={`/admin/clients?email=${encodeURIComponent(stop.email)}`} style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 14px', borderRadius: 6, background: 'rgba(122,171,130,0.08)', border: '1px solid rgba(122,171,130,0.15)', color: 'rgba(212,230,202,0.6)', fontWeight: 700, fontSize: '0.8rem', textDecoration: 'none', minHeight: 36 }}>
                Profile
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

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
        <button onClick={load} disabled={loading} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(125,255,170,0.25)', background: 'transparent', color: '#7dffaa', cursor: loading ? 'wait' : 'pointer', fontWeight: 700, fontSize: '0.75rem', fontFamily: 'Nunito Sans, sans-serif' }}>
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
                  <Link href={`/admin/booking?email=${encodeURIComponent(c.email)}&name=${encodeURIComponent(c.name)}`} style={{ padding: '5px 12px', borderRadius: 5, background: '#c9a84c', color: '#0d1a10', fontWeight: 800, fontSize: '0.75rem', textDecoration: 'none', fontFamily: 'Nunito Sans, sans-serif' }}>
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

export default function AdminHome({ todayStr, tomorrowStr, todayStops, tomorrowStops, mrr, activeCount, openInvoiceCount, openInvoiceTotal, openInvoiceList, balanceAvailable, tankData, fullTanksOnHand, tanksNeededThisWeek, expectedDeliveryThisWeek }) {
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

        {/* KPI strip: Full Tanks · Tanks Needed This Week · Today's Stops · Open Invoices */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
          {(() => {
            const onHand = fullTanksOnHand
            const incoming = expectedDeliveryThisWeek || 0
            const projectedTotal = (onHand ?? 0) + incoming
            const need = tanksNeededThisWeek
            const isShort = onHand != null && need != null && projectedTotal < need
            return (
              <KPI
                label="Full Tanks"
                value={onHand != null ? onHand : '—'}
                sub={onHand == null
                  ? 'no log yet'
                  : incoming > 0
                    ? `+${incoming} Wed delivery → ${projectedTotal} projected`
                    : 'on hand at depot'}
                warn={isShort}
              />
            )
          })()}
          <KPI
            label="Tanks Needed (Next 7 Days)"
            value={tanksNeededThisWeek != null ? tanksNeededThisWeek : '—'}
            sub="rolling from today"
          />
          <KPI
            label="Today's Stops"
            value={todayStops.length}
            sub={todayStops.length === 0 ? 'none scheduled' : 'appointments'}
          />
          <KPI
            label="Open Invoices"
            value={openInvoiceCount}
            sub={openInvoiceCount > 0 ? fmt$(openInvoiceTotal) + ' due' : 'all clear'}
            warn={openInvoiceCount > 0}
          />
        </div>

        {/* Open invoices alert */}
        {openInvoiceList.length > 0 && (
          <div style={{ marginBottom: 24, padding: '14px 16px', background: 'rgba(255,160,80,0.06)', border: '1px solid rgba(255,160,80,0.2)', borderRadius: 10 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#ffb060', marginBottom: 10 }}>⚠ Unpaid Invoices</div>
            {openInvoiceList.map(inv => (
              <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,160,80,0.1)' }}>
                <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.65)' }}>{inv.email || inv.id}</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, color: '#ffb060', fontSize: '0.85rem' }}>{fmt$(inv.amount)}</span>
                  {inv.hostedUrl && <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: 4, background: '#c9a84c', color: '#0d1a10', fontWeight: 800, textDecoration: 'none' }}>Send</a>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Today's stops */}
        <section style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7dffaa' }}>
              Today — {todayStops.length} {todayStops.length === 1 ? 'stop' : 'stops'}
            </div>
            <Link href="/admin/rounds" style={{ fontSize: '0.78rem', color: '#7aab82', fontWeight: 700 }}>All Rounds →</Link>
          </div>

          {todayStops.length === 0 ? (
            <div style={{ padding: '24px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(122,171,130,0.1)', borderRadius: 12, color: 'rgba(212,230,202,0.35)', fontSize: '0.88rem', textAlign: 'center' }}>
              No stops scheduled for today.
            </div>
          ) : (
            todayStops.map((stop, i) => <StopCard key={stop.id || i} stop={stop} dateStr={todayStr} />)
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

        {/* Tank Calendar — compact widget; full view lives on /admin/inventory */}
        {tankData && (
          <section style={{ marginBottom: 32, maxWidth: 520 }}>
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
                onDayClick={() => { window.location.href = '/admin/inventory' }}
              />
              <div style={{ marginTop: 8, fontSize: '0.7rem', color: 'rgba(212,230,202,0.4)', textAlign: 'right' }}>
                Click a day to log tanks →
              </div>
            </div>
          </section>
        )}

        {/* Quick links */}
        <section>
          <div style={{ fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.3)', marginBottom: 12 }}>Quick Access</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Invoice Editor', href: '/admin/invoice', desc: 'Manage invoices' },
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
