const twilio = require('twilio')

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
 * Send an SMS. Returns { ok, sid } or { ok:false, error }.
 */
async function sendSms({ to, body }) {
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

module.exports = { sendSms, normalizePhone }
