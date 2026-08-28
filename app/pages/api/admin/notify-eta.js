const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { sendSms, normalizePhone } = require('../../../lib/sms')
const { findContactByEmail, addNote, getContactNotes } = require('../../../lib/hubspot')
const { kv, isKvConfigured } = require('../../../lib/notify-queue')
const biz = require('../../../lib/business.config')

const DEDUP_WINDOW_MS = 30 * 60 * 1000 // 30 min — covers re-clicks and "ETA changed" cases
const DEDUP_WINDOW_SEC = 30 * 60

/**
 * Atomically claim an On-my-way send for this phone in KV before sending, so two
 * rapid sends can't both get through. Returns true if THIS call won the claim
 * (safe to send), false if a claim is already held (duplicate). The HubSpot-note
 * check below is a 30-min-window backstop, but it reads through a 60s cache and
 * HubSpot's own note-indexing lag, so it can't catch sub-minute double-sends —
 * this KV claim does. Fails OPEN (returns true) if KV is unset/unreachable.
 */
async function claimOnMyWay(phone) {
  if (!isKvConfigured()) return true
  const key = `notify:onmyway:${normalizePhone(phone) || phone}`
  try {
    const res = await kv(['SET', key, '1', 'NX', 'EX', String(DEDUP_WINDOW_SEC)])
    return res === 'OK' // null when the key already exists (claim held)
  } catch {
    return true // KV blip — don't block a legitimate arrival text
  }
}

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

  // Atomic claim BEFORE sending — closes the sub-minute double-send race the
  // HubSpot-note check above can't (60s note cache + note-indexing lag).
  if (!force) {
    const won = await claimOnMyWay(phone)
    if (!won) {
      return res.status(409).json({
        duplicate: true,
        error: 'An On-my-way SMS was just sent to this customer. Pass force:true to re-send.',
      })
    }
  }

  const first = (customerName || '').split(' ')[0] || 'there'
  const eta = etaMinutes ? `~${etaMinutes} min` : 'shortly'
  const body =
    `Hi ${first}, this is ${biz.nameShort} — your tech is on the way (${eta}). ` +
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
