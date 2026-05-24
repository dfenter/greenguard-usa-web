const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { sendSms } = require('../../../lib/sms')
const { findContactByEmail, addNote, getContactNotes } = require('../../../lib/hubspot')

const DEDUP_WINDOW_MS = 30 * 60 * 1000 // 30 min — covers re-clicks and "ETA changed" cases

/**
 * POST /api/admin/notify-eta
 * Sends an SMS to the customer telling them the tech is on the way.
 * Body: { customerEmail | customerPhone, customerName, etaMinutes (optional) }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const { customerEmail, customerPhone, customerName, etaMinutes, force } = req.body || {}

  // Resolve phone: explicit phone param wins, else look up via HubSpot contact email
  let phone = customerPhone
  let contactId = null
  if (!phone && customerEmail) {
    const contact = await findContactByEmail(customerEmail).catch(() => null)
    phone = contact?.properties?.phone || null
    contactId = contact?.id || null
  }
  if (!phone) return res.status(400).json({ error: 'No phone number on file for this customer' })

  // Dedup: don't send another On-My-Way SMS within DEDUP_WINDOW_MS unless force=true
  if (!force && customerEmail) {
    try {
      const ensureId = contactId || (await findContactByEmail(customerEmail).catch(() => null))?.id
      if (ensureId) {
        contactId = ensureId
        const notes = await getContactNotes(ensureId, 10).catch(() => [])
        const recent = notes.find(n =>
          /\[SMS-OUT\]\s*On-my-way/i.test(n.body || '') &&
          (Date.now() - new Date(n.timestamp).getTime()) < DEDUP_WINDOW_MS
        )
        if (recent) {
          const mins = Math.round((Date.now() - new Date(recent.timestamp).getTime()) / 60000)
          return res.status(409).json({
            duplicate: true,
            error: `On-my-way SMS was already sent ${mins} min ago. Pass force:true to re-send.`,
          })
        }
      }
    } catch {}
  }

  const first = (customerName || '').split(' ')[0] || 'there'
  const eta = etaMinutes ? `~${etaMinutes} min` : 'shortly'
  const body =
    `Hi ${first}, this is GreenGuard USA — your tech is on the way (${eta}). ` +
    `Please ensure backyard access is clear. Reply STOP to opt out. — GreenGuard`

  const result = await sendSms({ to: phone, body })
  if (!result.ok) return res.status(502).json({ error: result.error })

  // Log to HubSpot so it shows up in customer history
  try {
    if (!contactId && customerEmail) {
      const c = await findContactByEmail(customerEmail).catch(() => null)
      contactId = c?.id || null
    }
    if (contactId) await addNote(contactId, `[SMS-OUT] On-my-way notification sent (ETA: ${eta}) by ${session.email}`)
  } catch {}

  return res.status(200).json({ ok: true, sid: result.sid })
}
