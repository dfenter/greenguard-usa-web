const { SignJWT, jwtVerify } = require('jose')
const crypto = require('crypto')

function getSecret() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters')
  }
  return new TextEncoder().encode(process.env.JWT_SECRET)
}

const MAGIC_LINK_EXPIRY = '1h'
const SESSION_EXPIRY = '90d'

// ── Single-use jti store ─────────────────────────────────────────────────
// Tries Vercel KV; falls back to in-memory (per Lambda instance) when KV
// isn't configured. The in-memory fallback catches the common reuse cases
// (back-button, double-click) but does NOT protect across instances.
let _kv = null
function getKV() {
  if (_kv !== null) return _kv
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    _kv = false
    // Surface the degradation once — otherwise single-use magic links / login
    // codes / invoice locks silently become multi-use across lambda instances
    // (the June 2026 env-wipe made this failure mode real and invisible).
    console.warn('[auth] KV not configured (KV_REST_API_URL/TOKEN missing) — single-use token + lock checks fall back to per-instance memory, which is NOT safe across serverless instances.')
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

const _memJtis = new Map() // jti → expiresAt(ms)
const _MAX_MEM_JTIS = 5000  // cap memory use — LRU evict oldest when exceeded
const _memLoginCodes = new Map() // login-code key → { hash, exp(ms), att } (dev/local fallback only)

function _memPrune() {
  const now = Date.now()
  for (const [k, exp] of _memJtis) if (exp < now) _memJtis.delete(k)
  // LRU eviction if still over limit
  if (_memJtis.size > _MAX_MEM_JTIS) {
    const sorted = [..._memJtis.entries()].sort((a, b) => a[1] - b[1])
    sorted.slice(0, Math.floor(_MAX_MEM_JTIS / 5)).forEach(([k]) => _memJtis.delete(k))
  }
}

// Proactive cleanup every 5 minutes to prevent unbounded growth.
// unref() so this housekeeping timer never by itself keeps the process alive:
// it still fires for as long as there is real work, but a process with nothing
// left to do can exit. Without it, `jest` hangs forever after the last test
// instead of exiting (observed 2026-07-25: a test run sat live for 90 minutes).
if (typeof setInterval !== 'undefined') {
  const _pruneTimer = setInterval(_memPrune, 5 * 60 * 1000)
  if (typeof _pruneTimer.unref === 'function') _pruneTimer.unref()
}

async function consumeJti(jti, ttlSeconds = 900) {
  if (!jti) return false
  const kv = getKV()
  if (kv) {
    // SET NX with EX — returns 'OK' on first use, null if already set
    const result = await kv.set(`jti:${jti}`, '1', { nx: true, ex: ttlSeconds })
    return result === 'OK'
  }
  _memPrune()
  if (_memJtis.has(jti)) return false
  _memJtis.set(jti, Date.now() + ttlSeconds * 1000)
  return true
}

// Cron jobs must fail closed when the cross-instance store is unavailable.
// Unlike consumeJti(), this never falls back to per-instance memory.
async function consumeJtiStrict(jti, ttlSeconds = 900) {
  if (!jti) return false
  const kv = getKV()
  if (!kv) throw new Error('KV is required for strict single-use claims')
  const result = await kv.set(`jti:${jti}`, '1', { nx: true, ex: ttlSeconds })
  return result === 'OK'
}

// Revoke a long-lived jti (e.g. a quote link admin wants to invalidate).
// Stored separately from consumeJti so the two sets don't collide.
async function revokeJti(jti, ttlSeconds = 30 * 24 * 3600) {
  if (!jti) return
  const kv = getKV()
  if (kv) { await kv.set(`revoked:${jti}`, '1', { ex: ttlSeconds }); return }
  _memJtis.set(`revoked:${jti}`, Date.now() + ttlSeconds * 1000)
}

async function isJtiRevoked(jti) {
  if (!jti) return false
  const kv = getKV()
  if (kv) return Boolean(await kv.get(`revoked:${jti}`))
  _memPrune()
  return _memJtis.has(`revoked:${jti}`)
}

// Mark a quote (by its jti) as paid so its checkout link can't be paid a second
// time after the Stripe idempotency key expires (~24h). Separate namespace from
// revocation so a paid quote gets its own "already paid" message.
async function markQuotePaid(jti, ttlSeconds = 90 * 24 * 3600) {
  if (!jti) return
  const kv = getKV()
  if (kv) { await kv.set(`paid:${jti}`, '1', { ex: ttlSeconds }); return }
  _memJtis.set(`paid:${jti}`, Date.now() + ttlSeconds * 1000)
}

async function isQuotePaid(jti) {
  if (!jti) return false
  const kv = getKV()
  if (kv) return Boolean(await kv.get(`paid:${jti}`))
  _memPrune()
  return _memJtis.has(`paid:${jti}`)
}

function newJti() {
  return crypto.randomBytes(16).toString('hex')
}

// ── Short numeric login codes (for in-app PWA sign-in) ───────────────────
// A 6-digit code emailed alongside the magic link. Bruce types it INSIDE the
// standalone home-screen PWA, so the session cookie is set in the PWA's own
// storage context. (Tapping the magic link opens Safari — a separate cookie
// jar — so the session never reaches the installed app; that's why he had to
// log in every time.) Codes are single-use, hashed at rest, expire in 15 min,
// and lock out after 5 wrong tries.
const LOGIN_CODE_TTL = 900          // 15 minutes (seconds)
const LOGIN_CODE_MAX_ATTEMPTS = 5

function newLoginCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0')
}

