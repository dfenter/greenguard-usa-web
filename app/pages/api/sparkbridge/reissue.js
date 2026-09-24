// POST { email, gateway } -> 200 generic message, always (for valid input).
// Self-service re-send of the combined SparkBridge key for one gateway. Proof of mailbox,
// like the portal magic link: the key only ever goes to the email of record and is never
// returned here, and the response is identical whether or not anything matched.
// Public (no session), same as /api/sparkbridge/checkout.
//
// Anti-enumeration: every valid-input response is padded to FLOOR_MS from request start,
// and the match work (DB, sign, email) is capped just under the floor, so timing does not
// tell a match from a miss. Throttles: one reissue per email + gateway per 10 minutes, and
// 10 requests per IP per hour; throttled requests get the same padded generic reply.
const store = require('../../../lib/sparkbridge-store')
const { sendCombinedKey } = require('../../../lib/sparkbridge-fulfill')

const MESSAGE = 'If that email holds active SparkBridge licences for that gateway, a combined key is on its way.'
const FLOOR_MS = 3000
const WORK_CAP_MS = 2800
const PAIR_WINDOW_SECONDS = 10 * 60
const IP_WINDOW_SECONDS = 60 * 60
const IP_MAX = 10
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Injectable for tests (handler.clock) so jest does not really wait.
const clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms))),
}

let _kv = null
function getKV() {
  if (_kv !== null) return _kv
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) { _kv = false; return _kv }
  try { _kv = require('@vercel/kv').kv } catch (_) { _kv = false }
  return _kv
}

const pairMemory = new Map() // key -> until (ms)
const ipMemory = new Map() // ip -> { count, resetAt }
function prune(now) {
  for (const [k, until] of pairMemory) if (until <= now) pairMemory.delete(k)
  for (const [k, e] of ipMemory) if (e.resetAt <= now) ipMemory.delete(k)
}

/** True when this email + gateway may reissue now (and claims the window). */
async function claimPair(email, gateway) {
  const k = `sbreissue:${store.normEmail(email)}:${store.normGateway(gateway)}`
  const kv = getKV()
  if (kv) {
    try { return (await kv.set(k, '1', { nx: true, ex: PAIR_WINDOW_SECONDS })) === 'OK' } catch (e) {
      console.error('[sparkbridge-reissue] KV pair throttle failed, using memory:', e.message)
    }
  }
  const now = Date.now()
  prune(now)
  if ((pairMemory.get(k) || 0) > now) return false
  pairMemory.set(k, now + PAIR_WINDOW_SECONDS * 1000)
  return true
}

/** True while this IP is within IP_MAX requests in the current hour (counts this one). */
async function claimIp(ip) {
  const k = `sbreissue-ip:${ip}`
  const kv = getKV()
  if (kv) {
    try {
      const n = await kv.incr(k)
      if (n === 1) await kv.expire(k, IP_WINDOW_SECONDS)
      return n <= IP_MAX
    } catch (e) {
      console.error('[sparkbridge-reissue] KV IP throttle failed, using memory:', e.message)
    }
  }
  const now = Date.now()
  prune(now)
  const e = ipMemory.get(ip)
  if (!e || e.resetAt <= now) { ipMemory.set(ip, { count: 1, resetAt: now + IP_WINDOW_SECONDS * 1000 }); return true }
  e.count++
  return e.count <= IP_MAX
}

function clientIp(req) {
  const xff = req.headers?.['x-forwarded-for']
  const first = String(Array.isArray(xff) ? xff[0] : (xff || '')).split(',')[0].trim()
  return first || req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown'
}

async function work(email, gateway, ip) {
  if (!(await claimIp(ip))) return
  if (!(await claimPair(email, gateway))) return
  const grants = await store.activeGrants(email, gateway)
  if (!grants.length) return
  // Email of record, as stored with the grants, not the typed casing.
  const to = grants[grants.length - 1].email || store.normEmail(email)
  const display = grants[grants.length - 1].gateway_display || gateway
  await sendCombinedKey({ email: to, gatewayDisplay: display, grants, reason: 'reissue', replaces: true })
  console.log(`[sparkbridge-reissue] combined key for gateway ${display} sent to ${to}`)
}

export default async function handler(req, res) {
  const start = clock.now()
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const email = String(req.body?.email || '').trim()
  const gateway = String(req.body?.gateway || '').replace(/[\r\n]+/g, ' ').trim()
  if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address.' })
  if (gateway.length < 1 || gateway.length > 100) return res.status(400).json({ error: 'Enter the gateway name (1 to 100 characters).' })

  const job = work(email, gateway, clientIp(req)).catch((e) => console.error('[sparkbridge-reissue] error:', e.message))
  const capped = await Promise.race([job.then(() => 'done'), clock.sleep(WORK_CAP_MS - (clock.now() - start)).then(() => 'cap')])
  if (capped === 'cap') console.error('[sparkbridge-reissue] work exceeded cap; responding on time')
  await clock.sleep(FLOOR_MS - (clock.now() - start))
  return res.status(200).json({ ok: true, message: MESSAGE })
}

handler.clock = clock
handler.FLOOR_MS = FLOOR_MS
