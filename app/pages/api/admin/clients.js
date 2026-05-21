const { getSessionFromRequest } = require('../../../lib/auth')
const { listAllContacts, findContactByEmail, getNotesForContact } = require('../../../lib/hubspot')
const { stripe } = require('../../../lib/stripe')
const { getBookingsForEmail } = require('../../../lib/calcom')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const session = await getSessionFromRequest(req)
  if (!session || session.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { email, list } = req.query

  if (list) {
    // Return full contact list for client list page
    try {
      const contacts = await listAllContacts(200)
      const result = contacts.map((c) => {
        const p = c.properties || {}
        return {
          id: c.id,
          email: p.email,
          name: [p.firstname, p.lastname].filter(Boolean).join(' ') || null,
          systemType: p.system_type || null,
          trapCount: p.trap_count ? parseInt(p.trap_count, 10) : null,
          address: p.address || null,
          customerType: p.customer_type || null,
        }
      }).filter((c) => c.email && c.email !== 'inventory@greenguard-usa.com')
      return res.status(200).json(result)
    } catch (err) {
      console.error('clients list error:', err)
      return res.status(500).json({ error: 'Failed to fetch contacts' })
    }
  }

  if (email) {
    // Return full detail for a single customer
    try {
      const contact = await findContactByEmail(email)
      if (!contact) return res.status(404).json({ error: 'Not found' })

      const p = contact.properties || {}

      // Fetch Stripe data
      let subscriptions = []
      let invoices = []
      let stripeCustomerId = null
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

      // Fetch Cal.com bookings
      let bookings = []
      try {
        bookings = await getBookingsForEmail(email)
      } catch { /* Cal.com not configured */ }

      // Fetch HubSpot notes
      const notes = await getNotesForContact(contact.id, 10)

      // Parse installation map
      let markers = []
      try {
        if (p.installation_map) markers = JSON.parse(p.installation_map).markers || []
      } catch { markers = [] }

      return res.status(200).json({
        id: contact.id,
        email,
        name: [p.firstname, p.lastname].filter(Boolean).join(' ') || null,
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
        subscriptions: subscriptions.map((s) => ({
          id: s.id,
          status: s.status,
          currentPeriodEnd: s.current_period_end,
          amount: s.items.data.reduce((sum, i) => sum + (i.price.unit_amount || 0), 0),
          items: s.items.data.map((i) => ({ sku: i.price.nickname || i.price.id, amount: i.price.unit_amount })),
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
      })
    } catch (err) {
      console.error('clients detail error:', err)
      return res.status(500).json({ error: 'Failed to fetch customer' })
    }
  }

  return res.status(400).json({ error: 'email or list param required' })
}
