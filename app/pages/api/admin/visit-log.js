const { getSessionFromRequest } = require('../../../lib/auth')
const { findContactByEmail, addNote } = require('../../../lib/hubspot')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'
const PREFIX = '[VISIT-LOG]'

// GET ?email=x&date=YYYY-MM-DD  →  load saved visit log
// POST                           →  save visit log
export default async function handler(req, res) {
  const session = await getSessionFromRequest(req)
  if (!session || session.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden' })

  if (req.method === 'POST') {
    const { email, visitData } = req.body || {}
    if (!email || !visitData) return res.status(400).json({ error: 'email and visitData required' })

    const contact = await findContactByEmail(email).catch(() => null)
    if (!contact?.id) return res.status(200).json({ ok: true, warn: 'No HubSpot contact — log not saved' })

    const noteBody = `${PREFIX}${JSON.stringify(visitData)}`
    await addNote(contact.id, noteBody)
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'GET') {
    const { email, date } = req.query
    if (!email) return res.status(400).json({ error: 'email required' })

    const contact = await findContactByEmail(email).catch(() => null)
    if (!contact?.id) return res.status(200).json({ log: null })

    // Fetch recent notes and find matching visit log
    const assocResp = await fetch(
      `https://api.hubapi.com/crm/v3/objects/contacts/${contact.id}/associations/notes?limit=50`,
      { headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}` } }
    )
    if (!assocResp.ok) return res.status(200).json({ log: null })

    const assocData = await assocResp.json()
    const noteIds = (assocData.results || []).map((r) => r.id).slice(0, 50)
    if (!noteIds.length) return res.status(200).json({ log: null })

    const batchResp = await fetch('https://api.hubapi.com/crm/v3/objects/notes/batch/read', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: noteIds.map((id) => ({ id: String(id) })), properties: ['hs_note_body', 'hs_timestamp'] }),
    })
    if (!batchResp.ok) return res.status(200).json({ log: null })

    const batchData = await batchResp.json()
    const visitNotes = (batchData.results || [])
      .filter((n) => n.properties.hs_note_body?.startsWith(PREFIX))
      .sort((a, b) => new Date(b.properties.hs_timestamp) - new Date(a.properties.hs_timestamp))

    // Find the most recent visit log for the requested date
    for (const note of visitNotes) {
      try {
        const data = JSON.parse(note.properties.hs_note_body.replace(PREFIX, ''))
        if (!date || data.date === date) return res.status(200).json({ log: data })
      } catch {}
    }

    return res.status(200).json({ log: null })
  }

  res.status(405).end()
}
