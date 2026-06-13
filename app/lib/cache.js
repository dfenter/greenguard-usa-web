// Two-tier cache: in-process memory (always on) + Redis (when configured).
//
// Tier 1 — in-memory Map. Works in every environment with zero config.
//   Entries expire lazily on next read. Survives within a single Vercel
//   function instance (typically minutes to hours of warm reuse).
//
// Tier 2 — Redis via Upstash REST. Cross-instance sharing. Requires either:
//   · Vercel KV  → KV_REST_API_URL / KV_REST_API_TOKEN
//   · Upstash    → UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
//
// Usage:
//   const customers = await cached('stripe:customers:all', 300, () => listAllCustomers())
//
// Conventions:
//  · Keys are colon-namespaced: `<system>:<entity>:<scope>`
//  · TTLs are in seconds.

const { Redis } = require('@upstash/redis')

// ── Tier 1: in-memory ────────────────────────────────────────────────────────
const memCache = new Map() // key → { value, expiresAt }

function memGet(key) {
  const entry = memCache.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) { memCache.delete(key); return undefined }
  return entry.value
}

function memSet(key, value, ttlSeconds) {
  memCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
}

function memDel(key) {
  memCache.delete(key)
}

// ── Tier 2: Redis ─────────────────────────────────────────────────────────────
let redisClient = null
function getRedis() {
  if (redisClient !== null) return redisClient
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) { redisClient = false; return null }
  try {
    redisClient = new Redis({ url, token })
    return redisClient
  } catch {
    redisClient = false
    return null
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
async function cached(key, ttlSeconds, fetchFn) {
  // Tier 1 hit
  const memHit = memGet(key)
  if (memHit !== undefined) return memHit

  // Tier 2 hit
  const redis = getRedis()
  if (redis) {
    try {
      const hit = await redis.get(key)
      if (hit !== null && hit !== undefined) {
        memSet(key, hit, ttlSeconds)
        return hit
      }
    } catch {}
  }

  // Cache miss — fetch fresh
  const fresh = await fetchFn()

  memSet(key, fresh, ttlSeconds)
  if (redis) {
    try { await redis.set(key, fresh, { ex: ttlSeconds }) } catch {}
  }

  return fresh
}

async function invalidate(key) {
  memDel(key)
  const redis = getRedis()
  if (redis) { try { await redis.del(key) } catch {} }
}

module.exports = { cached, invalidate }
