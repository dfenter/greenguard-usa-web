import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'
import { stripe } from '../../lib/stripe'
import { findContactByEmail } from '../../lib/hubspot'
import Link from 'next/link'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }

  const email = session.email

  // Fetch all invoices for this customer
  let invoices = []
  try {
    const customers = await stripe.customers.search({ query: `email:"${email}"`, limit: 1 })
    const customer = customers.data[0]
    if (customer) {
      const invList = await stripe.invoices.list({ customer: customer.id, limit: 100 })
      invoices = invList.data
        .filter(inv => inv.status !== 'void' && inv.amount_paid > 0)
        .map(inv => ({
          id: inv.id,
          date: inv.status_transitions?.paid_at || inv.created,
          amount: inv.amount_paid / 100,
          status: inv.status,
          description: inv.lines?.data?.[0]?.description || 'Service',
          hostedUrl: inv.hosted_invoice_url || null,
          pdfUrl: inv.invoice_pdf || null,
          serviceDate: inv.metadata?.service_date || null,
        }))
        .sort((a, b) => b.date - a.date)
    }
  } catch (e) {
    console.error('history invoices:', e.message)
  }

  // Fetch HubSpot visit notes
  let visitNotes = []
  try {
    const contact = await findContactByEmail(email)
    if (contact?.id) {
      const { getContactNotes } = require('../../lib/hubspot')
      const notes = await getContactNotes(contact.id, 50)
      visitNotes = notes
        .filter(n => n.body?.startsWith('TECHNICIAN VISIT COMPLETED'))
        .slice(0, 20)
        .map(n => {
          const dateMatch = n.body.match(/Date: ([^\n]+)/)
          const notesMatch = n.body.match(/Notes: ([^\n]+)/)
          const itemsMatch = n.body.match(/Items: ([^\n]+)/)
          return {
            date: dateMatch?.[1] || '',
            notes: notesMatch?.[1] || '',
            items: itemsMatch?.[1] || '',
            timestamp: n.timestamp,
          }
        })
    }
  } catch (e) {}

  return { props: { invoices, visitNotes } }
}

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtDateStr(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return s }
}
function fmt$(n) { return `$${Number(n).toFixed(2)}` }

const card = { background: 'var(--bg-card)', border: '1px solid rgba(var(--border-rgb),0.18)', borderRadius: 12, padding: '16px 20px', marginBottom: 12 }
const label = { fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 12 }

export default function HistoryPage({ invoices, visitNotes }) {
  return (
    <PortalLayout title="Service History">
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 28 }}>
          Your complete service and billing record.
        </p>

        {/* Visit history */}
        {visitNotes.length > 0 && (
          <>
            <div style={label}>Visit Log</div>
            {visitNotes.map((v, i) => (
              <div key={i} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: 4 }}>{v.date || fmtDateStr(v.timestamp)}</div>
                    {v.items && <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 2 }}>{v.items}</div>}
                    {v.notes && v.notes !== 'None' && v.notes !== 'No notes were entered for this visit.' && (
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 4 }}>&ldquo;{v.notes}&rdquo;</div>
                    )}
                  </div>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--green)', background: 'rgba(var(--green-rgb),0.08)', border: '1px solid rgba(var(--green-rgb),0.2)', padding: '3px 8px', borderRadius: 4, flexShrink: 0 }}>Completed</span>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Invoice history */}
        {invoices.length > 0 && (
          <>
            <div style={{ ...label, marginTop: visitNotes.length > 0 ? 24 : 0 }}>Payment History ({invoices.length} invoices)</div>
            {invoices.map(inv => (
              <div key={inv.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{fmtDate(inv.date)}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginTop: 2 }}>{inv.description?.replace(' (first month)', '')}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 900, fontSize: '1rem', color: 'var(--green)' }}>{fmt$(inv.amount)}</div>
                    {(inv.pdfUrl || inv.hostedUrl) && (
                      <a href={inv.pdfUrl || inv.hostedUrl} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textDecoration: 'underline' }}>
                        View receipt
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {invoices.length === 0 && visitNotes.length === 0 && (
          <div style={{ ...card, textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
            No service history yet. Check back after your first visit.
          </div>
        )}

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <Link href="/dashboard" style={{ color: 'var(--text-dim)', fontSize: '0.82rem', textDecoration: 'none' }}>
            ← Back to My Account
          </Link>
        </div>
      </div>
    </PortalLayout>
  )
}
