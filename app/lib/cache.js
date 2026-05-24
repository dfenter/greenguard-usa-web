// Thin, fail-open Redis cache. If UPSTASH_REDIS_REST_URL/TOKEN aren't set
// (local dev, missing config), every call passes through to the source
// function — no errors, no behavior change, just no caching.
//
// Usage:
//   const customers = await cached('stripe:customers:all', 60, () => listAllCustomers())
//
// Conventions:
//  · Keys are colon-namespaced: `<system>:<entity>:<scope>`
//  · TTLs are in seconds. Pick the shortest TTL that still feels fast — for
//    Stripe customer/sub lists, 60s is plenty (changes are admin-triggered).
//  · Values are JSON-serialized; complex Stripe responses are fine.

const { Redis } = require('@upstash/redis')

let client = null
function getClient() {
  if (client !== null) return client
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    client = false
    return null
  }
  try {
    client = new Redis({ url, token })
    return client
  } catch {
    client = false
    return null
  }
}

async function cached(key, ttlSeconds, fetchFn) {
  const c = getClient()
  if (!c) return fetchFn()

  try {
    const hit = await c.get(key)
    if (hit !== null && hit !== undefined) {
      // @upstash/redis auto-deserializes JSON on the way out.
      return hit
    }
  } catch {
    // Cache read failed — fall through to source.
  }

  const fresh = await fetchFn()

  try {
    await c.set(key, fresh, { ex: ttlSeconds })
  } catch {
    // Cache write failed — non-fatal, return the fresh value anyway.
  }

  return fresh
}

async function invalidate(key) {
  const c = getClient()
  if (!c) return
  try { await c.del(key) } catch {}
}

module.exports = { cached, invalidate }
