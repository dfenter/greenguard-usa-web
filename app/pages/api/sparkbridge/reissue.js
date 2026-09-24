// POST { email, gateway } -> 200 generic message, always (for valid input).
// Self-service re-send of the combined SparkBridge key for one gateway. Proof of mailbox,
// like the portal magic link: the key only ever goes to the email of record and is never
// returned here, and the response is identical whether or not anything matched.
// Public (no session), same as /api/sparkbridge/checkout. Throttled per email + gateway.
const store = require('../../../lib/sparkbridge-store')
const { sendCombinedKey } = require('../../../lib/sparkbridge-fulfill')

const MESSAGE = 'If that email holds active SparkBridge licences for that gateway, a combined key is on its way.'
const WINDOW_SECONDS = 10 * 60
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

let _kv = null
function getKV() {
  if (_kv !== null) return _kv
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) { _kv = false; return _kv }
  try { _kv = require('@vercel/kv').kv } catch (_) { _kv = false }
  return _kv
}

const memory = new Map()
/** True when this email + gateway may reissue now (and claims the window). */
async function claimThrottle(email, gateway) {
  const k = `sbreissue:${store.normEmail(email)}:${store.normGateway(gateway)}`
  const kv = getKV()
  if (kv) {
    try { return (await kv.set(k, '1', { nx: true, ex: WINDOW_SECONDS })) === 'OK' } catch (e) {
      console.error('[sparkbridge-reissue] KV throttle failed, using memory:', e.message)
    }
  }
  const now = Date.now()
  for (const [key, until] of memory) if (until <= now) memory.delete(key)
  if ((memory.get(k) || 0) > now) return false
  memory.set(k, now + WINDOW_SECONDS * 1000)
  return true
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const email = String(req.body?.email || '').trim()
  const gateway = String(req.body?.gateway || '').replace(/[\r\n]+/g, ' ').trim()
  if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address.' })
  if (gateway.length < 1 || gateway.length > 100) return res.status(400).json({ error: 'Enter the gateway name (1 to 100 characters).' })

  try {
    if (await claimThrottle(email, gateway)) {
      const grants = await store.activeGrants(email, gateway)
      if (grants.length) {
        // Email of record, as stored with the grants, not the typed casing.
        const to = grants[grants.length - 1].email || store.normEmail(email)
        const display = grants[grants.length - 1].gateway_display || gateway
        await sendCombinedKey({ email: to, gatewayDisplay: display, grants, reason: 'reissue', replaces: true })
        console.log(`[sparkbridge-reissue] combined key for gateway ${display} sent to ${to}`)
      }
    }
  } catch (e) {
    console.error('[sparkbridge-reissue] error:', e.message)
  }
  return res.status(200).json({ ok: true, message: MESSAGE })
}
