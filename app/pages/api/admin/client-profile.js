const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { findContactByEmail, getContactNotes } = require('../../../lib/hubspot')
const { stripe } = require('../../../lib/stripe')

export default async function handler(req, res) {
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const { email } = req.query
  if (!email) return res.status(400).json({ error: 'email required' })

  const [contact, stripeResult] = await Promise.all([
    findContactByEmail(email).catch(() => null),
    stripe.customers.search({ query: `email:"${email}"`, limit: 1 })
      .then(r => r.data[0] || null).catch(() => null),
  ])

  if (!contact) return res.status(404).json({ error: 'Contact not found' })

  const p = contact.properties || {}

  const [notes, invoices] = await Promise.all([
    getContactNotes(contact.id, 10).catch(() => []),
    stripeResult
      ? stripe.invoices.list({ customer: stripeResult.id, limit: 8 })
          .then(r => r.data).catch(() => [])
      : Promise.resolve([]),
  ])

  res.status(200).json({
    name: [p.firstname, p.lastname].filter(Boolean).join(' ') || stripeResult?.name || null,
    email,
    phone: p.phone || stripeResult?.phone || null,
    address: p.address || stripeResult?.address?.line1 || null,
    systemType: p.system_type || null,
    trapCount: p.trap_count ? parseInt(p.trap_count, 10) : null,
    tankCount: p.tank_count ? parseInt(p.tank_count, 10) : null,
    hasTimer: p.has_timer === 'true',
    customerType: p.customer_type || null,
    serviceStartDate: p.service_start_date || null,
    lastVisitDate: p.last_visit_date || null,
    propertyNotes: p.property_notes || null,
    notes: notes.map(n => ({
      id: n.id,
      body: n.properties?.hs_note_body || n.body || '',
      timestamp: n.properties?.hs_timestamp || null,
    })),
    invoices: invoices.map(inv => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      amountPaid: inv.amount_paid,
      amountDue: inv.amount_due,
      created: inv.created,
      hostedUrl: inv.hosted_invoice_url,
    })),
  })
}
