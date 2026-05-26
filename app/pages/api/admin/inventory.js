const { requireAdmin } = require('../../../lib/auth')
const { upsertContact, addNote, findContactByEmail, getNotesForContact } = require('../../../lib/hubspot')
const { sendInventoryReport } = require('../../../lib/email')

const INVENTORY_EMAIL = 'inventory@greenguard-usa.com'

const FIELD_LABELS = {
  fullTanks: 'Full CO₂ tanks',
  emptyTanks: 'Empty CO₂ tanks',
  damagedTanks: 'Damaged CO₂ tanks',
  bgTraps: 'Biogents traps in stock',
  mosqitterUnits: 'Mosqitter units in stock',
  timers: 'Timers in stock',
  baitStations: 'Bait stations in stock',
}

async function getOrCreateInventoryContact() {
  let contact = await findContactByEmail(INVENTORY_EMAIL).catch(() => null)
  if (!contact) {
    await upsertContact({ email: INVENTORY_EMAIL, name: 'GreenGuard Inventory Tracker', metadata: {} })
    contact = await findContactByEmail(INVENTORY_EMAIL)
  }
  return contact
}

export default async function handler(req, res) {
  const session = await requireAdmin(req, res)
  if (!session) return

  if (req.method === 'GET') {
    try {
      const contact = await getOrCreateInventoryContact()
      const notes = await getNotesForContact(contact.id, 30)
      return res.status(200).json(notes)
    } catch (err) {
      console.error('inventory GET error:', err)
      return res.status(500).json({ error: 'Failed to fetch history' })
    }
  }

  if (req.method === 'POST') {
    const { counts = {}, notes = '' } = req.body || {}

    try {
      const contact = await getOrCreateInventoryContact()

      // Build note body
      const dateStr = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })
      const lines = [
        `Date: ${dateStr} CT`,
        ...Object.entries(FIELD_LABELS).map(([key, label]) => `${label}: ${counts[key] ?? 0}`),
      ]
      if (notes) lines.push(`Notes: ${notes}`)
      const noteBody = lines.join('\n')

      await addNote(contact.id, noteBody)
      await sendInventoryReport(ADMIN_EMAIL, counts, notes)

      return res.status(200).json({ success: true })
    } catch (err) {
      console.error('inventory POST error:', err)
      return res.status(500).json({ error: 'Failed to log inventory' })
    }
  }

  res.status(405).end()
}
