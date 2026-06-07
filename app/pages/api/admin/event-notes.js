// Per-appointment notes (Google Calendar event ID is the key).
//   GET  ?eventId=...           → list notes for the event
//   POST { eventId, body, customerEmail? } → append a note

const { requireAdmin } = require('../../../lib/auth')
const { q } = require('../../../lib/db')

export default async function handler(req, res) {
  const session = await requireAdmin(req, res)
  if (!session) return

  try {
    if (req.method === 'GET') {
      const { eventId } = req.query
      if (!eventId) return res.status(400).json({ error: 'eventId required' })
      const r = await q(
        `SELECT id, author_email, body, created_at
         FROM event_notes WHERE event_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [eventId]
      )
      return res.status(200).json({ notes: r.rows })
    }

    if (req.method === 'POST') {
      const { eventId, body, customerEmail } = req.body || {}
      const text = (body || '').trim()
      if (!eventId || !text) return res.status(400).json({ error: 'eventId and body required' })
      const r = await q(
        `INSERT INTO event_notes (event_id, customer_email, author_email, body)
         VALUES ($1, $2, $3, $4) RETURNING id, author_email, body, created_at`,
        [eventId, customerEmail || null, session.email, text]
      )
      return res.status(200).json({ note: r.rows[0] })
    }

    if (req.method === 'DELETE') {
      const { id } = req.query
      if (!id) return res.status(400).json({ error: 'id required' })
      await q(`DELETE FROM event_notes WHERE id = $1`, [id])
      return res.status(200).json({ ok: true })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('event-notes error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
