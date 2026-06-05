/**
 * Tests for /api/quote/checkout.js
 *
 * Covers: tax application, shipping line items, shipping address collection,
 * amount validation caps, JWT validation, and revoked-JTI guard.
 */

const { SignJWT } = require('jose')

// Mock stripe before requiring the handler
jest.mock('stripe', () => {
  const mockSessionCreate = jest.fn()
  const MockStripe = jest.fn(() => ({
    checkout: { sessions: { create: mockSessionCreate } },
  }))
  MockStripe._mockSessionCreate = mockSessionCreate
  return MockStripe
})

jest.mock('../lib/auth', () => ({
  isJtiRevoked: jest.fn().mockResolvedValue(false),
}))

const Stripe = require('stripe')
const { isJtiRevoked } = require('../lib/auth')
const handler = require('../pages/api/quote/checkout').default

const SECRET = 'test-secret-for-jest-that-is-exactly-32ch'

async function makeQuoteToken(payload = {}) {
  const base = {
    type: 'quote',
    customerEmail: 'alice@example.com',
    customerName: 'Alice Test',
    customerAddress: '123 Main St, Austin TX',
    serviceLines: [{ label: 'Monthly Service', amount: 99, recurring: true }],
    addonLines: [],
    productLines: [],
    recurringTotal: 99,
    oneTimeTotal: 0,
    taxRate: 0,
    taxAmount: 0,
    shippingTotal: 0,
    ...payload,
  }
  return new SignJWT(base)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setJti('test-jti-001')
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(SECRET))
}

function mockReq(body) {
  return { method: 'POST', body }
}

function mockRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  res.end = jest.fn().mockReturnValue(res)
  return res
}

beforeEach(() => {
  jest.clearAllMocks()
  Stripe._mockSessionCreate.mockResolvedValue({
    url: 'https://checkout.stripe.com/pay/cs_test_abc123',
  })
  isJtiRevoked.mockResolvedValue(false)
})

// ── HTTP method guard ─────────────────────────────────────────────────────────

test('GET returns 405', async () => {
  const req = { method: 'GET', body: {} }
  const res = mockRes()
  await handler(req, res)
  expect(res.status).toHaveBeenCalledWith(405)
})

// ── Token validation ──────────────────────────────────────────────────────────

test('missing token returns 400', async () => {
  const res = mockRes()
  await handler(mockReq({}), res)
  expect(res.status).toHaveBeenCalledWith(400)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'token required' }))
})

test('garbage token returns 400', async () => {
  const res = mockRes()
  await handler(mockReq({ token: 'not.a.jwt' }), res)
  expect(res.status).toHaveBeenCalledWith(400)
})

test('token signed with wrong secret returns 400', async () => {
  const badToken = await new SignJWT({ type: 'quote', serviceLines: [], addonLines: [], productLines: [] })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode('wrong-secret-totally-different-key!!!'))
  const res = mockRes()
  await handler(mockReq({ token: badToken }), res)
  expect(res.status).toHaveBeenCalledWith(400)
})

test('token with wrong type returns 400', async () => {
  const token = await new SignJWT({ type: 'magic' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(SECRET))
  const res = mockRes()
  await handler(mockReq({ token }), res)
  expect(res.status).toHaveBeenCalledWith(400)
})

test('revoked JTI returns 410', async () => {
  isJtiRevoked.mockResolvedValue(true)
  const token = await makeQuoteToken()
  const res = mockRes()
  await handler(mockReq({ token }), res)
  expect(res.status).toHaveBeenCalledWith(410)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('revoked') }))
})

test('quote with no priced items returns 400', async () => {
  const token = await makeQuoteToken({
    serviceLines: [], addonLines: [], productLines: [],
    recurringTotal: 0, oneTimeTotal: 0,
  })
  const res = mockRes()
  await handler(mockReq({ token }), res)
  expect(res.status).toHaveBeenCalledWith(400)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('no priced items') }))
})

// ── Texas tax always applied ──────────────────────────────────────────────────

