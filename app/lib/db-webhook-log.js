/**
 * Webhook idempotency log — durable claim/release.
 *
 * Uses Vercel KV (SET NX EX) so the claim is atomic and shared across all
 * serverless instances. Falls back to an in-process Map only when KV isn't
 * configured (local dev) — that fallback does NOT protect across instances.
 *
 * claimWebhook(eventId) atomically marks an event as being processed and
 * returns true only for the first caller. If processing fails, the caller
 * must releaseWebhook(eventId) so Stripe's retry can reprocess it; on success
 * the claim persists for the TTL (covers Stripe's 72-hour retry window).
 */

const TTL_SECONDS = 24 * 60 * 60 // 24 hours
const MAX_SIZE = 10000

// ── KV (durable, cross-instance) ──────────────────────────────────────────────
let _kv = null
function getKV() {
  if (_kv !== null) return _kv
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    _kv = false
    return false
  }
  try {
    _kv = require('@vercel/kv').kv
    return _kv
  } catch {
    _kv = false
    return false
  }
}

// ── In-memory fallback (per-instance only) ────────────────────────────────────
const _processed = new Map() // eventId → claimedAt (ms)

function _prune() {
  const now = Date.now()
  for (const [id, ts] of _processed) {
    if (now - ts > TTL_SECONDS * 1000) _processed.delete(id)
  }
  if (_processed.size > MAX_SIZE) {
    const sorted = [..._processed.entries()].sort((a, b) => a[1] - b[1])
    sorted.slice(0, 1000).forEach(([id]) => _processed.delete(id))
  }
}

if (typeof setInterval !== 'undefined') {
  setInterval(_prune, 60 * 60 * 1000)
}

const _key = (eventId) => `webhook:${eventId}`

// Atomically claim an event. Returns true if this caller is the first to claim
// it (and should process), false if it was already claimed/processed.
async function claimWebhook(eventId, ttlSeconds = TTL_SECONDS) {
  if (!eventId) return true
  const kv = getKV()
  if (kv) {
    // SET NX EX — returns 'OK' on first claim, null if the key already exists.
    const result = await kv.set(_key(eventId), Date.now(), { nx: true, ex: ttlSeconds })
    return result === 'OK'
  }
  _prune()
  if (_processed.has(eventId)) return false
  _processed.set(eventId, Date.now())
  return true
}

// Confirm successful processing: extend the (short) in-flight claim to the full
// TTL so the event is durably marked done. The claim is taken with a SHORT ttl,
// so if the lambda TIMES OUT mid-processing (neither success nor the catch
// runs), the claim self-expires and Stripe's retry reprocesses instead of
// getting a permanent {duplicate:true}. Only a fully-processed event gets the
// long TTL. No NX — this overwrites/extends the existing claim.
async function confirmWebhook(eventId, ttlSeconds = TTL_SECONDS) {
  if (!eventId) return
  const kv = getKV()
  if (kv) { try { await kv.set(_key(eventId), Date.now(), { ex: ttlSeconds }) } catch {} ; return }
  _processed.set(eventId, Date.now())
}

// Release a claim so a failed event can be retried by Stripe.
async function releaseWebhook(eventId) {
  if (!eventId) return
  const kv = getKV()
  if (kv) { try { await kv.del(_key(eventId)) } catch {} ; return }
  _processed.delete(eventId)
}

async function isWebhookProcessed(eventId) {
  if (!eventId) return false
  const kv = getKV()
  if (kv) return Boolean(await kv.get(_key(eventId)))
  _prune()
  return _processed.has(eventId)
}

async function recordWebhook(eventId) {
  await claimWebhook(eventId)
}

module.exports = { claimWebhook, confirmWebhook, releaseWebhook, isWebhookProcessed, recordWebhook }
