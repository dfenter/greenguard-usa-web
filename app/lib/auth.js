const { SignJWT, jwtVerify } = require('jose')

function getSecret() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters')
  }
  return new TextEncoder().encode(process.env.JWT_SECRET)
}

const MAGIC_LINK_EXPIRY = '15m'
const SESSION_EXPIRY = '7d'

/**
 * Create a signed JWT for a magic link (short-lived).
 */
async function createMagicToken(email) {
  return new SignJWT({ email, type: 'magic' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(MAGIC_LINK_EXPIRY)
    .sign(getSecret())
}

/**
 * Create a signed JWT for a session cookie (long-lived).
 */
async function createSessionToken(email, stripeCustomerId) {
  return new SignJWT({ email, stripeCustomerId, type: 'session' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_EXPIRY)
    .sign(getSecret())
}

/**
 * Verify any JWT and return the payload.
 * Returns null on failure instead of throwing.
 */
async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload
  } catch {
    return null
  }
}

/**
 * Extract and verify the session cookie from a Next.js request.
 * Returns the payload or null.
 */
async function getSessionFromRequest(req) {
  const cookie = req.cookies?.gg_session
  if (!cookie) return null
  const payload = await verifyToken(cookie)
  if (!payload || payload.type !== 'session') return null
  return payload
}

const SESSION_COOKIE_NAME = 'gg_session'
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 24 * 30, // 30 days in seconds
}

module.exports = {
  createMagicToken,
  createSessionToken,
  verifyToken,
  getSessionFromRequest,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
}
