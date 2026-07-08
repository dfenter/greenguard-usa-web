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
 * The ORIGINAL Twilio send logic — "the current method". Used directly by the
 * local notify daemon, and as the backup path when local isn't available.
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
 * Local-first SMS send: hands off to the local daemon when it's alive, else
 * calls sendSmsDirect() with zero added latency (identical to pre-local-first
 * behavior). Same shared orchestration as email — see notify-queue.sendLocalFirst.
 * Return shape is preserved either way ({ ok, sid, to } — plus sentBy:'local'
 * when the daemon handled it).
 */
async function sendSms({ to, body }) {
  return notifyQueue.sendLocalFirst({ kind: 'sms', to, body }, sendSmsDirect)
}

module.exports = { sendSms, sendSmsDirect, normalizePhone }
