/**
 * Tests for /pages/api/ops/proof.js
 *
 * Public read-only aggregate endpoint for the marketing site's /proof page.
 * Covers CORS, method gating, happy path, total-failure resilience, and the
 * no-PII contract.
 */

jest.mock('../lib/cache', () => ({
  cached: jest.fn((key, ttl, fn) => fn()),
}))

const mockCountContactsByProperty = jest.fn()
jest.mock('../lib/hubspot', () => ({
  countContactsByProperty: (...args) => mockCountContactsByProperty(...args),
}))

const mockGetBookingsForDateRange = jest.fn()
jest.mock('../lib/gcal', () => ({
  // The endpoint deliberately uses the PAGINATED variant so a busy month is
  // never silently truncated. Mock that one, or this suite would be mocking a
  // function the handler does not call.
  getBookingsForDateRangePaginated: (...args) => mockGetBookingsForDateRange(...args),
}))

const mockListAllInvoicesSince = jest.fn()
const mockInvoicesList = jest.fn()
jest.mock('../lib/stripe', () => ({
  listAllInvoicesSince: (...args) => mockListAllInvoicesSince(...args),
  stripe: { invoices: { list: (...args) => mockInvoicesList(...args) } },
}))

// stripe.invoices.list is used as an async iterable (for await...of) in the
// handler, mirroring the real Stripe SDK's auto-paginating list().
function asyncIterableFrom(items) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const item of items) yield item
    },
  }
}

const mockQ = jest.fn()
jest.mock('../lib/db', () => ({
  q: (...args) => mockQ(...args),
}))

const mockListRuns = jest.fn()
jest.mock('../lib/payroll-store', () => ({
  listRuns: (...args) => mockListRuns(...args),
}))

const handler = require('../pages/api/ops/proof')

function mockRes() {
  const res = {}
  res.statusCode = undefined
  res.headers = {}
  res.status = jest.fn((code) => { res.statusCode = code; return res })
  res.json = jest.fn((body) => { res.body = body; return res })
  res.end = jest.fn(() => res)
  res.setHeader = jest.fn((k, v) => { res.headers[k] = v })
  return res
}

const ALLOWED_ORIGIN = 'https://ops.greenguard-usa.com'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('OPTIONS preflight', () => {
  test('returns 204 and sets CORS header for an allowed origin', async () => {
    const req = { method: 'OPTIONS', headers: { origin: ALLOWED_ORIGIN } }
    const res = mockRes()
    await handler(req, res)
    expect(res.status).toHaveBeenCalledWith(204)
    expect(res.headers['Access-Control-Allow-Origin']).toBe(ALLOWED_ORIGIN)
  })
})

describe('CORS allowlist', () => {
  test('disallowed origin gets no Access-Control-Allow-Origin header', async () => {
    const req = { method: 'GET', headers: { origin: 'https://evil.example.com' } }
    const res = mockRes()
    await handler(req, res)
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined()
  })
})

describe('method gating', () => {
  test('non-GET returns 405', async () => {
    const req = { method: 'POST', headers: { origin: ALLOWED_ORIGIN } }
    const res = mockRes()
    await handler(req, res)
    expect(res.status).toHaveBeenCalledWith(405)
  })
})

