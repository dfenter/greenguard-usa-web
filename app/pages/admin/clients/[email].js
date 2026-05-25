import Head from 'next/head'
import Link from 'next/link'
import { useState } from 'react'
import PortalLayout from '../../../components/PortalLayout'
import { getSessionFromRequest } from '../../../lib/auth'
import { findContactByEmail, getNotesForContact } from '../../../lib/hubspot'
import { stripe } from '../../../lib/stripe'
import { getBookingsForEmail } from '../../../lib/calcom'
import { EVENT_TYPES } from '../../../lib/sku-engine'

export async function getServerSideProps({ req, params }) {
  const session = await getSessionFromRequest(req)
  const ADMIN = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'
  if (!session || session.email !== ADMIN) {
    return { redirect: { destination: '/dashboard', permanent: false } }
  }

  const email = decodeURIComponent(params.email)

  const contact = await findContactByEmail(email).catch(() => null)
  if (!contact) return { notFound: true }

  const p = contact.properties || {}

  let subscriptions = [], invoices = [], stripeCustomerId = null
  try {
    const customers = await stripe.customers.search({ query: `email:"${email}"`, limit: 1 })
    if (customers.data.length > 0) {
      stripeCustomerId = customers.data[0].id
      const [subs, invs] = await Promise.all([
        stripe.subscriptions.list({ customer: stripeCustomerId, status: 'all', limit: 5, expand: ['data.items.data.price'] }),
        stripe.invoices.list({ customer: stripeCustomerId, limit: 12 }),
      ])
      subscriptions = subs.data
      invoices = invs.data
    }
  } catch { /* no Stripe customer */ }

  let bookings = []
  try {
    bookings = await getBookingsForEmail(email)
  } catch { /* Cal.com not configured */ }

  const notes = await getNotesForContact(contact.id, 10)

  let markers = []
  try {
    if (p.installation_map) markers = JSON.parse(p.installation_map).markers || []
  } catch { markers = [] }

  const custName = [p.firstname, p.lastname].filter(Boolean).join(' ')

  // Build per-event-type Cal.com booking URLs with customer info pre-filled
  const calBase = (process.env.CALCOM_BASE_URL || 'https://cal.com').replace(/\/$/, '')
  const calUsername = process.env.CALCOM_USERNAME || 'greenguard'
  const calParams = new URLSearchParams()
  if (custName) calParams.set('name', custName)
  calParams.set('email', email)
  if (p.address) calParams.set('notes', p.address)
  const calQueryString = calParams.toString()

  const eventTypeLinks = EVENT_TYPES.map((et) => ({
    title: et.title,
    slug: et.slug,
    price: et.price,
    url: `${calBase}/${calUsername}/${et.slug}?${calQueryString}`,
  }))

  return {
    props: {
      isAdmin: true,
      customer: {
        id: contact.id,
        email,
        name: custName || null,
        phone: p.phone || null,
        address: p.address || null,
        systemType: p.system_type || null,
        trapCount: p.trap_count ? parseInt(p.trap_count, 10) : null,
        tankCount: p.tank_count ? parseInt(p.tank_count, 10) : null,
        hasTimer: p.has_timer === 'true',
        customerType: p.customer_type || null,
        serviceStartDate: p.service_start_date || null,
        lastVisitDate: p.last_visit_date || null,
        stripeCustomerId,
      },
      subscriptions: subscriptions.map((s) => ({
        id: s.id,
        status: s.status,
        currentPeriodEnd: s.current_period_end,
        amount: s.items.data.reduce((sum, i) => sum + (i.price.unit_amount || 0), 0),
      })),
      invoices: invoices.map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        amountPaid: inv.amount_paid,
        amountDue: inv.amount_due,
        created: inv.created,
        hostedUrl: inv.hosted_invoice_url,
      })),
      bookings: bookings.slice(0, 20).map((b) => ({
        id: b.id,
        startTime: b.startTime,
        title: b.title,
        status: b.status,
      })),
      notes: notes.map((n) => ({
        id: n.id,
        body: n.properties?.hs_note_body,
        timestamp: n.properties?.hs_timestamp,
      })),
      markers,
      eventTypeLinks,
    },
  }
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function fmtAmt(cents) {
  if (!cents && cents !== 0) return '—'
  return `$${(cents / 100).toFixed(2)}`
}

