const {
  createMagicToken,
  createSessionToken,
  verifyToken,
  getSessionFromRequest,
  SESSION_COOKIE_NAME,
} = require('../lib/auth')

describe('createMagicToken / verifyToken', () => {
  test('creates a verifiable magic token with correct type', async () => {
    const token = await createMagicToken('test@example.com')
    expect(typeof token).toBe('string')
    const payload = await verifyToken(token)
    expect(payload).not.toBeNull()
    expect(payload.email).toBe('test@example.com')
    expect(payload.type).toBe('magic')
  })

  test('verifyToken returns null for garbage input', async () => {
    expect(await verifyToken('not.a.token')).toBeNull()
    expect(await verifyToken('')).toBeNull()
    expect(await verifyToken(null)).toBeNull()
  })

  test('verifyToken returns null for token signed with wrong secret', async () => {
    // A token signed with a different secret should fail verification
    const { SignJWT } = require('jose')
    const wrongSecret = new TextEncoder().encode('wrong-secret-totally-different-key!!!')
    const badToken = await new SignJWT({ email: 'hack@example.com', type: 'magic' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('15m')
      .sign(wrongSecret)
    expect(await verifyToken(badToken)).toBeNull()
  })
})

describe('createSessionToken / verifyToken', () => {
  test('creates a verifiable session token with correct fields', async () => {
    const token = await createSessionToken('user@example.com', 'cus_test123')
    expect(typeof token).toBe('string')
    const payload = await verifyToken(token)
    expect(payload).not.toBeNull()
    expect(payload.email).toBe('user@example.com')
    expect(payload.stripeCustomerId).toBe('cus_test123')
    expect(payload.type).toBe('session')
  })
})

describe('getSessionFromRequest', () => {
  test('returns null when no cookie present', async () => {
    const req = { cookies: {} }
    expect(await getSessionFromRequest(req)).toBeNull()
  })

  test('returns null for a magic token in session cookie (wrong type)', async () => {
    const magicToken = await createMagicToken('user@example.com')
    const req = { cookies: { [SESSION_COOKIE_NAME]: magicToken } }
    expect(await getSessionFromRequest(req)).toBeNull()
  })

  test('returns payload for a valid session token', async () => {
    const sessionToken = await createSessionToken('user@example.com', 'cus_abc')
    const req = { cookies: { [SESSION_COOKIE_NAME]: sessionToken } }
    const payload = await getSessionFromRequest(req)
    expect(payload).not.toBeNull()
    expect(payload.email).toBe('user@example.com')
    expect(payload.stripeCustomerId).toBe('cus_abc')
  })

  test('returns null for tampered token', async () => {
    const sessionToken = await createSessionToken('user@example.com', 'cus_abc')
    const tampered = sessionToken.slice(0, -5) + 'XXXXX'
    const req = { cookies: { [SESSION_COOKIE_NAME]: tampered } }
    expect(await getSessionFromRequest(req)).toBeNull()
  })
})