describe('happy path', () => {
  test('returns 200 with computed keys', async () => {
    mockCountContactsByProperty.mockResolvedValue(42)

    const now = Date.now()
    mockGetBookingsForDateRange.mockResolvedValue([
      { id: 'a', startTime: new Date(now - 5 * 86400000).toISOString() },
      { id: 'b', startTime: new Date(now - 10 * 86400000).toISOString() },
      { id: 'c', startTime: new Date(now + 86400000).toISOString() }, // future, excluded
    ])

    const nowIso = new Date().toISOString()
    mockListAllInvoicesSince.mockResolvedValue([
      { status: 'paid', created: 1000, status_transitions: { paid_at: 1000 + 3 * 86400 }, metadata: {} },
      {
        status: 'paid', created: 2000, status_transitions: { paid_at: 2000 + 5 * 86400 },
        metadata: { payfail_t0_at: nowIso }, // recovered failed card, in-window
      },
    ])
    mockInvoicesList.mockReturnValue(
      asyncIterableFrom([{ id: 'in_1', status: 'open' }, { id: 'in_2', status: 'paid' }, { id: 'in_3', status: 'draft' }])
    )

    mockQ.mockResolvedValue({ rows: [{ ym: '2026-08' }, { ym: '2026-07' }] })

    mockListRuns.mockResolvedValue([
      { payDate: '2026-01-15', status: 'finalized' },
      { payDate: '2026-02-15', status: 'void' },      // voided runs do not count
      { payDate: '2026-03-15', status: 'draft' },     // an unpaid draft is not a run
      { payDate: '2025-12-15', status: 'finalized' }, // prior year
    ])

    const req = { method: 'GET', headers: { origin: ALLOWED_ORIGIN } }
    const res = mockRes()
    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    const body = res.body
    expect(body.activeRecurring).toBe(42)
    expect(body.visits30d).toBe(2)
    expect(typeof body.medianDaysToPaid).toBe('number')
    expect(body.lastClose).toBe('2026-08')
    expect(body.payrollRunsYtd).toBe(1)
    expect(typeof body.generatedAt).toBe('string')
    expect(body.week).toEqual({
      invoicesIssued: 2, // draft excluded
      invoicesPaid: 2,
      failedCardsRecovered: 1,
    })
    // listAllInvoicesSince is called once for the 90-day median window and
    // once (shared) for the 7-day week window — never a second time for the
    // week figures.
    expect(mockListAllInvoicesSince).toHaveBeenCalledTimes(2)
  })
})

describe('week object', () => {
  beforeEach(() => {
    mockCountContactsByProperty.mockResolvedValue(1)
    mockGetBookingsForDateRange.mockResolvedValue([])
    mockQ.mockResolvedValue({ rows: [] })
    mockListRuns.mockResolvedValue([])
  })

  test('week key is omitted entirely when every week source throws', async () => {
    mockListAllInvoicesSince.mockRejectedValue(new Error('stripe down'))
    mockInvoicesList.mockImplementation(() => { throw new Error('stripe list down') })

    const req = { method: 'GET', headers: { origin: ALLOWED_ORIGIN } }
    const res = mockRes()
    await handler(req, res)

    expect(res.body.week).toBeUndefined()
  })

  test('week omits only the key whose source throws, keeps the rest', async () => {
    mockListAllInvoicesSince.mockResolvedValue([
      { status: 'paid', created: 1000, status_transitions: { paid_at: 1500 }, metadata: {} },
    ])
    mockInvoicesList.mockImplementation(() => { throw new Error('stripe list down') })

    const req = { method: 'GET', headers: { origin: ALLOWED_ORIGIN } }
    const res = mockRes()
    await handler(req, res)

    expect(res.body.week).toEqual({ invoicesPaid: 1, failedCardsRecovered: 0 })
  })

  test('failedCardsRecovered excludes a payfail marker outside the 7-day window', async () => {
    const staleIso = new Date(Date.now() - 30 * 86400000).toISOString()
    mockListAllInvoicesSince.mockResolvedValue([
      {
        status: 'paid', created: 1000, status_transitions: { paid_at: 1500 },
        metadata: { payfail_t0_at: staleIso },
      },
    ])
    mockInvoicesList.mockReturnValue(asyncIterableFrom([]))

    const req = { method: 'GET', headers: { origin: ALLOWED_ORIGIN } }
    const res = mockRes()
    await handler(req, res)

    expect(res.body.week).toEqual({ invoicesIssued: 0, invoicesPaid: 1, failedCardsRecovered: 0 })
  })

  test('ownerOfficeHoursWeek is never present (no persisted source)', async () => {
    mockListAllInvoicesSince.mockResolvedValue([])
    mockInvoicesList.mockReturnValue(asyncIterableFrom([]))

    const req = { method: 'GET', headers: { origin: ALLOWED_ORIGIN } }
    const res = mockRes()
    await handler(req, res)

    expect(res.body.ownerOfficeHoursWeek).toBeUndefined()
  })
})

