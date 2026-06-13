import { requireAdmin } from '../../../lib/auth'
import { findContactByEmail, addNote, getContactNotes } from '../../../lib/hubspot'

const TECH_EMAIL = 'bruce@greenguard-usa.com'
const TAG = '[TECH-NOTE]'
const TAG_RE = /^\[TECH-NOTE\]\s*/

async function getTechContactId() {
  const contact = await findContactByEmail(TECH_EMAIL)
  return contact?.id || null
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res)
  if (!admin) return

  if (req.method === 'GET') {
    const contactId = await getTechContactId()
    if (!contactId) return res.json({ notes: [] })

    const raw = await getContactNotes(contactId, 50).catch(() => [])
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const notes = raw
      .filter((n) => TAG_RE.test((n.body || '').trim()))
      .filter((n) => !n.timestamp || new Date(n.timestamp).getTime() >= oneWeekAgo)
      .map((n) => ({
        id: n.id,
        body: n.body.trim().replace(TAG_RE, ''),
        timestamp: n.timestamp || null,
      }))
    return res.json({ notes })
  }

  if (req.method === 'POST') {
    const { body } = req.body
    if (!body?.trim()) return res.status(400).json({ error: 'body required' })

    const contactId = await getTechContactId()
    if (!contactId) return res.status(500).json({ error: 'Tech contact not found in HubSpot' })

    await addNote(contactId, `${TAG} ${body.trim()}`)
    return res.json({ ok: true })
  }

  return res.status(405).end()
}
