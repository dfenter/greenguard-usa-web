const { getSessionFromRequest } = require('../../../lib/auth')
const { getSubscriptions, getInvoices } = require('../../../lib/stripe')
const { findContactByEmail } = require('../../../lib/hubspot')

export default async function handler(req, res) {
  const session = await getSessionFromRequest(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })

  const { email, stripeCustomerId } = session

  const [subscriptions, invoices, hubspotContact] = await Promise.all([
    stripeCustomerId ? getSubscriptions(stripeCustomerId) : [],
    stripeCustomerId ? getInvoices(stripeCustomerId, 6) : [],
    findContactByEmail(email),
  ])

  const contact = hubspotContact?.properties || {}

  res.status(200).json({
    email,
    name: [contact.firstname, contact.lastname].filter(Boolean).join(' ') || null,
    phone: contact.phone || null,
    address: contact.address || null,
    customerType: contact.customer_type || null,
    systemType: contact.system_type || null,
    trapCount: contact.trap_count ? parseInt(contact.trap_count, 10) : null,
    stripeCustomerId,
    subscriptions: subscriptions.map((s) => ({
      id: s.id,
      status: s.status,
      currentPeriodEnd: s.current_period_end,
      items: s.items.data.map((i) => ({
        priceId: i.price.id,
        nickname: i.price.nickname,
        amount: i.price.unit_amount,
        interval: i.price.recurring?.interval,
      })),
    })),
    invoices: invoices.map((inv) => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      amountPaid: inv.amount_paid,
      amountDue: inv.amount_due,
      created: inv.created,
      hostedUrl: inv.hosted_invoice_url,
      pdfUrl: inv.invoice_pdf,
    })),
  })
}
