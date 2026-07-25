/**
 * Tests for /api/admin/cancel-booking.js
 *
 * Regression cover for the adversarial review finding: the route used to resolve
 * "the customer's most recent draft-or-open invoice" by EMAIL ALONE and void it.
 * Voiding is irreversible in Stripe, so cancelling an appointment for a customer
 * who had an unrelated unpaid invoice destroyed that invoice.
 *
 * The invariant these tests pin: an invoice is only ever mutated when it is
 * matched to THIS booking. No confident match => no Stripe mutation at all.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockVoidInvoice = jest.fn().mockResolvedValue({})
const mockDelInvoice = jest.fn().mockResolvedValue({})
const mockRetrieveInvoice = jest.fn()
const mockCustomersSearch = jest.fn()
const mockInvoicesList = jest.fn()
const mockFindInvoiceForBooking = jest.fn()

jest.mock('../lib/stripe', () => ({
  stripe: {
    invoices: {
      voidInvoice: mockVoidInvoice,
      del: mockDelInvoice,
      retrieve: mockRetrieveInvoice,
      list: mockInvoicesList,
    },
    customers: { search: mockCustomersSearch },
  },
  findInvoiceForBooking: mockFindInvoiceForBooking,
}))

const mockCancelBooking = jest.fn().mockResolvedValue({})
jest.mock('../lib/calcom', () => ({ cancelBooking: mockCancelBooking }))

jest.mock('../lib/auth', () => ({
  getSessionFromRequest: jest.fn().mockResolvedValue({ email: 'admin@greenguard-usa.com' }),
  isAdminEmail: jest.fn().mockReturnValue(true),
}))

const handler = require('../pages/api/admin/cancel-booking').default

function mockRes() {
  const res = { statusCode: null, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  res.end = () => res
  return res
}

const BOOKING = { bookingId: 'cal_123', customerEmail: 'jane@example.com' }

beforeEach(() => {
  jest.clearAllMocks()
  mockCancelBooking.mockResolvedValue({})
  mockVoidInvoice.mockResolvedValue({})
  mockDelInvoice.mockResolvedValue({})
})

function expectNoInvoiceMutation() {
  expect(mockVoidInvoice).not.toHaveBeenCalled()
  expect(mockDelInvoice).not.toHaveBeenCalled()
}

describe('cancel-booking — invoice safety', () => {
  test('THE REGRESSION: an unrelated open invoice is never voided when no booking identifier is supplied', async () => {
    // Customer has an unpaid July invoice that has nothing to do with this booking.
    mockInvoicesList.mockResolvedValue({ data: [{ id: 'in_unrelated', status: 'open' }] })
    mockCustomersSearch.mockResolvedValue({ data: [{ id: 'cus_1' }] })

    const res = mockRes()
    await handler({ method: 'POST', body: { ...BOOKING } }, res)

    expectNoInvoiceMutation()
    expect(mockFindInvoiceForBooking).not.toHaveBeenCalled()
    expect(res.body).toMatchObject({ ok: true, invoiceAction: 'skipped_no_identifier' })
  })

  test('no-op when the booking has no matching invoice', async () => {
    mockFindInvoiceForBooking.mockResolvedValue(null)

    const res = mockRes()
    await handler({ method: 'POST', body: { ...BOOKING, calBookingUid: 'uid_abc' } }, res)

    expectNoInvoiceMutation()
    expect(res.body).toMatchObject({ invoiceAction: 'skipped_no_match' })
  })

  test('voids only the invoice matched to this booking', async () => {
    mockFindInvoiceForBooking.mockResolvedValue({ id: 'in_thisbooking', status: 'open' })
    mockRetrieveInvoice.mockResolvedValue({ id: 'in_thisbooking', status: 'open' })

    const res = mockRes()
    await handler({ method: 'POST', body: { ...BOOKING, calBookingUid: 'uid_abc' } }, res)

    expect(mockVoidInvoice).toHaveBeenCalledTimes(1)
    expect(mockVoidInvoice).toHaveBeenCalledWith('in_thisbooking')
    expect(res.body).toMatchObject({ invoiceAction: 'voided' })
  })

  test('deletes a matched draft rather than voiding it', async () => {
    mockFindInvoiceForBooking.mockResolvedValue({ id: 'in_draft', status: 'draft' })
    mockRetrieveInvoice.mockResolvedValue({ id: 'in_draft', status: 'draft' })

    const res = mockRes()
    await handler({ method: 'POST', body: { ...BOOKING, calBookingUid: 'uid_abc' } }, res)

    expect(mockDelInvoice).toHaveBeenCalledWith('in_draft')
    expect(mockVoidInvoice).not.toHaveBeenCalled()
    expect(res.body).toMatchObject({ invoiceAction: 'deleted' })
  })

  test('never touches a PAID invoice, even when it matches the booking', async () => {
    mockFindInvoiceForBooking.mockResolvedValue({ id: 'in_paid', status: 'paid' })
    mockRetrieveInvoice.mockResolvedValue({ id: 'in_paid', status: 'paid' })

    const res = mockRes()
    await handler({ method: 'POST', body: { ...BOOKING, calBookingUid: 'uid_abc' } }, res)

    expectNoInvoiceMutation()
    expect(res.body).toMatchObject({ invoiceAction: 'skipped_paid' })
  })

  test('re-reads status before mutating, so a stale cached match cannot void a paid invoice', async () => {
    // findInvoiceForBooking is cached 30s — it may report "open" after payment landed.
    mockFindInvoiceForBooking.mockResolvedValue({ id: 'in_race', status: 'open' })
    mockRetrieveInvoice.mockResolvedValue({ id: 'in_race', status: 'paid' })

    const res = mockRes()
    await handler({ method: 'POST', body: { ...BOOKING, calBookingUid: 'uid_abc' } }, res)

    expect(mockRetrieveInvoice).toHaveBeenCalledWith('in_race')
    expectNoInvoiceMutation()
    expect(res.body).toMatchObject({ invoiceAction: 'skipped_paid' })
  })

  test('reschedule keeps the draft and mutates nothing', async () => {
    mockFindInvoiceForBooking.mockResolvedValue({ id: 'in_draft', status: 'draft' })

    const res = mockRes()
    await handler(
      { method: 'POST', body: { ...BOOKING, calBookingUid: 'uid_abc', action: 'reschedule' } },
      res
    )

    expectNoInvoiceMutation()
    expect(res.body).toMatchObject({ invoiceAction: 'kept_as_draft' })
  })

  test('a Stripe failure is surfaced, not silently reported as success', async () => {
    mockFindInvoiceForBooking.mockRejectedValue(new Error('stripe exploded'))

    const res = mockRes()
    await handler({ method: 'POST', body: { ...BOOKING, calBookingUid: 'uid_abc' } }, res)

    expect(res.body).toMatchObject({ invoiceAction: 'error', invoiceError: 'stripe exploded' })
  })

  test('serviceDate alone is a sufficient identifier', async () => {
    mockFindInvoiceForBooking.mockResolvedValue(null)

    const res = mockRes()
    await handler({ method: 'POST', body: { ...BOOKING, serviceDate: '2026-07-25' } }, res)

    expect(mockFindInvoiceForBooking).toHaveBeenCalledWith(
      'jane@example.com',
      expect.objectContaining({ serviceDate: '2026-07-25' })
    )
  })

  test('the Cal.com booking is still cancelled even when the invoice step is skipped', async () => {
    const res = mockRes()
    await handler({ method: 'POST', body: { bookingId: 'cal_123' } }, res)

    expect(mockCancelBooking).toHaveBeenCalledWith('cal_123', expect.any(String))
    expect(res.body).toMatchObject({ ok: true })
  })
})
