const twilio = require('twilio')
const notifyQueue = require('./notify-queue')

let _client = null
function getClient() {
  if (_client) return _client
  const sid = process.env.TWILIO_ACCOUNT_SID
  const tok = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !tok) throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN not configured')
  _client = twilio(sid, tok)
  return _client
}

/**
 * Normalise a phone number to E.164 (+1XXXXXXXXXX). US-only assumption.
 * Returns null if it can't make sense of the input.
 */
function normalizePhone(raw) {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length === 12 && raw.startsWith('+')) return raw
  return null
}

/**
 * Twilio send logic. NOT used as a live send path (see sendSms below) —
 * business decision 2026-07-10: iMessage only, no Twilio fallback. Kept
 * defined only for reference/diagnostics; nothing calls this anymore.
 * Returns { ok, sid, to } or { ok:false, error }.
 */
async function sendSmsDirect({ to, body }) {
  const from = process.env.TWILIO_FROM_NUMBER
  if (!from) throw new Error('TWILIO_FROM_NUMBER not configured')
  const dest = normalizePhone(to)
  if (!dest) return { ok: false, error: `Invalid phone: ${to}` }
  try {
    const msg = await getClient().messages.create({ from, to: dest, body })
    return { ok: true, sid: msg.sid, to: dest }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

/**
 * iMessage-only fallback for when the local daemon's heartbeat is stale.
 * Does NOT send via Twilio — just enqueues the job so the daemon picks it
 * up as soon as it's back online. Delivery is delayed, never rerouted to a
 * different channel.
 */
async function queueForDaemon({ to, body }) {
  try {
    const id = await notifyQueue.enqueue({ kind: 'sms', to, body })
    return { ok: true, sid: null, to, sentBy: 'queued-imessage-only', jobId: id }
  } catch (e) {
    return { ok: false, error: `iMessage daemon unavailable and queue enqueue failed: ${e.message}` }
  }
}

/**
 * Local-first SMS send: hands off to the local daemon when it's alive
 * (sends via iMessage). If the daemon isn't available, queues the job for
 * whenever it comes back — no Twilio fallback (business decision 2026-07-10:
 * iMessage only). Return shape: { ok, sid, to } plus sentBy:'local' or
 * sentBy:'queued-imessage-only'.
 */
async function sendSms({ to, body }) {
  return notifyQueue.sendLocalFirst({ kind: 'sms', to, body }, queueForDaemon)
}

module.exports = { sendSms, sendSmsDirect, normalizePhone }
