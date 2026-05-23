const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { sendSms } = require('../../../lib/sms')
const { findContactByEmail, addNote } = require('../../../lib/hubspot')

/**
 * POST /api/admin/send-sms
 * Send a freeform SMS to a customer and log it as [SMS-OUT] on their HubSpot
 * contact so it threads with inbound [SMS-IN] messages from the Twilio webhook.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const { customerEmail, customerPhone, body } = req.body || {}
  if (!body || !body.trim()) return res.status(400).json({ error: 'body required' })

  let phone = customerPhone
  let contactId = null
  if (!phone && customerEmail) {
    const c = await findContactByEmail(customerEmail).catch(() => null)
    phone = c?.properties?.phone || null
    contactId = c?.id || null
  }
  if (!phone) return res.status(400).json({ error: 'No phone number on file' })

  const result = await sendSms({ to: phone, body: body.trim() })
  if (!result.ok) return res.status(502).json({ error: result.error })

  try {
    if (!contactId && customerEmail) {
      const c = await findContactByEmail(customerEmail).catch(() => null)
      contactId = c?.id || null
    }
    if (contactId) await addNote(contactId, `[SMS-OUT] (${new Date().toISOString()}) by ${session.email}:\n${body.trim()}`)
  } catch {}

  return res.status(200).json({ ok: true, sid: result.sid })
}
