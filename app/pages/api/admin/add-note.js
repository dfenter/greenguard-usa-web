// Append a free-form note to a HubSpot contact's timeline.
// Body: { contactId, email?, body }. Either contactId or email must be set.

const { requireAdmin } = require('../../../lib/auth')
const { addNote, findContactByEmail, upsertContact } = require('../../../lib/hubspot')

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await requireAdmin(req, res)
  if (!session) return

  const { contactId: rawId, email, body } = req.body || {}
  const text = (body || '').trim()
  if (!text) return res.status(400).json({ error: 'note body required' })

  let contactId = rawId
  if (!contactId && email) {
    const c = await findContactByEmail(email).catch(() => null)
    if (c?.id) contactId = c.id
    else {
      // Auto-create a HubSpot contact if missing so the note has somewhere to go.
      const created = await upsertContact({ email, name: '' })
      contactId = created.id
    }
  }
  if (!contactId) return res.status(400).json({ error: 'contactId or email required' })

  const prefix = `[ADMIN-NOTE ${session.email} ${new Date().toISOString()}] `
  await addNote(contactId, prefix + text)
  return res.status(200).json({ ok: true, contactId })
}
