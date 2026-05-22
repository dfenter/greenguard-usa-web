import { useState } from 'react'
import Head from 'next/head'
import Image from 'next/image'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'
import { getSubscriptions, getInvoices, stripe } from '../../lib/stripe'
import { getUpcomingBookingsForEmail, getPastBookingsForEmail } from '../../lib/gcal'
import { findContactByEmail } from '../../lib/hubspot'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

const TRAP_IMAGES = {
  'Biogents-CO2': '/images/trap-biogents.jpg',
  'Biogents-NonCO2': '/images/trap-biogents.jpg',
  'Mosqitter-Grand': '/images/trap-mosqitter.webp',
  // legacy values
  Mosqitter: '/images/trap-mosqitter.webp',
  'MQ-RENT': '/images/trap-mosqitter.webp',
}

const SYSTEM_LABELS = {
  'Biogents-CO2': 'Biogents CO₂ Trap',
  'Biogents-NonCO2': 'Biogents (Non-CO₂)',
  'Mosqitter-Grand': 'Mosqitter Grand',
  // legacy values
  Mosqitter: 'Mosqitter Grand',
  'MQ-RENT': 'Mosqitter Grand',
}

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }

  const { email, stripeCustomerId } = session
  const isAdmin = email === ADMIN_EMAIL
  // Redirect admin to analytics unless previewing the customer view
  if (isAdmin && !req.query.preview) return { redirect: { destination: '/admin/analytics', permanent: false } }

  const [upcoming, past, subscriptions, invoices, contact, stripeCustomer] = await Promise.all([
    getUpcomingBookingsForEmail(email, 1).catch(() => []),
    getPastBookingsForEmail(email, 1).catch(() => []),
    stripeCustomerId ? getSubscriptions(stripeCustomerId) : Promise.resolve([]),
    stripeCustomerId ? getInvoices(stripeCustomerId, 24) : Promise.resolve([]),
    findContactByEmail(email).catch(() => null),
    stripeCustomerId ? stripe.customers.retrieve(stripeCustomerId).catch(() => null) : Promise.resolve(null),
  ])

  const p = contact?.properties || {}
  const m = stripeCustomer?.metadata || {}
  // Fall back to Stripe metadata when HubSpot custom properties aren't set
  const trapCount = p.trap_count ? parseInt(p.trap_count, 10) : (m.trap_count ? parseInt(m.trap_count, 10) : 0)
  const tankCount = p.tank_count ? parseInt(p.tank_count, 10) : (m.tank_count ? parseInt(m.tank_count, 10) : 0)
  const planType = p.plan_type || m.plan_type || null
  const systemType = p.system_type || m.system_type || null
  const usesC02 = systemType === 'Biogents-CO2' || systemType === 'Mosqitter-Grand' || systemType === 'Mosqitter' || systemType === 'MQ-RENT'
  const hasTimer = p.has_timer === 'true' && systemType === 'Biogents-CO2'

  let nextRefillDate = null
  if (p.service_start_date && usesC02 && trapCount > 0) {
    const install = new Date(p.service_start_date)
    const now = new Date()
    const monthsSince = (now.getFullYear() - install.getFullYear()) * 12 + (now.getMonth() - install.getMonth())
    const next = new Date(install)
    next.setMonth(next.getMonth() + monthsSince + 1)
    nextRefillDate = next.toISOString()
  }

  const sub = subscriptions[0] || null

  return {
    props: {
      email,
      name: [p.firstname, p.lastname].filter(Boolean).join(' ') || null,
      // visits
      nextBooking: upcoming[0] ? { startTime: upcoming[0].startTime, title: upcoming[0].title, address: upcoming[0].address } : null,
      prevBooking: past[0] ? { startTime: past[0].startTime, title: past[0].title, address: past[0].address } : null,
      // system
      systemType,
      trapCount,
      tankCount,
      planType,
      hasTimer,
      customerType: p.customer_type || null,
      installDate: p.service_start_date || null,
      trapImage: TRAP_IMAGES[systemType] || null,
      systemLabel: SYSTEM_LABELS[systemType] || systemType || null,
      // co2
      usesC02,
      nextRefillDate,
      // billing
      subscription: sub ? {
        status: sub.status,
        amount: sub.items.data.reduce((s, i) => s + (i.price.unit_amount || 0), 0),
        interval: sub.items.data[0]?.price.recurring?.interval || 'month',
        label: sub.items.data.map((i) => i.price.nickname || '').filter(Boolean).join(' + '),
        currentPeriodEnd: sub.current_period_end,
      } : null,
      invoices: invoices.map((inv) => ({
        id: inv.id,
        number: inv.number || inv.id,
        status: inv.status,
        amountPaid: inv.amount_paid,
        amountDue: inv.amount_due,
        created: inv.created,
        hostedUrl: inv.hosted_invoice_url,
        pdfUrl: inv.invoice_pdf,
      })),
    },
  }
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function fmtDateShort(unix) {
  return new Date(unix * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtAmount(cents) {
  return `$${(cents / 100).toFixed(2)}`
}

const INV_STATUS_COLOR = {
  paid: '#7dffaa',
  open: '#c9a84c',
  void: 'rgba(212,230,202,0.35)',
  uncollectible: '#ff6b6b',
}

const DIVIDER = <div style={{ borderTop: '1px solid rgba(122,171,130,0.12)', margin: '32px 0' }} />

const SECTION_LABEL = (text) => (
  <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#c9a84c', marginBottom: 18 }}>
    {text}
  </div>
)

// ── Date range filter options ──────────────────────────────────────────────────

const DATE_RANGES = [
  { label: 'Last 3 months', months: 3 },
  { label: 'Last 6 months', months: 6 },
  { label: 'This year', months: 12 },
  { label: 'All time', months: null },
]

// ── Main page ──────────────────────────────────────────────────────────────────

export default function CustomerOverview({
  email, name,
  nextBooking, prevBooking,
  systemType, trapCount, tankCount, hasTimer, customerType, installDate, trapImage, systemLabel,
  usesC02, nextRefillDate,
  subscription, invoices,
}) {
  const [dateRange, setDateRange] = useState(6)

  const filteredInvoices = dateRange === null
    ? invoices
    : invoices.filter((inv) => {
        const cutoff = Date.now() / 1000 - dateRange * 30 * 86400
        return inv.created >= cutoff
      })

  const hasOpenInvoice = invoices.some((inv) => inv.status === 'open')

  return (
    <>
      <Head><title>My Account · GreenGuard</title></Head>
      <PortalLayout isAdmin={false}>
        {/* ── Header ── */}
        <div style={{ marginBottom: 36 }}>
          <span className="tag">My Account</span>
          <h1 style={{ fontSize: 'clamp(1.5rem,3vw,2rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
            {name ? `Welcome back, ${name.split(' ')[0]}` : 'Welcome back'}
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.45)', margin: 0 }}>{email}</p>
        </div>

        {/* ── Visits ── */}
        {SECTION_LABEL('Schedule')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16, marginBottom: 20 }}>
          {/* Previous */}
          <div className="card" style={{ opacity: 0.7 }}>
            <span className="tag">Previous Visit</span>
            {prevBooking ? (
              <>
                <div style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 4 }}>{fmtDate(prevBooking.startTime)}</div>
                <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.55)' }}>{prevBooking.title}</div>
                {prevBooking.address && <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.35)', marginTop: 4 }}>{prevBooking.address}</div>}
              </>
            ) : (
              <div style={{ fontSize: '0.88rem', color: 'rgba(212,230,202,0.4)' }}>No previous visits on record</div>
            )}
          </div>

          {/* Next */}
          <div className="card">
            <span className="tag">Next Visit</span>
            {nextBooking ? (
              <>
                <div style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 4, color: '#7dffaa' }}>{fmtDate(nextBooking.startTime)}</div>
                <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.6)' }}>{nextBooking.title}</div>
                {nextBooking.address && <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.4)', marginTop: 4 }}>{nextBooking.address}</div>}
              </>
            ) : (
              <div style={{ fontSize: '0.88rem', color: 'rgba(212,230,202,0.4)' }}>No upcoming visits scheduled</div>
            )}
          </div>
        </div>

        <a
          href={`mailto:hello@greenguard-usa.com?subject=Service Visit Request&body=Hi GreenGuard team,%0A%0AI'd like to request a service visit.%0A%0AAccount email: ${encodeURIComponent(email)}`}
          style={{
            display: 'inline-block', marginBottom: 8,
            padding: '10px 22px', borderRadius: 6,
            border: '1px solid rgba(122,171,130,0.35)',
            color: '#7aab82', fontWeight: 800, fontSize: '0.85rem',
            textDecoration: 'none',
          }}
        >
          Request a Service Visit →
        </a>

        {DIVIDER}

        {/* ── My System ── */}
        {SECTION_LABEL('My System')}
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 20 }}>
          {trapImage && (
            <div style={{ flexShrink: 0 }}>
              <Image
                src={trapImage}
                alt={systemLabel || 'Your trap'}
                width={180}
                height={180}
                style={{ borderRadius: 12, objectFit: 'cover', display: 'block' }}
              />
            </div>
          )}
          <div className="card" style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 900, fontSize: '1.1rem', marginBottom: 12 }}>
              {systemLabel || 'System details loading'}
            </div>
            {customerType && (
              <div style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, background: 'rgba(125,255,170,0.1)', color: '#7dffaa', fontSize: '0.72rem', fontWeight: 800, marginBottom: 14 }}>
                {customerType === 'rental' ? 'Rental' : 'Owned'}
              </div>
            )}
            {trapCount > 0 && (
              <div style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.6)', marginBottom: 6 }}>
                {trapCount} trap{trapCount !== 1 ? 's' : ''} active
              </div>
            )}
            {hasTimer && (
              <div style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.6)', marginBottom: 6 }}>Timer installed</div>
            )}
            {installDate && (
              <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.4)', marginTop: 4 }}>
                Service since {new Date(installDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </div>
            )}
          </div>
        </div>
        <a
          href={`mailto:hello@greenguard-usa.com?subject=Equipment Upgrade Request&body=Hi GreenGuard team,%0A%0AI'd like to request additional equipment or an upgrade to my system.%0A%0AAccount email: ${encodeURIComponent(email)}`}
          style={{
            display: 'inline-block', marginBottom: 8,
            padding: '10px 22px', borderRadius: 6,
            border: '1px solid rgba(201,168,76,0.4)',
            color: '#c9a84c', fontWeight: 800, fontSize: '0.85rem',
            textDecoration: 'none',
          }}
        >
          Request Equipment Upgrade →
        </a>

        {/* ── CO₂ Status ── */}
        {usesC02 && (
          <>
            {DIVIDER}
            {SECTION_LABEL('CO₂ Status: Current Tank Level')}
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', maxWidth: 600, marginBottom: 8 }}>
              <div className="card">
                <span className="tag">Tanks in Field</span>
                <div style={{ fontSize: '2.2rem', fontWeight: 900, lineHeight: 1 }}>{tankCount}</div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.45)', marginTop: 6 }}>× 20 lb canisters</div>
              </div>
              <div className="card">
                <span className="tag">Monthly Usage</span>
                <div style={{ fontSize: '2.2rem', fontWeight: 900, lineHeight: 1 }}>{trapCount}</div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.45)', marginTop: 6 }}>
                  tank{trapCount !== 1 ? 's' : ''}/month
                </div>
              </div>
              {nextRefillDate && (
                <div className="card">
                  <span className="tag">Est. Next Refill</span>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800 }}>{fmtDate(nextRefillDate)}</div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(212,230,202,0.4)', marginTop: 6 }}>Approximate</div>
                </div>
              )}
            </div>
          </>
        )}

        {DIVIDER}

        {/* ── Billing ── */}
        {SECTION_LABEL('Billing')}

        {hasOpenInvoice && (
          <div style={{
            background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)',
            borderRadius: 6, padding: '12px 16px', marginBottom: 20,
            fontSize: '0.88rem', color: '#c9a84c',
          }}>
            <strong>Payment due</strong> — click <strong>Pay Now</strong> on the invoice below.
          </div>
        )}

        {subscription && (
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
            <div>
              <span className="tag">Active Plan</span>
              <div style={{ fontWeight: 900, fontSize: '1.2rem' }}>{fmtAmount(subscription.amount)}/{subscription.interval}</div>
              <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.5)', marginTop: 2 }}>
                {subscription.label && `${subscription.label} · `}renews {fmtDate(new Date(subscription.currentPeriodEnd * 1000).toISOString())}
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/customer/billing-portal" className="btn-gold" style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
              Manage payment →
            </a>
          </div>
        )}

        {/* Invoice History */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)' }}>
            Invoice History
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DATE_RANGES.map((r) => (
              <button
                key={r.label}
                onClick={() => setDateRange(r.months)}
                style={{
                  padding: '5px 12px', borderRadius: 4, border: 'none', cursor: 'pointer',
                  fontSize: '0.75rem', fontWeight: 700, fontFamily: 'Nunito Sans, sans-serif',
                  background: dateRange === r.months ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.04)',
                  color: dateRange === r.months ? '#c9a84c' : 'rgba(212,230,202,0.45)',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {filteredInvoices.length === 0 ? (
          <p style={{ color: 'rgba(212,230,202,0.4)', fontSize: '0.88rem' }}>No invoices in this period.</p>
        ) : (
          filteredInvoices.map((inv) => (
            <div key={inv.id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                <div style={{ minWidth: 90 }}>
                  <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.4)' }}>{fmtDateShort(inv.created)}</div>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{inv.number}</div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: INV_STATUS_COLOR[inv.status] || 'rgba(212,230,202,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {inv.status}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <span style={{ fontWeight: 800 }}>
                  {fmtAmount(inv.status === 'open' ? inv.amountDue : (inv.amountPaid || inv.amountDue))}
                </span>
                {inv.hostedUrl && inv.status === 'open' && (
                  <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" style={{ padding: '7px 14px', borderRadius: 4, background: '#7dffaa', color: '#0d1a10', fontWeight: 800, fontSize: '0.78rem', textDecoration: 'none' }}>
                    Pay Now
                  </a>
                )}
                {inv.hostedUrl && inv.status !== 'open' && (
                  <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" className="btn-outline" style={{ fontSize: '0.78rem', padding: '7px 14px' }}>
                    View
                  </a>
                )}
                {inv.pdfUrl && (
                  <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.78rem', color: '#7aab82', fontWeight: 700 }}>
                    PDF
                  </a>
                )}
              </div>
            </div>
          ))
        )}

        {DIVIDER}

        {/* ── Reschedule / Pause ── */}
        {SECTION_LABEL('Service Options')}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          {nextBooking && (
            <a
              href={`mailto:hello@greenguard-usa.com?subject=Reschedule Request&body=Hi, I'd like to reschedule my upcoming visit on ${fmtDate(nextBooking.startTime)}.%0A%0AAccount: ${encodeURIComponent(email)}`}
              style={{ padding: '10px 20px', borderRadius: 6, border: '1px solid rgba(122,171,130,0.3)', color: '#7aab82', fontWeight: 800, fontSize: '0.85rem', textDecoration: 'none' }}
            >
              Reschedule Upcoming Visit
            </a>
          )}
          {subscription && (
            <a
              href={`mailto:hello@greenguard-usa.com?subject=Service Pause Request&body=Hi, I'd like to pause my GreenGuard service temporarily.%0A%0AAccount: ${encodeURIComponent(email)}`}
              style={{ padding: '10px 20px', borderRadius: 6, border: '1px solid rgba(201,168,76,0.3)', color: '#c9a84c', fontWeight: 800, fontSize: '0.85rem', textDecoration: 'none' }}
            >
              Pause Service
            </a>
          )}
        </div>

        {DIVIDER}

        {/* ── Review ── */}
        <div style={{ background: 'rgba(125,255,170,0.04)', border: '1px solid rgba(125,255,170,0.15)', borderRadius: 12, padding: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', marginBottom: 8 }}>⭐</div>
          <div style={{ fontWeight: 900, fontSize: '1rem', marginBottom: 6 }}>Enjoying GreenGuard?</div>
          <p style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.55)', margin: '0 0 16px', lineHeight: 1.5 }}>
            A Google review helps Austin families find a safer, chemical-free mosquito solution.
          </p>
          <a
            href="https://search.google.com/local/writereview?placeid=ChIJx8wLC4K11wwRbfe7hhZiHXs"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-block', padding: '11px 28px', borderRadius: 8, background: '#7dffaa', color: '#0d1a10', fontWeight: 900, fontSize: '0.9rem', textDecoration: 'none' }}
          >
            Leave a Google Review →
          </a>
        </div>

        <div style={{ marginTop: 24 }}>
          <a href="mailto:hello@greenguard-usa.com" style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.4)' }}>
            Questions? Email hello@greenguard-usa.com
          </a>
        </div>
      </PortalLayout>
    </>
  )
}