const STATUS_COLORS = {
  active: '#7dffaa', paid: '#7dffaa', past_due: '#ff8888', open: '#c9a84c',
  canceled: 'rgba(212,230,202,0.3)', void: 'rgba(212,230,202,0.3)', draft: 'rgba(212,230,202,0.4)',
}

const SERVICE_PLANS = [
  { id: 'bg1-rental',     label: 'Biogents Rental — 1 Trap',  monthly: 159.99, perUnit: false },
  { id: 'bg2-rental',     label: 'Biogents Rental — 2 Traps', monthly: 266.99, perUnit: false },
  { id: 'bg3-rental',     label: 'Biogents Rental — 3 Traps', monthly: 399.99, perUnit: false },
  { id: 'mq-rental',      label: 'Mosqitter Grand Rental',    monthly: 299.99, perUnit: true, unitLabel: 'Mosqitters' },
  { id: 'co2-tank-rental',label: 'CO₂ Tank & Timer Rental',   monthly: 124.99, perUnit: false },
]

export default function ClientDetail({ isAdmin, customer, subscriptions, invoices, bookings, notes, markers, eventTypeLinks }) {
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [selectedSlug, setSelectedSlug] = useState(eventTypeLinks[0]?.slug || '')
  const [planId, setPlanId] = useState('')
  const [planQty, setPlanQty] = useState(1)
  const [startingPlan, setStartingPlan] = useState(false)

  const selectedPlan = SERVICE_PLANS.find((p) => p.id === planId)

  async function startPlan() {
    if (!planId) return
    const monthly = (selectedPlan?.monthly || 0) * (selectedPlan?.perUnit ? planQty : 1)
    if (!window.confirm(`Start ${selectedPlan.label}${selectedPlan.perUnit ? ` × ${planQty}` : ''} for ${customer.name || customer.email}?\n\nMonthly charge: $${monthly.toFixed(2)}\n\nIf they have a card on file Stripe auto-charges monthly. Otherwise emails the hosted invoice link.`)) return
    setStartingPlan(true)
    const res = await fetch('/api/admin/start-plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerEmail: customer.email, customerName: customer.name, planId, quantity: planQty }),
    })
    const j = await res.json().catch(() => ({}))
    setStartingPlan(false)
    if (res.ok) {
      alert(`✓ Plan started\nSubscription ${j.subscriptionId}\nStatus: ${j.status}\nCollection: ${j.collectionMethod}`)
      window.location.reload()
    } else {
      alert(`Failed: ${j.error || 'HTTP ' + res.status}`)
    }
  }

  return (
    <>
      <Head><title>{customer.name || customer.email} · GreenGuard Admin</title></Head>
      <PortalLayout isAdmin={isAdmin}>
        {/* Back link */}
        <div style={{ marginBottom: 20 }}>
          <Link href="/admin/clients" style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.5)', fontWeight: 700 }}>
            ← All Clients
          </Link>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 'clamp(1.3rem,3vw,1.8rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
              {customer.name || customer.email}
            </h1>
            <div style={{ fontSize: '0.88rem', color: 'rgba(212,230,202,0.5)' }}>{customer.email}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href={`/admin/visit-complete?email=${encodeURIComponent(customer.email)}`} className="btn-outline" style={{ fontSize: '0.82rem' }}>
              Log Visit
            </Link>
            <button onClick={() => setScheduleOpen((o) => !o)} className="btn-gold" style={{ fontSize: '0.82rem' }}>
              Schedule Appointment
            </button>
          </div>
        </div>

        {/* Schedule panel */}
        {scheduleOpen && (
          <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 10, padding: '20px', marginBottom: 28 }}>
            <div style={{ fontWeight: 700, marginBottom: 10, color: '#c9a84c' }}>Schedule for {customer.name || customer.email}</div>
            <p style={{ margin: '0 0 14px', fontSize: '0.85rem', color: 'rgba(212,230,202,0.55)' }}>
              Pick a service type — Cal.com opens with name, email, and address pre-filled. The webhook will create Stripe invoice items and update HubSpot automatically after booking.
            </p>
            <div style={{ marginBottom: 14 }}>
              <select
                value={selectedSlug}
                onChange={(e) => setSelectedSlug(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(201,168,76,0.3)',
                  borderRadius: 6, color: '#d4e6ca', fontSize: '0.88rem',
                }}
              >
                {eventTypeLinks.map((et) => (
                  <option key={et.slug} value={et.slug}>
                    {et.title}{et.price ? ` — $${et.price.toFixed(2)}` : ''}
                  </option>
                ))}
              </select>
            </div>
            {(() => {
              const selected = eventTypeLinks.find((et) => et.slug === selectedSlug)
              return selected ? (
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-gold"
                  style={{ fontSize: '0.85rem', display: 'inline-block' }}
                >
                  Open Cal.com →
                </a>
              ) : null
            })()}
          </div>
        )}

        <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          {/* Contact Info */}
          <div className="card">
            <span className="tag">Contact Info</span>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, fontSize: '0.88rem' }}>
              <tbody>
                {[
                  ['Phone', customer.phone],
                  ['Address', customer.address],
                  ['System', customer.systemType],
                  ['Traps', customer.trapCount],
                  ['Tanks', customer.tankCount],
                  ['Timer', customer.hasTimer ? 'Yes' : 'No'],
                  ['Customer type', customer.customerType],
                  ['Service start', fmtDate(customer.serviceStartDate)],
                  ['Last visit', fmtDate(customer.lastVisitDate)],
                ].map(([label, val]) => (
                  <tr key={label}>
                    <td style={{ padding: '5px 12px 5px 0', color: 'rgba(212,230,202,0.45)', whiteSpace: 'nowrap' }}>{label}</td>
                    <td style={{ padding: '5px 0', fontWeight: val ? 600 : 400, color: val ? '#d4e6ca' : 'rgba(212,230,202,0.25)' }}>
                      {val ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Subscription */}
          <div className="card">
            <span className="tag">Subscription</span>
            {subscriptions.length === 0 ? (
              <>
                <div style={{ marginTop: 12, color: 'rgba(212,230,202,0.4)', fontSize: '0.88rem', marginBottom: 14 }}>No Stripe subscription</div>
                <div style={{ background: 'rgba(125,255,170,0.05)', border: '1px solid rgba(125,255,170,0.2)', borderRadius: 8, padding: 14 }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7dffaa', marginBottom: 10 }}>Start a Service Plan</div>
                  <select value={planId} onChange={(e) => setPlanId(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid rgba(122,171,130,0.3)', background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.88rem', fontFamily: 'Nunito Sans, sans-serif', marginBottom: 10 }}>
                    <option value="">— Pick a plan —</option>
                    {SERVICE_PLANS.map((p) => (
                      <option key={p.id} value={p.id}>{p.label} — ${p.monthly.toFixed(2)}/mo{p.perUnit ? ' · per unit' : ''}</option>
                    ))}
                  </select>
                  {selectedPlan?.perUnit && (
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.5)', fontWeight: 700, marginRight: 8 }}>
                        {selectedPlan.unitLabel || 'Units'}:
                      </label>
                      <input type="number" min="1" value={planQty} onChange={(e) => setPlanQty(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{ width: 70, padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(122,171,130,0.3)', background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontWeight: 700 }} />
                      <span style={{ marginLeft: 10, fontSize: '0.85rem', color: '#7dffaa', fontWeight: 700 }}>
                        = ${(selectedPlan.monthly * planQty).toFixed(2)}/mo
                      </span>
                    </div>
                  )}
                  <button onClick={startPlan} disabled={!planId || startingPlan}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: 'none', background: planId ? '#7dffaa' : 'rgba(125,255,170,0.2)', color: '#0d1a10', fontWeight: 900, cursor: planId ? 'pointer' : 'not-allowed', fontSize: '0.88rem', fontFamily: 'Nunito Sans, sans-serif' }}>
                    {startingPlan ? 'Starting…' : 'Start Plan'}
                  </button>
                </div>
              </>
            ) : subscriptions.map((s) => (
              <div key={s.id} style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>{fmtAmt(s.amount)}/mo</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: STATUS_COLORS[s.status] || '#d4e6ca', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 4 }}>
                    {s.status}
                  </span>
                </div>
                <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.5)' }}>
                  Next billing: {fmtDate(new Date(s.currentPeriodEnd * 1000).toISOString())}
                </div>
              </div>
            ))}
            {markers.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(122,171,130,0.12)' }}>
                <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.45)', marginBottom: 6 }}>Installation Map</div>
                <div style={{ fontSize: '0.85rem', marginBottom: 8 }}>{markers.length} trap{markers.length !== 1 ? 's' : ''} mapped</div>
                <Link href={`/admin/map`} style={{ fontSize: '0.8rem', color: '#7aab82', fontWeight: 700 }}>
                  Edit map →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Invoices */}
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(212,230,202,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
            Invoice History ({invoices.length})
          </div>
          {invoices.length === 0 ? (
            <div style={{ color: 'rgba(212,230,202,0.35)', fontSize: '0.88rem' }}>No invoices</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    {['Number', 'Date', 'Amount', 'Status', ''].map((h) => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: 'rgba(212,230,202,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid rgba(122,171,130,0.12)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} style={{ borderBottom: '1px solid rgba(122,171,130,0.07)' }}>
                      <td style={{ padding: '10px 12px', color: 'rgba(212,230,202,0.6)' }}>{inv.number || '—'}</td>
                      <td style={{ padding: '10px 12px' }}>{fmtDate(new Date(inv.created * 1000).toISOString())}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 700 }}>
                        {inv.status === 'paid' ? fmtAmt(inv.amountPaid) : fmtAmt(inv.amountDue)}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: STATUS_COLORS[inv.status] || '#d4e6ca' }}>
                          {inv.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {inv.hostedUrl && (
                          <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.78rem', color: '#7aab82', fontWeight: 700 }}>
                            {inv.status === 'open' ? 'Pay →' : 'View →'}
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Appointment history */}
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(212,230,202,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
            Appointment History ({bookings.length})
          </div>
          {bookings.length === 0 ? (
            <div style={{ color: 'rgba(212,230,202,0.35)', fontSize: '0.88rem' }}>No Cal.com bookings found</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {bookings.map((b) => (
                <div key={b.id} style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(122,171,130,0.1)', borderRadius: 6, fontSize: '0.85rem' }}>
                  <div style={{ color: 'rgba(212,230,202,0.55)', whiteSpace: 'nowrap', minWidth: 120 }}>{fmtDateTime(b.startTime)}</div>
                  <div style={{ flex: 1, fontWeight: 600 }}>{b.title}</div>
                  <div style={{ fontSize: '0.78rem', color: STATUS_COLORS[b.status] || 'rgba(212,230,202,0.45)' }}>{b.status}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* HubSpot Notes */}
        {notes.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(212,230,202,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
              Notes
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {notes.map((n) => (
                <div key={n.id} className="card" style={{ padding: '14px 16px' }}>
                  <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.4)', marginBottom: 6 }}>
                    {fmtDateTime(n.timestamp)}
                  </div>
                  <div style={{ fontSize: '0.87rem', whiteSpace: 'pre-wrap', color: 'rgba(212,230,202,0.8)' }}>{n.body}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </PortalLayout>
    </>
  )
}
