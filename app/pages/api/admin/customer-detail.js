const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { stripe } = require('../../../lib/stripe')
const { findContactByEmail, getContactNotes } = require('../../../lib/hubspot')
const { getUpcomingBookingsForEmail, getPastBookingsForEmail } = require('../../../lib/gcal')
const { getBookingsForEmail } = require('../../../lib/calcom')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export default async function handler(req, res) {
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const { customerId } = req.query
  if (!customerId) return res.status(400).json({ error: 'customerId required' })

  const [stripeCustomer, stripeInvoices] = await Promise.all([
    stripe.customers.retrieve(customerId, { expand: ['subscriptions.data.items.data'] }),
    stripe.invoices.list({ customer: customerId, limit: 10 }),
  ])

  if (!stripeCustomer || stripeCustomer.deleted) return res.status(404).json({ error: 'Customer not found' })

  const email = stripeCustomer.email || null

  // All email-dependent lookups — skip safely if no email on file
  const [hubspotContact, upcoming, past] = await Promise.all([
    email ? findContactByEmail(email).catch(() => null) : Promise.resolve(null),
    email ? getUpcomingBookingsForEmail(email, 50).catch(() => []) : Promise.resolve([]),
    email ? getPastBookingsForEmail(email, 50).catch(() => []) : Promise.resolve([]),
  ])

  let calBookings = []
  if (email) {
    try { calBookings = await getBookingsForEmail(email, new Date().toISOString()) } catch {}
  }

  // Attach Cal.com uid to next upcoming booking if we can match by time
  const nextBooking = upcoming[0] || null
  let nextCalBooking = null
  if (nextBooking && calBookings.length > 0) {
    const match = calBookings.find((cb) =>
      Math.abs(new Date(cb.startTime) - new Date(nextBooking.startTime)) < 300000 // 5 min tolerance
    )
    if (match) nextCalBooking = { id: match.id, uid: match.uid, title: match.title }
  }

  const notes = hubspotContact?.id ? await getContactNotes(hubspotContact.id, 20).catch(() => []) : []
  const p = hubspotContact?.properties || {}
  const m = stripeCustomer.metadata || {}

  const subs = stripeCustomer.subscriptions?.data || []
  const activeSub = subs.find((s) => s.status === 'active') || subs[0] || null

  res.status(200).json({
    id: customerId,
    hubspotContactId: hubspotContact?.id || null,
    name: stripeCustomer.name || [p.firstname, p.lastname].filter(Boolean).join(' ') || '',
    email,
    phone: stripeCustomer.phone || p.phone || '',
    address: stripeCustomer.address?.line1 || p.address || '',
    // plan
    subscription: activeSub ? {
      status: activeSub.status,
      amount: activeSub.items.data.reduce((s, i) => s + (i.price?.unit_amount || 0), 0),
      interval: activeSub.items.data[0]?.price?.recurring?.interval || 'month',
      label: activeSub.items.data.map((i) => i.price?.nickname || i.price?.id).filter(Boolean).join(' + '),
    } : null,
    // invoices (outstanding only in panel)
    openInvoices: stripeInvoices.data
      .filter((inv) => inv.status === 'open')
      .map((inv) => ({
        id: inv.id,
        number: inv.number,
        amountDue: inv.amount_due,
        created: inv.created,
        hostedUrl: inv.hosted_invoice_url,
      })),
    // appointments
    nextBooking: nextBooking ? { ...nextBooking, calBookingId: nextCalBooking?.id || null, calBookingUid: nextCalBooking?.uid || null } : null,
    upcomingBookings: upcoming.map((b) => ({ id: b.id, startTime: b.startTime, title: b.title, address: b.address, rescheduleUrl: b.rescheduleUrl })),
    pastBookings: past.map((b) => ({ id: b.id, startTime: b.startTime, title: b.title, address: b.address })),
    // system info — HubSpot properties with Stripe metadata fallback
    planType: p.plan_type || m.plan_type || null,
    systemType: p.system_type || m.system_type || null,
    trapCount: parseInt(p.trap_count || m.trap_count || '0', 10) || null,
    tankCount: parseInt(p.tank_count || m.tank_count || '0', 10) || null,
    hasTimer: (p.has_timer === 'true' || m.has_timer === 'true') && (p.system_type || m.system_type) === 'Biogents-CO2',
    notes,
  })
}
