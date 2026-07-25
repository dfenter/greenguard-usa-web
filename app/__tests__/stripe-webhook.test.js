/**
 * Tests for /api/webhooks/stripe.js
 *
 * Covers:
 *  - checkout.session.completed: admin notified, customer receipt sent, HubSpot note, skips non-paid
 *  - invoice.payment_succeeded: admin notified, customer receipt sent, resurrection cleared
 *  - invoice.payment_failed: resurrection T0 email sent, HubSpot updated
 *  - Webhook signature verification failure
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockConstructEvent = jest.fn()
const mockCustomersRetrieve = jest.fn()
const mockListLineItems = jest.fn()
const mockPaymentIntentsRetrieve = jest.fn()

jest.mock('../lib/stripe', () => ({
  stripe: {
    webhooks: { constructEvent: mockConstructEvent },
    customers: { retrieve: mockCustomersRetrieve },
    checkout: { sessions: { listLineItems: mockListLineItems } },
    paymentIntents: { retrieve: mockPaymentIntentsRetrieve },
  },
}))

const mockNotifyAdmin = jest.fn().mockResolvedValue({ email: true, sms: false })
const mockSendCustomerReceipt = jest.fn().mockResolvedValue({ ok: true })
const mockSendCheckoutReceipt = jest.fn().mockResolvedValue({ ok: true })

jest.mock('../lib/purchase-notify', () => ({
  notifyAdmin: mockNotifyAdmin,
  sendCustomerReceipt: mockSendCustomerReceipt,
  sendCheckoutReceipt: mockSendCheckoutReceipt,
}))

const mockFindContactByEmail = jest.fn().mockResolvedValue({ id: 'hs_001' })
const mockUpsertContact = jest.fn().mockResolvedValue({ id: 'hs_001' })
const mockAddNote = jest.fn().mockResolvedValue({})

jest.mock('../lib/hubspot', () => ({
  upsertContact: mockUpsertContact,
  addNote: mockAddNote,
  findContactByEmail: mockFindContactByEmail,
}))

// The handler calls sendWelcomeEmail directly for quote-sourced checkouts.
// It MUST stay mocked: lib/email talks to Resend and the Gmail API, so an
// unmocked run mails every paid-quote fixture in this file for real.
const mockSendWelcomeEmail = jest.fn().mockResolvedValue({ id: 'email_test_welcome' })

jest.mock('../lib/email', () => ({
  sendWelcomeEmail: mockSendWelcomeEmail,
}))

const mockSendT0Email = jest.fn().mockResolvedValue({})
const mockMarkStage = jest.fn().mockResolvedValue({})
const mockClearStages = jest.fn().mockResolvedValue({})

jest.mock('../lib/payment-resurrection', () => ({
  sendT0Email: mockSendT0Email,
  markStage: mockMarkStage,
  clearStages: mockClearStages,
}))

const handler = require('../pages/api/webhooks/stripe').default

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockReq(body) {
  const raw = Buffer.from(JSON.stringify(body))
  const req = {
    method: 'POST',
    headers: { 'stripe-signature': 'sig_test' },
    on: jest.fn((event, cb) => {
      if (event === 'data') cb(raw)
      if (event === 'end') cb()
    }),
  }
  return req
}

function mockRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  res.end = jest.fn().mockReturnValue(res)
  return res
}

const MOCK_SESSION_PAID = {
  id: 'cs_test_paid',
  payment_status: 'paid',
  payment_intent: 'pi_test_001',
  payment_link: null,
  amount_total: 10500,
  currency: 'usd',
  customer_details: { name: 'Bob Smith', email: 'bob@example.com', phone: '5125551234' },
  customer_email: 'bob@example.com',
  metadata: { source: 'quote' },
}

const MOCK_SESSION_UNPAID = {
  ...MOCK_SESSION_PAID,
  id: 'cs_test_unpaid',
  payment_status: 'unpaid',
}

const MOCK_INVOICE = {
  id: 'in_test_001',
  customer: 'cus_test_001',
  amount_paid: 9900,
  amount_due: 9900,
  total: 9900,
  subtotal: 9075,
  tax: 825,
  currency: 'usd',
  charge: 'ch_test_001',
  hosted_invoice_url: 'https://invoice.stripe.com/i/test',
  lines: { data: [{ description: 'Monthly Rounds', amount: 9075 }] },
  metadata: {},
}

const MOCK_CUSTOMER = {
  id: 'cus_test_001',
  email: 'alice@example.com',
  name: 'Alice Test',
  phone: '5125550000',
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCustomersRetrieve.mockResolvedValue(MOCK_CUSTOMER)
  mockListLineItems.mockResolvedValue({ data: [{ description: 'Monthly Service', amount_total: 9900 }] })
  mockPaymentIntentsRetrieve.mockResolvedValue({
    latest_charge: { receipt_url: 'https://pay.stripe.com/receipts/test' },
  })
})

// ── Signature verification ────────────────────────────────────────────────────

test('invalid webhook signature returns 401', async () => {
  mockConstructEvent.mockImplementation(() => { throw new Error('Webhook signature failed') })
  const res = mockRes()
  await handler(mockReq({}), res)
  expect(res.status).toHaveBeenCalledWith(401)
})

test('GET method returns 405', async () => {
  const req = { method: 'GET', headers: {}, on: jest.fn() }
  const res = mockRes()
  await handler(req, res)
  expect(res.status).toHaveBeenCalledWith(405)
})

// ── checkout.session.completed ────────────────────────────────────────────────

describe('checkout.session.completed', () => {
  beforeEach(() => {
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: MOCK_SESSION_PAID },
    })
  })

  test('notifyAdmin is called with correct purchase shape', async () => {
    await handler(mockReq({}), mockRes())
    expect(mockNotifyAdmin).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'Quote checkout',
        customerName: 'Bob Smith',
        customerEmail: 'bob@example.com',
        amount: 10500,
        currency: 'usd',
      })
    )
  })

  test('sendCheckoutReceipt is called with session + items + receiptUrl', async () => {
    await handler(mockReq({}), mockRes())
    expect(mockSendCheckoutReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({ id: 'cs_test_paid' }),
        receiptUrl: 'https://pay.stripe.com/receipts/test',
      })
    )
  })

  test('HubSpot note added with PURCHASE marker', async () => {
    await handler(mockReq({}), mockRes())
    expect(mockAddNote).toHaveBeenCalledWith(
      'hs_001',
      expect.stringContaining('[PURCHASE]')
    )
  })

  test('HubSpot contact auto-created when not found', async () => {
    mockFindContactByEmail.mockResolvedValueOnce(null)
    mockUpsertContact.mockResolvedValueOnce({ id: 'hs_new' })
    await handler(mockReq({}), mockRes())
    expect(mockUpsertContact).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'bob@example.com', name: 'Bob Smith' })
    )
  })

  test('non-paid session (payment_status=unpaid) does nothing', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: { object: MOCK_SESSION_UNPAID },
    })
    await handler(mockReq({}), mockRes())
    expect(mockNotifyAdmin).not.toHaveBeenCalled()
    expect(mockSendCheckoutReceipt).not.toHaveBeenCalled()
  })

  test('Payment Link source label is set correctly', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: { object: { ...MOCK_SESSION_PAID, payment_link: 'pl_test_abc', metadata: {} } },
    })
    await handler(mockReq({}), mockRes())
    expect(mockNotifyAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ source: expect.stringContaining('Payment Link') })
    )
  })

  test('welcome email is sent for quote-sourced checkouts', async () => {
    await handler(mockReq({}), mockRes())
    expect(mockSendWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'bob@example.com', customerName: 'Bob Smith' })
    )
  })

  test('welcome email is skipped for non-quote checkouts', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: { object: { ...MOCK_SESSION_PAID, payment_link: 'pl_test_abc', metadata: {} } },
    })
    await handler(mockReq({}), mockRes())
    expect(mockSendWelcomeEmail).not.toHaveBeenCalled()
  })

  test('responds 200 on success', async () => {
    const res = mockRes()
    await handler(mockReq({}), res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ received: true })
  })
})

// ── invoice.payment_succeeded ─────────────────────────────────────────────────

describe('invoice.payment_succeeded', () => {
  beforeEach(() => {
    mockConstructEvent.mockReturnValue({
      type: 'invoice.payment_succeeded',
      data: { object: MOCK_INVOICE },
    })
  })

  test('notifyAdmin is called with invoice details', async () => {
    await handler(mockReq({}), mockRes())
    expect(mockNotifyAdmin).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'Invoice payment',
        customerName: MOCK_CUSTOMER.name,
        customerEmail: MOCK_CUSTOMER.email,
        amount: MOCK_INVOICE.amount_paid,
      })
    )
  })

  test('sendCustomerReceipt is called with invoice + customer', async () => {
    await handler(mockReq({}), mockRes())
    expect(mockSendCustomerReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        invoice: expect.objectContaining({ id: 'in_test_001' }),
        customer: expect.objectContaining({ email: 'alice@example.com' }),
      })
    )
  })

  test('HubSpot note added on payment', async () => {
    await handler(mockReq({}), mockRes())
    expect(mockAddNote).toHaveBeenCalledWith(
      'hs_001',
      expect.stringContaining('Payment received')
    )
  })

  test('clearStages called to reset resurrection state', async () => {
    await handler(mockReq({}), mockRes())
    expect(mockClearStages).toHaveBeenCalledWith(MOCK_INVOICE.id)
  })

  test('responds 200 on success', async () => {
    const res = mockRes()
    await handler(mockReq({}), res)
    expect(res.status).toHaveBeenCalledWith(200)
  })
})

// ── invoice.payment_failed ────────────────────────────────────────────────────

describe('invoice.payment_failed', () => {
  const failedInvoice = {
    ...MOCK_INVOICE,
    id: 'in_test_fail',
    amount_due: 9900,
    amount_paid: 0,
    metadata: {},
  }

  beforeEach(() => {
    mockConstructEvent.mockReturnValue({
      type: 'invoice.payment_failed',
      data: { object: failedInvoice },
    })
  })

  test('sendT0Email is called for first failure', async () => {
    await handler(mockReq({}), mockRes())
    expect(mockSendT0Email).toHaveBeenCalledWith(failedInvoice, MOCK_CUSTOMER)
  })

  test('markStage t0 is called after T0 email', async () => {
    await handler(mockReq({}), mockRes())
    expect(mockMarkStage).toHaveBeenCalledWith(failedInvoice.id, 't0')
  })

  test('skips T0 email when payfail_t0_at already set (already sent)', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'invoice.payment_failed',
      data: { object: { ...failedInvoice, metadata: { payfail_t0_at: '2026-05-01T00:00:00Z' } } },
    })
    await handler(mockReq({}), mockRes())
    expect(mockSendT0Email).not.toHaveBeenCalled()
  })

  test('HubSpot contact updated to payment_status failed', async () => {
    await handler(mockReq({}), mockRes())
    expect(mockUpsertContact).toHaveBeenCalledWith(
      expect.objectContaining({
        email: MOCK_CUSTOMER.email,
        metadata: expect.objectContaining({ payment_status: 'failed' }),
      })
    )
  })
})

// ── Unknown event types ───────────────────────────────────────────────────────

test('unknown event type is ignored gracefully', async () => {
  mockConstructEvent.mockReturnValue({
    type: 'payment_method.attached',
    data: { object: {} },
  })
  const res = mockRes()
  await handler(mockReq({}), res)
  expect(res.status).toHaveBeenCalledWith(200)
  expect(mockNotifyAdmin).not.toHaveBeenCalled()
})
