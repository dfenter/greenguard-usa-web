import { requireAdmin } from '../../../lib/auth'
import { listAllCustomers } from '../../../lib/stripe'
import { getAllContacts } from '../../../lib/hubspot'

// Lazy data for /admin/invoice — moved out of getServerSideProps so the page
// shell renders instantly and the customer list fills in client-side.
export default async function handler(req, res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return
  if (req.method !== 'GET') return res.status(405).end()
  res.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=30')

  const [raw, hsContacts] = await Promise.all([
    listAllCustomers().catch(() => []),
    getAllContacts(200).catch(() => []),
  ])

  const stripeEmails = new Set(raw.map((c) => (c.email || '').toLowerCase()).filter(Boolean))

  // Merge Stripe customers + HubSpot-only contacts (prospects)
  const stripeList = raw.map((c) => ({ id: c.id, name: c.name || '', email: c.email || '', source: 'stripe' }))

  const hsList = hsContacts
    .filter((c) => {
      const email = (c.properties?.email || '').toLowerCase()
      return email && !stripeEmails.has(email)
    })
    .map((c) => ({
      id: `hs_${c.id}`,
      name: [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(' '),
      email: c.properties?.email || '',
      source: 'hubspot',
    }))

  const customers = [...stripeList, ...hsList]
    .filter((c) => c.name || c.email)
    .sort((a, b) => {
      const ln = (n) => n.trim().split(/\s+/).pop() || n
      return ln(a.name || a.email).localeCompare(ln(b.name || b.email))
    })

  res.status(200).json({ customers })
}
