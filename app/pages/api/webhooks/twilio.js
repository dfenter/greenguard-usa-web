const { findContactByEmail, addNote } = require('../../../lib/hubspot')
const { Client } = require('@hubspot/api-client')
const twilio = require('twilio')

/**
 * POST /api/webhooks/twilio
 * Inbound SMS receiver. Twilio posts application/x-www-form-urlencoded.
 *
 * Verifies X-Twilio-Signature so attackers can't forge inbound SMS
 * and pollute HubSpot timelines.
 */
export const config = { api: { bodyParser: { type: 'application/x-www-form-urlencoded' } } }

function publicUrl(req) {
  // Always prefer TWILIO_WEBHOOK_URL env var — x-forwarded-host can be spoofed.
  if (process.env.TWILIO_WEBHOOK_URL) {
    return `${process.env.TWILIO_WEBHOOK_URL.replace(/\/$/, '')}/api/webhooks/twilio`
  }
  // Local dev fallback only — never rely on spoofable headers in production
  if (process.env.NODE_ENV === 'production') {
    console.error('[twilio-webhook] TWILIO_WEBHOOK_URL not set in production — signature will fail')
  }
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000'
  return `${proto}://${host}/api/webhooks/twilio`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const params = typeof req.body === 'string'
    ? Object.fromEntries(new URLSearchParams(req.body))
    : req.body || {}

  // ── Signature verification ────────────────────────────────────────────
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const signature = req.headers['x-twilio-signature']
  if (!authToken) {
    console.error('Twilio webhook: TWILIO_AUTH_TOKEN not configured')
    return res.status(503).end()
  }
  if (!signature) {
    return res.status(401).end()
  }
  const url = publicUrl(req)
  const valid = twilio.validateRequest(authToken, signature, url, params)
  if (!valid) {
    console.warn('Twilio webhook: invalid signature for', url)
    return res.status(401).end()
  }
  // ──────────────────────────────────────────────────────────────────────

  const from = params.From || ''
  const body = (params.Body || '').trim()
  const to = params.To || ''
  if (!from || !body) return reply(res, '')

  let contact = null
  try {
    const client = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN })
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

  try {
    if (contact?.id) {
      await addNote(
        contact.id,
        `[SMS-IN] (${new Date().toISOString()}) From ${from} → ${to}:\n${body}`
      )
    } else {
      const admin = await findContactByEmail(process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com').catch(() => null)
      if (admin?.id) {
        await addNote(admin.id, `[SMS-IN UNKNOWN] From ${from} → ${to}:\n${body}`)
      }
    }
  } catch (e) {
    console.error('Twilio webhook note error:', e.message)
  }

  return reply(res, '<?xml version="1.0" encoding="UTF-8"?><Response></Response>')
}

function reply(res, twiml) {
  res.setHeader('Content-Type', 'text/xml')
  return res.status(200).send(twiml)
}