function _hashLoginCode(email, code) {
  return crypto.createHash('sha256').update(`${String(email).toLowerCase()}:${code}`).digest('hex')
}

async function storeLoginCode(email, code) {
  const em = String(email).toLowerCase()
  const key = `login-code:${em}`
  const hash = _hashLoginCode(em, code)
  const kv = getKV()
  if (kv) {
    await kv.set(key, hash, { ex: LOGIN_CODE_TTL })
    await kv.del(`login-code-att:${em}`) // reset attempt counter for the new code
    return
  }
  _memLoginCodes.set(key, { hash, exp: Date.now() + LOGIN_CODE_TTL * 1000, att: 0 })
}

// Returns true exactly once for the correct, unexpired code; consumes it.
async function consumeLoginCode(email, code) {
  const em = String(email || '').toLowerCase()
  if (!em || !/^\d{6}$/.test(String(code || ''))) return false
  const key = `login-code:${em}`
  const want = _hashLoginCode(em, String(code))
  const kv = getKV()
  if (kv) {
    const attKey = `login-code-att:${em}`
    const attempts = await kv.incr(attKey)
    if (attempts === 1) await kv.expire(attKey, LOGIN_CODE_TTL)
    if (attempts > LOGIN_CODE_MAX_ATTEMPTS) { await kv.del(key); return false }
    // Read the TTL before the atomic consume so a wrong code can restore the
    // hash for later attempts. There is a small race if another request changes
    // the key between TTL and GETDEL; the atomic GETDEL still guarantees that
    // only one request can consume the current code.
    const remainingTtl = await kv.ttl(key)
    const stored = await kv.getdel(key)
    if (!stored) return false
    const storedString = String(stored)
    const ok = storedString.length === want.length && crypto.timingSafeEqual(Buffer.from(storedString), Buffer.from(want))
    if (ok) {
      await kv.del(attKey)
    } else if (attempts < LOGIN_CODE_MAX_ATTEMPTS && remainingTtl > 0) {
      await kv.set(key, String(stored), { ex: remainingTtl })
    }
    return ok
  }
  const rec = _memLoginCodes.get(key)
  if (!rec || rec.exp < Date.now()) { _memLoginCodes.delete(key); return false }
  rec.att += 1
  if (rec.att > LOGIN_CODE_MAX_ATTEMPTS) { _memLoginCodes.delete(key); return false }
  const ok = rec.hash === want
  if (ok) _memLoginCodes.delete(key)
  return ok
}

