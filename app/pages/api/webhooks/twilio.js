const { findContactByEmail, addNote, upsertContact } = require('../../../lib/hubspot')
const { Client } = require('@hubspot/api-client')

/**
 * POST /api/webhooks/twilio
 * Inbound SMS receiver. Twilio posts application/x-www-form-urlencoded.
 *
 * We:
 *  1. Look up the HubSpot contact by phone number
 *  2. Append the message as a note tagged [SMS-IN] so it threads with [SMS-OUT]
 *  3. Reply with empty TwiML (no auto-reply); admin handles in portal
 *
 * Configure in Twilio console:
 *   Phone number > Messaging > A message comes in:
 *     POST https://portal.greenguard-usa.com/api/webhooks/twilio
 */
export const config = { api: { bodyParser: { type: 'application/x-www-form-urlencoded' } } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // Parse form-urlencoded body
  const params = typeof req.body === 'string'
    ? Object.fromEntries(new URLSearchParams(req.body))
    : req.body || {}
  const from = params.From || ''
  const body = (params.Body || '').trim()
  const to = params.To || ''
  if (!from || !body) return reply(res, '')

  // Find contact by phone
  let contact = null
  try {
    const client = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN })
    // HubSpot phones often store as "(512) 555-1234" — normalise both sides to digits and match suffix
    const digits = from.replace(/\D/g, '')
    const tail = digits.slice(-10)
    const search = await client.crm.contacts.searchApi.doSearch({
      filterGroups: [{ filters: [{ propertyName: 'phone', operator: 'CONTAINS_TOKEN', value: tail }] }],
      properties: ['email', 'firstname', 'lastname', 'phone'],
      limit: 1,
    })
    contact = search.results?.[0] || null
  } catch (e) {
    console.error('Twilio webhook HubSpot lookup error:', e.message)
  }

  // Record the inbound message as a tagged note for whoever owns the customer
  try {
    if (contact?.id) {
      await addNote(
        contact.id,
        `[SMS-IN] (${new Date().toISOString()}) From ${from} → ${to}:\n${body}`
      )
    } else {
      // Unknown sender — still capture against admin contact so it's not lost
      const admin = await findContactByEmail(process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com').catch(() => null)
      if (admin?.id) {
        await addNote(admin.id, `[SMS-IN UNKNOWN] From ${from} → ${to}:\n${body}`)
      }
    }
  } catch (e) {
    console.error('Twilio webhook note error:', e.message)
  }

  // Twilio expects valid TwiML; empty response = no auto-reply
  return reply(res, '<?xml version="1.0" encoding="UTF-8"?><Response></Response>')
}

function reply(res, twiml) {
  res.setHeader('Content-Type', 'text/xml')
  return res.status(200).send(twiml)
}
