const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { listAllDraftInvoices } = require('../../../lib/stripe')
const { getBookingsForDateRange } = require('../../../lib/gcal')

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const now = new Date()
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const [rawDrafts, gcalBookings] = await Promise.all([
    listAllDraftInvoices(),
    getBookingsForDateRange(sevenDaysAgo.toISOString(), now.toISOString()),
  ])

  const drafts = rawDrafts.map(inv => ({
    id: inv.id,
    customerName: inv.customer?.name || '',
    customerEmail: inv.customer?.email || inv.customer_email || '',
    amountDue: inv.amount_due,
    serviceDate: inv.metadata?.service_date || '',
    lineCount: inv.lines?.data?.length || 0,
    hostedUrl: inv.hosted_invoice_url,
  }))

  // Build covered set: email+date combos that already have a draft/open/paid invoice
  const covered = new Set(rawDrafts.map(inv => {
    const email = (inv.customer?.email || inv.customer_email || '').toLowerCase()
    const date = inv.metadata?.service_date || ''
    return email && date ? `${email}|${date}` : null
  }).filter(Boolean))

  const needsInvoice = gcalBookings.filter(b => {
    if (!b.email || !b.dateStr) return false
    return !covered.has(`${b.email.toLowerCase()}|${b.dateStr}`)
  }).map(b => ({
    date: b.dateStr,
    customerName: b.name,
    email: b.email,
    serviceType: b.title,
  }))

  return res.status(200).json({ drafts, needsInvoice })
}
