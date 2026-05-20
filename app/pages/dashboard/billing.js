import Head from 'next/head'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'
import { getSubscriptions, getInvoices } from '../../lib/stripe'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }

  const isAdmin = session.email === 'admin@greenguard-usa.com'

  if (!session.stripeCustomerId) {
    return { props: { subscriptions: [], invoices: [], isAdmin } }
  }

  const [subscriptions, invoices] = await Promise.all([
    getSubscriptions(session.stripeCustomerId),
    getInvoices(session.stripeCustomerId, 24),
  ])

  return {
    props: {
      subscriptions: subscriptions.map((s) => ({
        id: s.id,
        status: s.status,
        currentPeriodEnd: s.current_period_end,
        amount: s.items.data.reduce((sum, i) => sum + (i.price.unit_amount || 0), 0),
        interval: s.items.data[0]?.price.recurring?.interval || 'month',
        label: s.items.data.map((i) => i.price.nickname || i.price.id).join(', '),
      })),
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
      isAdmin,
    },
  }
}

const STATUS_COLORS = {
  paid: '#7dffaa',
  open: '#c9a84c',
  void: 'rgba(212,230,202,0.35)',
  uncollectible: '#ff6b6b',
}

function fmtAmount(cents) {
  return `$${(cents / 100).toFixed(2)}`
}

function fmtDate(unix) {
  return new Date(unix * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Billing({ subscriptions, invoices, isAdmin }) {
  const sub = subscriptions[0]

  return (
    <>
      <Head><title>Billing · GreenGuard</title></Head>
      <PortalLayout title="Billing" isAdmin={isAdmin}>
        {/* Current plan */}
        {sub && (
          <div className="card" style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <span className="tag">Active Plan</span>
              <div style={{ fontWeight: 900, fontSize: '1.3rem' }}>{fmtAmount(sub.amount)}/{sub.interval}</div>
              <div style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.55)', marginTop: 4 }}>
                {sub.label} · renews {fmtDate(sub.currentPeriodEnd)}
              </div>
            </div>
            <a href="/api/customer/billing-portal" className="btn-gold" style={{ whiteSpace: 'nowrap' }}>
              Manage payment method
            </a>
          </div>
        )}

        {/* Unpaid banner */}
        {invoices.some((inv) => inv.status === 'open') && (
          <div style={{
            background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.3)',
            borderRadius: 6, padding: '12px 16px', marginBottom: 24,
            fontSize: '0.88rem', color: '#c9a84c', display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontWeight: 800 }}>Payment due —</span> click <strong>Pay Now</strong> on the invoice below to resolve it.
          </div>
        )}

        {/* Invoice list */}
        <h2 style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c9a84c', marginBottom: 16 }}>
          Invoice History
        </h2>

        {invoices.length === 0 && (
          <p style={{ color: 'rgba(212,230,202,0.5)', fontSize: '0.9rem' }}>No invoices yet.</p>
        )}

        {invoices.map((inv) => (
          <div key={inv.id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              <div style={{ minWidth: 80 }}>
                <div style={{ fontSize: '0.8rem', color: 'rgba(212,230,202,0.45)' }}>{fmtDate(inv.created)}</div>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{inv.number}</div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: STATUS_COLORS[inv.status] || 'rgba(212,230,202,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {inv.status}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                {fmtAmount(inv.status === 'open' ? inv.amountDue : inv.amountPaid || inv.amountDue)}
              </span>
              {inv.hostedUrl && inv.status === 'open' && (
                <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" style={{
                  fontSize: '0.78rem', padding: '8px 14px', borderRadius: 4,
                  background: '#7dffaa', color: '#0d1a10', fontWeight: 800,
                  textDecoration: 'none', whiteSpace: 'nowrap',
                }}>
                  Pay Now
                </a>
              )}
              {inv.hostedUrl && inv.status !== 'open' && (
                <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" className="btn-outline" style={{ fontSize: '0.78rem', padding: '8px 14px' }}>
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
        ))}
      </PortalLayout>
    </>
  )
}