async function createMagicToken(email) {
  const jti = newJti()
  const token = await new SignJWT({ email, type: 'magic' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setJti(jti)
    .setExpirationTime(MAGIC_LINK_EXPIRY)
    .sign(getSecret())
  return token
}

async function createSessionToken(email, stripeCustomerId) {
  const role = isOwnerEmail(email) ? 'owner' : isAdminEmail(email) ? 'tech' : stripeCustomerId ? 'customer' : 'prospect'
  return new SignJWT({ email, stripeCustomerId, role, type: 'session' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_EXPIRY)
    .sign(getSecret())
}

async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload
  } catch {
    return null
  }
}

async function getSessionFromRequest(req, res) {
  const cookie = req.cookies?.gg_session
  if (!cookie) return null
  const payload = await verifyToken(cookie)
  if (!payload || payload.type !== 'session') return null
  // Backfill role for sessions issued before the role field existed
  if (!payload.role) {
    payload.role = isOwnerEmail(payload.email) ? 'owner' : isAdminEmail(payload.email) ? 'tech' : payload.stripeCustomerId ? 'customer' : 'prospect'
  }
  // Sliding session — refresh cookie if it was issued more than 1 day ago
  // Keeps iOS PWA sessions alive as long as Bruce uses the app at least weekly
  if (res && payload.iat && (Date.now() / 1000 - payload.iat) > 86400) {
    const { serialize } = require('cookie')
    const fresh = await createSessionToken(payload.email, payload.stripeCustomerId)
    res.setHeader('Set-Cookie', serialize(SESSION_COOKIE_NAME, fresh, SESSION_COOKIE_OPTIONS))
  }
  return payload
}

function isAdminEmail(email) {
  if (!email) return false
  const raw = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'
  const admins = raw.split(',').map((e) => e.trim().toLowerCase())
  return admins.includes(email.toLowerCase())
}

function isOwnerEmail(email) {
  if (!email) return false
  const raw = process.env.OWNER_EMAIL || process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'
  const owner = raw.split(',')[0].trim().toLowerCase()
  return email.toLowerCase() === owner
}

// ── Auth gate helpers — return null on success, send response + return payload on failure ──
// Usage:
//   const session = await requireOwner(req, res); if (!session) return
async function _gate(req, res, predicate, errorStatus = 403) {
  const session = await getSessionFromRequest(req, res)
  if (!session) { res.status(401).json({ error: 'Unauthorized' }); return null }
  if (!predicate(session)) { res.status(errorStatus).json({ error: 'Forbidden' }); return null }
  return session
}
const requireSession = (req, res) => _gate(req, res, () => true, 401)
const requireAdmin   = (req, res) => _gate(req, res, (s) => isAdminEmail(s.email))
const requireOwner   = (req, res) => _gate(req, res, (s) => isOwnerEmail(s.email))

// Escape a value for Stripe's search query DSL — prevents `email:"a"+OR+x:"y"` injection
function escapeStripeSearch(v) {
  return String(v ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

const SESSION_COOKIE_NAME = 'gg_session'
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,          // Always HTTPS (portal is always on Vercel/HTTPS)
  sameSite: 'lax',      // Lax allows magic link redirects from email clients
  path: '/',
  maxAge: 60 * 60 * 24 * 90, // 90 days in seconds
}

module.exports = {
  createMagicToken,
  createSessionToken,
  verifyToken,
  getSessionFromRequest,
  isAdminEmail,
  isOwnerEmail,
  requireSession,
  requireAdmin,
  requireOwner,
  consumeJti,
  consumeJtiStrict,
  revokeJti,
  isJtiRevoked,
  markQuotePaid,
  isQuotePaid,
  newJti,
  newLoginCode,
  storeLoginCode,
  consumeLoginCode,
  escapeStripeSearch,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
}