describe('total failure resilience', () => {
  test('still 200, does not throw, broken keys omitted', async () => {
    mockCountContactsByProperty.mockRejectedValue(new Error('hubspot down'))
    mockGetBookingsForDateRange.mockRejectedValue(new Error('gcal down'))
    mockListAllInvoicesSince.mockRejectedValue(new Error('stripe down'))
    mockInvoicesList.mockImplementation(() => { throw new Error('stripe list down') })
    mockQ.mockRejectedValue(new Error('db down'))
    mockListRuns.mockRejectedValue(new Error('payroll down'))

    const req = { method: 'GET', headers: { origin: ALLOWED_ORIGIN } }
    const res = mockRes()

    await expect(handler(req, res)).resolves.not.toThrow()

    expect(res.status).toHaveBeenCalledWith(200)
    const body = res.body
    expect(body.activeRecurring).toBeUndefined()
    expect(body.visits30d).toBeUndefined()
    expect(body.medianDaysToPaid).toBeUndefined()
    expect(body.lastClose).toBeUndefined()
    expect(body.payrollRunsYtd).toBeUndefined()
    expect(body.week).toBeUndefined()
    expect(typeof body.generatedAt).toBe('string')
  })
})

describe('no PII', () => {
  test('response contains no PII fields', async () => {
    mockCountContactsByProperty.mockResolvedValue(10)
    mockGetBookingsForDateRange.mockResolvedValue([
      { id: 'a', startTime: new Date().toISOString(), name: 'Should Not Leak', email: 'leak@example.com' },
    ])
    mockListAllInvoicesSince.mockResolvedValue([])
    mockInvoicesList.mockReturnValue(asyncIterableFrom([]))
    mockQ.mockResolvedValue({ rows: [] })
    mockListRuns.mockResolvedValue([])

    const req = { method: 'GET', headers: { origin: ALLOWED_ORIGIN } }
    const res = mockRes()
    await handler(req, res)

    const body = res.body
    const json = JSON.stringify(body)
    expect(json).not.toMatch(/leak@example\.com/)
    expect(json).not.toMatch(/Should Not Leak/)
    expect(body.reminderShare).toBeUndefined()
    expect(body.ownerOfficeHoursWeek).toBeUndefined()
    const keys = Object.keys(body)
    const allowed = new Set([
      'activeRecurring', 'visits30d', 'reminderShare', 'medianDaysToPaid',
      'lastClose', 'payrollRunsYtd', 'generatedAt', 'week',
    ])
    for (const k of keys) expect(allowed.has(k)).toBe(true)
    if (body.week) {
      const weekAllowed = new Set(['invoicesIssued', 'invoicesPaid', 'failedCardsRecovered'])
      for (const k of Object.keys(body.week)) expect(weekAllowed.has(k)).toBe(true)
    }
  })
})

describe('hardening', () => {
  test('a request with no headers object still returns 200', async () => {
    mockCountContactsByProperty.mockResolvedValue(5)
    mockGetBookingsForDateRange.mockResolvedValue([])
    mockListAllInvoicesSince.mockResolvedValue([])
    mockInvoicesList.mockReturnValue(asyncIterableFrom([]))
    mockQ.mockResolvedValue({ rows: [] })
    mockListRuns.mockResolvedValue([])

    const req = { method: 'GET' } // no headers at all
    const res = mockRes()

    await expect(handler(req, res)).resolves.not.toThrow()
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined()
  })

  test('when the cache layer itself throws, still 200 with only generatedAt', async () => {
    const { cached } = require('../lib/cache')
    cached.mockImplementationOnce(() => { throw new Error('cache exploded') })

    const req = { method: 'GET', headers: { origin: ALLOWED_ORIGIN } }
    const res = mockRes()

    await expect(handler(req, res)).resolves.not.toThrow()
    expect(res.status).toHaveBeenCalledWith(200)
    expect(Object.keys(res.body)).toEqual(['generatedAt'])
  })
})
