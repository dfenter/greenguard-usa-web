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
// Finding 31 — Stale-while-revalidate: each entry has a soft expiry (serve-fresh window) and
// a hard expiry. Between them the value is served instantly while a background
// refresh runs, so a reader past the TTL never eats full upstream latency.
const memCache = new Map() // key → { value, softExpiresAt, hardExpiresAt }
const MAX_MEM_ENTRIES = 2000 // cap so dynamic keys (per-email-set) can't grow unbounded

function memGet(key) {
  const entry = memCache.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.hardExpiresAt) { memCache.delete(key); return undefined }
  return entry
}

function memSet(key, value, ttlSeconds, staleSeconds = ttlSeconds) {
  const now = Date.now()
  // Bounded eviction: when full and adding a new key, drop the soonest-to-expire
  // entry. Keeps a warm instance from accumulating per-email-set keys forever.
  if (memCache.size >= MAX_MEM_ENTRIES && !memCache.has(key)) {
    let oldestKey, oldestExp = Infinity
    for (const [k, e] of memCache) { if (e.hardExpiresAt < oldestExp) { oldestExp = e.hardExpiresAt; oldestKey = k } }
    if (oldestKey !== undefined) memCache.delete(oldestKey)
  }
  memCache.set(key, {
    value,
    softExpiresAt: now + ttlSeconds * 1000,
    hardExpiresAt: now + (ttlSeconds + staleSeconds) * 1000,
  })
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

// ── Single-flight ────────────────────────────────────────────────────────────
// In-flight fetches keyed by cache key. When N callers miss the same cold key
// concurrently, only the first runs fetchFn; the rest await the same promise.
// Prevents a thundering herd on Stripe/HubSpot/GCal when a hot key expires.
const inflight = new Map() // key → Promise<value>

// Fetch fresh, write through both tiers. Single-flight: concurrent callers for
// the same key share one fetchFn run. Returns the fetched value (throws on
// fetchFn failure for the synchronous-miss path).
function runFetch(key, ttlSeconds, staleSeconds, fetchFn) {
  const pending = inflight.get(key)
  if (pending) return pending

  const fetchPromise = (async () => {
    const fresh = await fetchFn()
    memSet(key, fresh, ttlSeconds, staleSeconds)
    const redis = getRedis()
    if (redis) {
      // Store the write time so a cross-instance reader can compute the value's
      // real age and only grant the REMAINING fresh window (a Redis hit near its
      // 2×ttl expiry used to get a full fresh ttl again — up to ~3× staleness).
      try { await redis.set(key, { __v: fresh, __t: Date.now() }, { ex: ttlSeconds + staleSeconds }) } catch {}
    }
    return fresh
  })()
  inflight.set(key, fetchPromise)
  // Clear the in-flight slot when settled. The extra .catch keeps this detached
  // chain from surfacing as an unhandled rejection; the returned fetchPromise
  // still rejects for the caller.
  fetchPromise.finally(() => inflight.delete(key)).catch(() => {})
  return fetchPromise
}

// ── Public API ────────────────────────────────────────────────────────────────
async function cached(key, ttlSeconds, fetchFn) {
  const staleSeconds = ttlSeconds // serve-stale window equals the TTL

  // Tier 1 hit
  const entry = memGet(key)
  if (entry !== undefined) {
    if (Date.now() <= entry.softExpiresAt) return entry.value // still fresh
    // Stale: serve immediately, refresh in the background. Keep serving the
    // stale value if the refresh fails (graceful degradation).
    if (!inflight.has(key)) runFetch(key, ttlSeconds, staleSeconds, fetchFn).catch(() => {})
    return entry.value
  }

  // Tier 2 hit
  const redis = getRedis()
  if (redis) {
    try {
      const hit = await redis.get(key)
      if (hit !== null && hit !== undefined) {
        // New writes are wrapped { __v, __t }; legacy raw values (pre-deploy)
        // are served as-is with a full window until they expire.
        let value = hit, ageSec = 0
        if (hit && typeof hit === 'object' && '__t' in hit) {
          value = hit.__v
          ageSec = (Date.now() - hit.__t) / 1000
        }
        memSet(key, value, Math.max(0, ttlSeconds - ageSec), staleSeconds)
        return value
      }
    } catch {}
  }

  // Cold miss — fetch synchronously (single-flight coalesces concurrent misses)
  return runFetch(key, ttlSeconds, staleSeconds, fetchFn)
}

async function invalidate(key) {
  memDel(key)
  const redis = getRedis()
  if (redis) { try { await redis.del(key) } catch {} }
}

module.exports = { cached, invalidate }
