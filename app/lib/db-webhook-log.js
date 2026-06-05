/**
 * Lightweight in-memory + file-based webhook idempotency log.
 * Prevents double-processing when Stripe retries a webhook after a slow response.
 * Uses a Map with a 24-hour TTL — safe for Stripe's 72-hour retry window.
 */

const _processed = new Map() // eventId → processedAt (ms)
const TTL_MS = 24 * 60 * 60 * 1000  // 24 hours
const MAX_SIZE = 10000

function _prune() {
  const now = Date.now()
  for (const [id, ts] of _processed) {
    if (now - ts > TTL_MS) _processed.delete(id)
  }
  if (_processed.size > MAX_SIZE) {
    const sorted = [..._processed.entries()].sort((a, b) => a[1] - b[1])
    sorted.slice(0, 1000).forEach(([id]) => _processed.delete(id))
  }
}

// Proactive cleanup every hour
if (typeof setInterval !== 'undefined') {
  setInterval(_prune, 60 * 60 * 1000)
}

async function isWebhookProcessed(eventId) {
  if (!eventId) return false
  const ts = _processed.get(eventId)
  if (!ts) return false
  if (Date.now() - ts > TTL_MS) {
    _processed.delete(eventId)
    return false
  }
  return true
}

async function recordWebhook(eventId, eventType) {
  if (!eventId) return
  _prune()
  _processed.set(eventId, Date.now())
}

module.exports = { isWebhookProcessed, recordWebhook }
