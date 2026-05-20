import Head from 'next/head'
import Link from 'next/link'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'
import { getSubscriptions, getInvoices } from '../../lib/stripe'
import { getUpcomingBookingsForEmail } from '../../lib/gcal'
import { findContactByEmail } from '../../lib/hubspot'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }

  const { email, stripeCustomerId } = session

  const [subscriptions, invoices, bookings, contact] = await Promise.all([
    stripeCustomerId ? getSubscriptions(stripeCustomerId) : Promise.resolve([]),
    stripeCustomerId ? getInvoices(stripeCustomerId, 1) : Promise.resolve([]),
    getUpcomingBookingsForEmail(email, 1).catch(() => []),
    findContactByEmail(email).catch(() => null),
  ])

  const nextBooking = bookings[0] || null

  const activeSub = subscriptions[0] || null
  const lastInvoice = invoices[0] || null
  const props = contact?.properties || {}

  return {
    props: {
      email,
      name: [props.firstname, props.lastname].filter(Boolean).join(' ') || null,
      nextBooking: nextBooking ? {
        startTime: nextBooking.startTime,
        title: nextBooking.title,
      } : null,
      subscription: activeSub ? {
        status: activeSub.status,
        currentPeriodEnd: activeSub.current_period_end,
        amount: activeSub.items.data.reduce((s, i) => s + (i.price.unit_amount || 0), 0),
      } : null,
      lastInvoiceStatus: lastInvoice?.status || null,
      trapCount: props.trap_count ? parseInt(props.trap_count, 10) : null,
      systemType: props.system_type || null,
    },
  }
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

function formatAmount(cents) {
  return `$${(cents / 100).toFixed(2)}`
}

export default function Dashboard({ email, name, nextBooking, subscription, lastInvoiceStatus, trapCount, systemType }) {
  return (
    <>
      <Head><title>Dashboard · GreenGuard</title></Head>
      <PortalLayout>
        <div style={{ marginBottom: 32 }}>
          <span className="tag">My Account</span>
          <h1 style={{ fontSize: 'clamp(1.5rem,3vw,2rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
            {name ? `Welcome back, ${name.split(' ')[0]}` : 'Welcome back'}
          </h1>
          <p style={{ fontSize: '0.88rem', color: 'rgba(212,230,202,0.5)', margin: 0 }}>{email}</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {/* Next Visit */}
          <div className="card">
            <span className="tag">Next Visit</span>
            {nextBooking ? (
              <>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: 4 }}>
                  {formatDate(nextBooking.startTime)}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.6)' }}>{nextBooking.title}</div>
              </>
            ) : (
              <div style={{ fontSize: '0.9rem', color: 'rgba(212,230,202,0.5)' }}>No upcoming visits</div>
            )}
            <Link href="/dashboard/schedule" style={{ display: 'block', marginTop: 16, fontSize: '0.8rem', color: '#7aab82', fontWeight: 700 }}>
              View schedule →
            </Link>
          </div>

          {/* My System */}
          <div className="card">
            <span className="tag">My System</span>
            {systemType ? (
              <>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: 4 }}>{systemType}</div>
                {trapCount && (
                  <div style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.6)' }}>
                    {trapCount} trap{trapCount !== 1 ? 's' : ''} active
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: '0.9rem', color: 'rgba(212,230,202,0.5)' }}>System details loading</div>
            )}
            <Link href="/dashboard/equipment" style={{ display: 'block', marginTop: 16, fontSize: '0.8rem', color: '#7aab82', fontWeight: 700 }}>
              View equipment →
            </Link>
          </div>

          {/* Billing */}
          <div className="card">
            <span className="tag">Billing</span>
            {subscription ? (
              <>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: 4 }}>
                  {formatAmount(subscription.amount)}/mo
                </div>
                <div style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.6)' }}>
                  Renews {formatDate(new Date(subscription.currentPeriodEnd * 1000).toISOString())}
                </div>
                {lastInvoiceStatus === 'open' && (
                  <div className="badge" style={{ marginTop: 8 }}>Invoice due</div>
                )}
              </>
            ) : (
              <div style={{ fontSize: '0.9rem', color: 'rgba(212,230,202,0.5)' }}>No active subscription</div>
            )}
            <Link href="/dashboard/billing" style={{ display: 'block', marginTop: 16, fontSize: '0.8rem', color: '#7aab82', fontWeight: 700 }}>
              View invoices →
            </Link>
          </div>
        </div>

        <div style={{ marginTop: 32 }}>
          <a href="mailto:hello@greenguard-usa.com" className="btn-outline" style={{ fontSize: '0.85rem' }}>
            Request a service change
          </a>
        </div>
      </PortalLayout>
    </>
  )
}
