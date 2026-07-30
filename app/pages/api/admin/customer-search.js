const { requireAdmin } = require('../../../lib/auth')
const { cached } = require('../../../lib/cache')
const { listAllCustomers } = require('../../../lib/stripe')
const { getAllContacts } = require('../../../lib/hubspot')

function normalizeCustomer(c) {
  return {
    id: c.id,
    name: c.name || '',
    email: c.email || '',
    phone: c.phone || '',
    address: c.address?.line1 || c.address || '',
    source: 'customer',
  }
}

async function loadSearchDataset() {
  return cached('admin:customer-search:dataset', 60, async () => {
    const [stripeRaw, hsContacts] = await Promise.all([
      listAllCustomers(),
      getAllContacts(1000),
    ])
    const hsByEmail = new Map(hsContacts
      .filter((c) => c.properties?.email)
      .map((c) => [c.properties.email.toLowerCase(), c.properties]))
    const stripeCustomers = stripeRaw
      .map(normalizeCustomer)
      .filter((c) => c.email || c.name)
      .map((c) => {
        // Assessment prospects get bare Stripe records; fall back to HubSpot
        const hs = hsByEmail.get(c.email.toLowerCase())
        if (!hs) return c
        return {
          ...c,
          phone: c.phone || hs.phone || '',
          address: c.address || hs.address || '',
        }
      })
    const stripeEmails = new Set(stripeCustomers.map((c) => c.email.toLowerCase()).filter(Boolean))
    const prospects = hsContacts
      .filter((c) => {
        const email = (c.properties?.email || '').toLowerCase()
        const name = [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(' ')
        return (name || email) && (!email || !stripeEmails.has(email))
      })
      .map((c) => ({
        id: `hs_${c.id}`,
        name: [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(' '),
        email: c.properties?.email || '',
        phone: c.properties?.phone || '',
        address: c.properties?.address || '',
        source: 'prospect',
      }))
    return [...stripeCustomers, ...prospects]
  })
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return
  if (req.method !== 'GET') return res.status(405).end()

  const query = String(req.query.q || '').trim()
  if (query.length < 2) return res.status(200).json({ customers: [] })

  try {
    const customers = await loadSearchDataset()
    const q = query.toLowerCase()
    const qDigits = q.replace(/\D/g, '')
    const matches = customers.filter((c) =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.address || '').toLowerCase().includes(q) ||
      (qDigits.length >= 3 && (c.phone || '').replace(/\D/g, '').includes(qDigits))
    ).slice(0, 10)
    res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=60')
    return res.status(200).json({ customers: matches })
  } catch (err) {
    console.error('[customer-search]', err.message)
    return res.status(502).json({ error: 'Customer search unavailable' })
  }
}