test('8.25% TX tax line is always appended', async () => {
  // Quote has taxRate:0 — server must still add its own TX tax line
  const token = await makeQuoteToken({ taxRate: 0, taxAmount: 0 })
  const res = mockRes()
  await handler(mockReq({ token }), res)
  expect(res.status).toHaveBeenCalledWith(200)

  const { line_items } = Stripe._mockSessionCreate.mock.calls[0][0]
  const taxLine = line_items.find((l) => l.price_data.product_data.name === 'Tax (8.25% TX)')
  expect(taxLine).toBeDefined()

  // Service line = $99 → tax = 8.25% of 9900 cents = 816.75 → 817 cents
  const serviceCents = 9900
  const expectedTax = Math.round(serviceCents * 0.0825)
  expect(taxLine.price_data.unit_amount).toBe(expectedTax)
})

test('tax is calculated on subtotal before tax (not recursive)', async () => {
  // $200 one-time line, no shipping
  const token = await makeQuoteToken({
    serviceLines: [],
    productLines: [{ label: 'Product', amount: 200, recurring: false }],
    oneTimeTotal: 200,
    recurringTotal: 0,
  })
  const res = mockRes()
  await handler(mockReq({ token }), res)

  const { line_items } = Stripe._mockSessionCreate.mock.calls[0][0]
  const taxLine = line_items.find((l) => l.price_data.product_data.name === 'Tax (8.25% TX)')
  const expectedTax = Math.round(20000 * 0.0825) // 1650
  expect(taxLine.price_data.unit_amount).toBe(expectedTax)
})

// ── Shipping ──────────────────────────────────────────────────────────────────

test('no Shipping line when shippingTotal is 0', async () => {
  const token = await makeQuoteToken({ shippingTotal: 0 })
  const res = mockRes()
  await handler(mockReq({ token }), res)

  const { line_items, shipping_address_collection } = Stripe._mockSessionCreate.mock.calls[0][0]
  const shippingLine = line_items.find((l) => l.price_data.product_data.name === 'Shipping')
  expect(shippingLine).toBeUndefined()
  expect(shipping_address_collection).toBeUndefined()
})

test('Shipping line added and shipping_address_collection enabled when shippingTotal > 0', async () => {
  // Two BG traps × $10 = $20 shipping
  const token = await makeQuoteToken({
    productLines: [{ label: 'Biogents BG-Mosquitaire (x2)', amount: 198, recurring: false }],
    serviceLines: [],
    oneTimeTotal: 198,
    recurringTotal: 0,
    shippingTotal: 20,
  })
  const res = mockRes()
  await handler(mockReq({ token }), res)

  const { line_items, shipping_address_collection } = Stripe._mockSessionCreate.mock.calls[0][0]
  const shippingLine = line_items.find((l) => l.price_data.product_data.name === 'Shipping')
  expect(shippingLine).toBeDefined()
  expect(shippingLine.price_data.unit_amount).toBe(2000) // $20 in cents
  expect(shipping_address_collection).toEqual({ allowed_countries: ['US'] })
})

test('tax is applied to products only — shipping is exempt (TX delivery charges)', async () => {
  // $100 product → tax = 100 * 0.0825 = $8.25 → 825 cents. Shipping $10 added after, not taxed.
  const token = await makeQuoteToken({
    productLines: [{ label: 'Widget', amount: 100, recurring: false }],
    serviceLines: [],
    oneTimeTotal: 100,
    recurringTotal: 0,
    shippingTotal: 10,
  })
  const res = mockRes()
  await handler(mockReq({ token }), res)

  const { line_items } = Stripe._mockSessionCreate.mock.calls[0][0]
  const taxLine = line_items.find((l) => l.price_data.product_data.name === 'Tax (8.25% TX)')
  const expectedTax = Math.round(10000 * 0.0825) // 825 — product only, not shipping
  expect(taxLine.price_data.unit_amount).toBe(expectedTax)
})

test('shipping over $1,000 is rejected with 400', async () => {
  const token = await makeQuoteToken({
    productLines: [{ label: 'Mosqitter Grand', amount: 500, recurring: false }],
    serviceLines: [],
    oneTimeTotal: 500,
    recurringTotal: 0,
    shippingTotal: 1001,
  })
  const res = mockRes()
  await handler(mockReq({ token }), res)
  expect(res.status).toHaveBeenCalledWith(400)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Shipping') }))
})

