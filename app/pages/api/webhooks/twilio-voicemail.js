// POST /api/webhooks/twilio-voicemail
// Configured in Twilio console as the Recording StatusCallback for inbound
// voicemails. Twilio posts: From, To, RecordingUrl, RecordingSid,
// TranscriptionText (when enabled), CallSid.
//
// Pipeline:
//   1. Verify Twilio signature.
//   2. Match caller phone → HubSpot contact (existing customer or unknown).
//   3. Claude classifies intent + urgency from transcript.
//   4. Routes:
//      - Always: write [VOICEMAIL] HubSpot note (on customer, or admin if unknown).
//      - Urgent (cancel/complaint): admin SMS via Twilio.
//      - new_lead / unclear: admin email draft via Resend.
//   5. Returns empty TwiML (Twilio expects 2xx + valid XML).

const twilio = require('twilio')
const { Resend } = require('resend')
const { findContactByEmail, addNote, upsertContact } = require('../../../lib/hubspot')
const { sendSms } = require('../../../lib/sms')
const { generateJSON } = require('../../../lib/gemini')
const { postToOps } = require('../../../lib/slack')

const ADMIN_EMAIL = process.env.OWNER_EMAIL || process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'
const ADMIN_SMS = process.env.ADMIN_SMS_NUMBER || ''
const FROM_EMAIL = process.env.PORTAL_FROM_EMAIL || 'noreply@greenguard-usa.com'

export const config = { api: { bodyParser: { type: 'application/x-www-form-urlencoded' } } }

function publicUrl(req) {
  const base = process.env.TWILIO_WEBHOOK_URL_VOICEMAIL
    || `${(req.headers['x-forwarded-proto'] || 'https')}://${req.headers['x-forwarded-host'] || req.headers.host}`
  return `${base.replace(/\/$/, '')}/api/webhooks/twilio-voicemail`
}

function reply(res, twiml = '<?xml version="1.0" encoding="UTF-8"?><Response/>') {
  res.setHeader('Content-Type', 'text/xml')
  return res.status(200).send(twiml)
}

async function lookupContactByPhone(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '').slice(-10)
  try {
    const { Client } = require('@hubspot/api-client')
    const c = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN })
    const r = await c.crm.contacts.searchApi.doSearch({
      filterGroups: [{ filters: [{ propertyName: 'phone', operator: 'CONTAINS_TOKEN', value: digits }] }],
      properties: ['email', 'firstname', 'lastname', 'phone'],
      limit: 1,
    })
    return r.results?.[0] || null
  } catch { return null }
}

async function classify(transcript, callerName) {
  if (!transcript || transcript.length < 10) {
    return { intent: 'other', urgency: 'low', summary: 'Inaudible / very short voicemail' }
  }
  try {
    return await generateJSON({
      system: `You classify voicemails left for a mosquito-control company.
Output JSON with these exact keys:
  intent: one of new_lead | cancel | reschedule | complaint | payment | followup | other
  urgency: low | medium | high  (high = customer angry, service emergency, or asking for callback within 24h)
  summary: 1 sentence describing the request, max 140 chars
  callback_requested: true if they asked to be called back, else false`,
      user: `Caller: ${callerName || 'Unknown'}\nTranscript: ${transcript}`,
      maxTokens: 256,
    })
  } catch (e) {
    return { intent: 'other', urgency: 'medium', summary: transcript.slice(0, 140), classifier_error: e.message }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const params = typeof req.body === 'string'
    ? Object.fromEntries(new URLSearchParams(req.body))
    : req.body || {}

  // Twilio signature check
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) return res.status(503).end()
  const sig = req.headers['x-twilio-signature']
  if (!sig || !twilio.validateRequest(authToken, sig, publicUrl(req), params)) {
    return res.status(401).end()
  }

  const from = params.From || ''
  const to = params.To || ''
  const recordingUrl = params.RecordingUrl || ''
  const transcript = (params.TranscriptionText || '').trim()
  const callSid = params.CallSid || ''

  // Match caller to existing customer
  const contact = await lookupContactByPhone(from)
  const callerName = contact
    ? `${contact.properties.firstname || ''} ${contact.properties.lastname || ''}`.trim() || contact.properties.email
    : null

  // Classify
  const cls = await classify(transcript, callerName)

  // Build the note body
  const noteBody = [
    `[VOICEMAIL] from ${from} → ${to}`,
    `Intent: ${cls.intent}  Urgency: ${cls.urgency}`,
    cls.callback_requested ? '☎ Callback requested' : null,
    `Summary: ${cls.summary || '-'}`,
    transcript ? `\nTranscript:\n${transcript}` : '\n(no transcript)',
    recordingUrl ? `\nRecording: ${recordingUrl}.mp3` : null,
    callSid ? `CallSid: ${callSid}` : null,
  ].filter(Boolean).join('\n')

  // Attach to the right HubSpot contact (existing customer or admin)
  let targetContactId = contact?.id
  if (!targetContactId) {
    try {
      const admin = await findContactByEmail(ADMIN_EMAIL).catch(() => null)
      if (admin?.id) targetContactId = admin.id
      else {
        const a = await upsertContact({ email: ADMIN_EMAIL, name: 'GreenGuard Admin' })
        targetContactId = a.id
      }
    } catch {}
  }
  if (targetContactId) {
    await addNote(targetContactId, noteBody).catch((e) => console.error('voicemail addNote:', e.message))
  }

  // High-urgency → SMS + Slack admin
  if (cls.urgency === 'high') {
    const msgBody = `📞 URGENT voicemail from ${callerName || from}: ${cls.summary || transcript.slice(0, 100)}`
    if (ADMIN_SMS) await sendSms({ to: ADMIN_SMS, body: msgBody.slice(0, 320) }).catch(() => {})
    await postToOps(`*URGENT voicemail* from ${callerName || from} (${from}): ${cls.summary || transcript.slice(0, 160)}`).catch(() => {})
  }

  // new_lead / followup / unclear → admin email draft via Resend
  if (['new_lead', 'followup', 'cancel', 'complaint', 'other'].includes(cls.intent) && process.env.RESEND_API_KEY) {
    const subject = `📞 [${cls.intent.toUpperCase()}] Voicemail from ${callerName || from}`
    const html = `
      <div style="font-family:-apple-system,sans-serif;max-width:560px;padding:20px;">
        <h2 style="margin:0 0 8px;color:#1a2e1f;">Voicemail received</h2>
        <p style="margin:0 0 6px;"><strong>${callerName || 'Unknown caller'}</strong> &lt;${from}&gt;</p>
        <p style="color:#555;margin:0 0 14px;">Intent: <strong>${cls.intent}</strong> · Urgency: <strong>${cls.urgency}</strong>${cls.callback_requested ? ' · ☎ Callback requested' : ''}</p>
        <blockquote style="margin:0 0 14px;padding:10px 14px;background:#f7fbf6;border-left:3px solid #7dffaa;">
          ${(transcript || '(no transcript)').replace(/</g, '&lt;')}
        </blockquote>
        ${recordingUrl ? `<p><a href="${recordingUrl}.mp3">▶ Listen to recording</a></p>` : ''}
        ${contact?.id ? `<p><a href="https://app.hubspot.com/contacts/0/contact/${contact.id}">Open in HubSpot</a></p>` : ''}
      </div>`
    try {
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: `GreenGuard Voicemail <${FROM_EMAIL}>`,
        to: ADMIN_EMAIL,
        subject, html,
      })
    } catch (e) { console.error('voicemail email:', e.message) }
  }

  return reply(res)
}
