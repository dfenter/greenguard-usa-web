/**
 * Tests for the Cal.com webhook handler security paths.
 * Mocks all external dependencies so no real API calls are made.
 */

jest.mock('../lib/stripe', () => ({
  findOrCreateCustomer: jest.fn(),
  createSubscription: jest.fn(),
  addInvoiceItems: jest.fn(),
}))
jest.mock('../lib/hubspot', () => ({
  upsertContact: jest.fn().mockResolvedValue({ id: 'hs_1' }),
  addNote: jest.fn().mockResolvedValue({}),
}))

const crypto = require('crypto')

// Helper: build a minimal mock request
function buildReq({ body = {}, signature = '', method = 'POST' } = {}) {
  const rawBody = Buffer.from(JSON.stringify(body))
  return {
    method,
    headers: { 'x-cal-signature-256': signature },
    on(event, cb) {
      if (event === 'data') cb(rawBody)
      if (event === 'end') cb()
      return this
    },
  }
}

// Helper: build a valid HMAC signature
function sign(body, secret) {
  return crypto.createHmac('sha256', secret).update(Buffer.from(JSON.stringify(body))).digest('hex')
}

// Helper: mock response
function buildRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this },
    json(data) { this.body = data; return this },
    end() { return this },
  }
  return res
}

let handler

beforeAll(() => {
  handler = require('../pages/api/webhooks/calcom').default
})

afterEach(() => jest.clearAllMocks())

describe('Cal.com webhook security', () => {
  test('returns 405 for non-POST', async () => {
    const req = buildReq({ method: 'GET' })
    const res = buildRes()
    await handler(req, res)
    expect(res.statusCode).toBe(405)
  })

  test('returns 500 when CALCOM_WEBHOOK_SECRET is not set', async () => {
    const originalSecret = process.env.CALCOM_WEBHOOK_SECRET
    delete process.env.CALCOM_WEBHOOK_SECRET
    const req = buildReq({ body: { triggerEvent: 'BOOKING_CREATED' } })
    const res = buildRes()
    await handler(req, res)
    expect(res.statusCode).toBe(500)
    process.env.CALCOM_WEBHOOK_SECRET = originalSecret
  })

  test('returns 401 for wrong signature', async () => {
    const body = { triggerEvent: 'BOOKING_CREATED' }
    const req = buildReq({ body, signature: 'wrong_signature' })
    const res = buildRes()
    await handler(req, res)
    expect(res.statusCode).toBe(401)
  })

  test('returns 200 for non-BOOKING_CREATED event (with valid signature)', async () => {
    const body = { triggerEvent: 'BOOKING_CANCELLED' }
    const sig = sign(body, process.env.CALCOM_WEBHOOK_SECRET)
    const req = buildReq({ body, signature: sig })
    const res = buildRes()
    await handler(req, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ received: true })
  })
})

describe('Cal.com webhook free visit flow', () => {
  const { upsertContact } = require('../lib/hubspot')
  const { findOrCreateCustomer } = require('../lib/stripe')

  test('assessment visit: upserts HubSpot contact, skips Stripe', async () => {
    const body = {
      triggerEvent: 'BOOKING_CREATED',
      payload: {
        uid: 'booking_001',
        title: 'Free Assessment Visit',
        eventType: { title: 'Assessment Visit' },
        attendees: [{ email: 'test@example.com', name: 'Test User' }],
        responses: {},
        startTime: '2026-05-26T10:00:00Z',
      },
    }
    const sig = sign(body, process.env.CALCOM_WEBHOOK_SECRET)
    const req = buildReq({ body, signature: sig })
    const res = buildRes()
    await handler(req, res)
    expect(findOrCreateCustomer).not.toHaveBeenCalled()
    expect(upsertContact).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'test@example.com' })
    )
  })
})