// ── Amount validation caps ────────────────────────────────────────────────────

test('line exceeding $10,000 is rejected', async () => {
  const token = await makeQuoteToken({
    serviceLines: [{ label: 'Mega service', amount: 10001, recurring: false }],
    addonLines: [], productLines: [],
    oneTimeTotal: 10001, recurringTotal: 0,
  })
  const res = mockRes()
  await handler(mockReq({ token }), res)
  expect(res.status).toHaveBeenCalledWith(400)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Line amount exceeds maximum allowed' }))
})

// ── Checkout session config ───────────────────────────────────────────────────

test('customer email pre-filled in session config', async () => {
  const token = await makeQuoteToken({ customerEmail: 'bob@example.com' })
  const res = mockRes()
  await handler(mockReq({ token }), res)

  const sessionArg = Stripe._mockSessionCreate.mock.calls[0][0]
  expect(sessionArg.customer_email).toBe('bob@example.com')
})

test('session mode is payment', async () => {
  const token = await makeQuoteToken()
  const res = mockRes()
  await handler(mockReq({ token }), res)

  const sessionArg = Stripe._mockSessionCreate.mock.calls[0][0]
  expect(sessionArg.mode).toBe('payment')
})

test('success_url and cancel_url contain the token', async () => {
  const token = await makeQuoteToken()
  const res = mockRes()
  await handler(mockReq({ token }), res)

  const sessionArg = Stripe._mockSessionCreate.mock.calls[0][0]
  expect(sessionArg.success_url).toContain(token)
  expect(sessionArg.cancel_url).toContain(token)
  expect(sessionArg.success_url).toContain('accepted=1')
})

test('returns Stripe session URL on success', async () => {
  const token = await makeQuoteToken()
  const res = mockRes()
  await handler(mockReq({ token }), res)

  expect(res.status).toHaveBeenCalledWith(200)
  expect(res.json).toHaveBeenCalledWith({ url: 'https://checkout.stripe.com/pay/cs_test_abc123' })
})

// ── Recurring lines labelled "(first month)" ──────────────────────────────────

test('recurring lines get "(first month)" suffix', async () => {
  const token = await makeQuoteToken({
    serviceLines: [{ label: 'Rounds Plan', amount: 149, recurring: true }],
    addonLines: [], productLines: [],
    recurringTotal: 149, oneTimeTotal: 0,
  })
  const res = mockRes()
  await handler(mockReq({ token }), res)

  const { line_items } = Stripe._mockSessionCreate.mock.calls[0][0]
  const svcLine = line_items.find((l) => l.price_data.product_data.name.includes('Rounds Plan'))
  expect(svcLine.price_data.product_data.name).toContain('first month')
})

// ── Mixed quote (recurring + one-time + shipping) ────────────────────────────

test('full quote with service + product + shipping produces correct line count and total', async () => {
  // Monthly service $99 + CO2 tank $79 + shipping $50 → subtotal = $228 → tax = 228*0.0825 = $18.81 → 1881 cents
  const token = await makeQuoteToken({
    serviceLines: [{ label: 'Monthly Service', amount: 99, recurring: true }],
    addonLines: [],
    productLines: [{ label: 'CO2 Tank 20lb', amount: 79, recurring: false }],
    recurringTotal: 99,
    oneTimeTotal: 79,
    shippingTotal: 50,
  })
  const res = mockRes()
  await handler(mockReq({ token }), res)

  const { line_items } = Stripe._mockSessionCreate.mock.calls[0][0]
  // 3 non-tax lines: service, product, shipping + 1 tax line = 4 total
  expect(line_items).toHaveLength(4)

  const totalCents = line_items.reduce((s, l) => s + l.price_data.unit_amount, 0)
  // Tax applies to service + product ($99 + $79 = $178), not shipping ($50)
  const taxableSubtotal = 9900 + 7900 // 17800
  const expectedTax = Math.round(taxableSubtotal * 0.0825) // 1469
  const expectedTotal = taxableSubtotal + expectedTax + 5000 // service + product + tax + shipping
  expect(totalCents).toBe(expectedTotal)
})
