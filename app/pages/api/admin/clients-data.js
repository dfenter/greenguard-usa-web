import { requireAdmin } from '../../../lib/auth'
import { listAllCustomers } from '../../../lib/stripe'
import { getAllContacts } from '../../../lib/hubspot'

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return
  if (req.method !== 'GET') return res.status(405).end()

  res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=120')

  const [raw, hubspotContacts] = await Promise.all([
    listAllCustomers().catch(() => []),
    getAllContacts(300).catch(() => []),
  ])

  const hsAddressByEmail = {}
  hubspotContacts.forEach((c) => {
    const email = (c.properties?.email || '').toLowerCase()
    if (email && c.properties?.address) hsAddressByEmail[email] = c.properties.address
  })

  const lastName = (name) => (name || '').trim().split(/\s+/).pop() || name

  const customers = raw.map((c) => {
    const subs = c.subscriptions?.data || []
    const activeSub = subs.find((s) => s.status === 'active') || subs[0] || null
    const mrr = activeSub ? activeSub.items.data.reduce((sum, i) => sum + (i.price.unit_amount || 0), 0) : 0
    const planLabel = activeSub ? activeSub.items.data.map((i) => i.price.nickname || i.price.id).filter(Boolean).join(' + ') : null
    const email = (c.email || '').toLowerCase()
    return {
      id: c.id,
      name: c.name || '',
      email: c.email || '',
      phone: c.phone || '',
      status: activeSub?.status || 'inactive',
      plan: planLabel,
      mrr,
      address: hsAddressByEmail[email] || '',
    }
  }).sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)))

  const stripeEmails = new Set(raw.map((c) => (c.email || '').toLowerCase()).filter(Boolean))
  const prospects = hubspotContacts
    .filter((c) => {
      const email = (c.properties?.email || '').toLowerCase()
      const name = [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(' ')
      if (!name) return false
      return !email || !stripeEmails.has(email)
    })
    .map((c) => ({
      id: `hs_${c.id}`,
      hsId: c.id,
      name: [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(' '),
      email: c.properties?.email || '',
      phone: c.properties?.phone || '',
      address: c.properties?.address || '',
      systemType: c.properties?.system_type || '',
      status: 'prospect',
      plan: null,
      mrr: 0,
    }))

  const combined = [...customers, ...prospects].sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)))

  res.json({ customers: combined })
}
