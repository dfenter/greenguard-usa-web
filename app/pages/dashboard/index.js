import Head from 'next/head'
import Link from 'next/link'
import { useState } from 'react'
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

  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'
  const isAdmin = email === ADMIN_EMAIL

  return {
    props: {
      email,
      isAdmin,
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

function ServiceRequestForm({ email }) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState(null) // null | 'sending' | 'sent' | 'error'

  async function handleSubmit(e) {
    e.preventDefault()
    if (!message.trim()) return
    setStatus('sending')
    try {
      const res = await fetch('/api/customer/request-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      setStatus(res.ok ? 'sent' : 'error')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div style={{ marginTop: 32, padding: '14px 20px', background: 'rgba(125,255,170,0.08)', border: '1px solid rgba(125,255,170,0.2)', borderRadius: 8, fontSize: '0.9rem', color: '#7dffaa', fontWeight: 700 }}>
        ✓ Request sent — we&apos;ll be in touch within 24 hours.
      </div>
    )
  }

  return (
    <div style={{ marginTop: 32 }}>
      {!open ? (
        <button onClick={() => setOpen(true)} className="btn-outline" style={{ fontSize: '0.85rem' }}>
          Request Service
        </button>
      ) : (
        <form onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 10, color: '#d4e6ca' }}>Describe what you need</div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="E.g. I need my CO₂ tanks refilled sooner, or I'd like to add a trap…"
            style={{
              width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(122,171,130,0.25)', borderRadius: 6,
              color: '#d4e6ca', fontSize: '0.9rem', fontFamily: 'inherit',
              resize: 'vertical', boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button type="submit" disabled={status === 'sending' || !message.trim()} className="btn-gold" style={{ fontSize: '0.85rem' }}>
              {status === 'sending' ? 'Sending…' : 'Send Request'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn-outline" style={{ fontSize: '0.85rem' }}>
              Cancel
            </button>
          </div>
          {status === 'error' && (
            <div style={{ marginTop: 10, color: '#ff8888', fontSize: '0.85rem' }}>Something went wrong — please email hello@greenguard-usa.com directly.</div>
          )}
        </form>
      )}
    </div>
  )
}

export default function Dashboard({ email, isAdmin, name, nextBooking, subscription, lastInvoiceStatus, trapCount, systemType }) {
  return (
    <>
      <Head><title>Dashboard · GreenGuard</title></Head>
      <PortalLayout isAdmin={isAdmin}>
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

        <ServiceRequestForm email={email} />
      </PortalLayout>
    </>
  )
}
