/**
 * Tests for /lib/purchase-notify.js
 *
 * Covers: notifyAdmin (email + SMS), sendCustomerReceipt (invoice path),
 * sendCheckoutReceipt (session path), and edge cases (no email, no API key).
 */

const mockEmailSend = jest.fn().mockResolvedValue({ id: 'email_test_001' })

jest.mock('resend', () => {
  return {
    Resend: jest.fn().mockImplementation(() => ({
      emails: { send: mockEmailSend },
    })),
  }
})

const mockSendSms = jest.fn().mockResolvedValue({ ok: true })
jest.mock('../lib/sms', () => ({ sendSms: mockSendSms }))

beforeEach(() => {
  jest.clearAllMocks()
  process.env.RESEND_API_KEY = 'test_resend_key'
  process.env.OWNER_EMAIL = 'admin@greenguard-usa.com'
  process.env.PORTAL_FROM_EMAIL = 'noreply@greenguard-usa.com'
  process.env.ADMIN_SMS_NUMBER = ''   // SMS off by default in tests
  delete process.env.TWILIO_AUTH_TOKEN
})

const {
  notifyAdmin,
  sendCustomerReceipt,
  sendCheckoutReceipt,
} = require('../lib/purchase-notify')

// ── notifyAdmin ───────────────────────────────────────────────────────────────

describe('notifyAdmin', () => {
  const purchase = {
    source: 'Quote checkout',
    customerName: 'Alice Test',
    customerEmail: 'alice@example.com',
    customerPhone: '5125550001',
    amount: 10824,
    currency: 'usd',
    items: [
      { description: 'Monthly Service (first month)', amount: 9900 },
      { description: 'Tax (8.25% TX)', amount: 817 },
    ],
    stripeUrl: 'https://dashboard.stripe.com/payments/pi_test',
    ref: 'cs_test_abc',
  }

  test('sends email to admin with correct subject', async () => {
    await notifyAdmin(purchase)
    expect(mockEmailSend).toHaveBeenCalledTimes(1)
    const call = mockEmailSend.mock.calls[0][0]
    expect(call.to).toBe('admin@greenguard-usa.com')
    expect(call.subject).toContain('Alice Test')
    expect(call.subject).toContain('$108.24')
  })

  test('email HTML contains customer name and amount', async () => {
    await notifyAdmin(purchase)
    const { html } = mockEmailSend.mock.calls[0][0]
    expect(html).toContain('Alice Test')
    expect(html).toContain('$108.24')
  })

  test('email HTML contains line items', async () => {
    await notifyAdmin(purchase)
    const { html } = mockEmailSend.mock.calls[0][0]
    expect(html).toContain('Monthly Service')
    expect(html).toContain('Tax (8.25% TX)')
  })

  test('email HTML contains Stripe dashboard link', async () => {
    await notifyAdmin(purchase)
    const { html } = mockEmailSend.mock.calls[0][0]
    expect(html).toContain('dashboard.stripe.com')
  })

  test('returns { email: true } on success', async () => {
    const result = await notifyAdmin(purchase)
    expect(result.email).toBe(true)
  })

  test('skips email send when no RESEND_API_KEY', async () => {
    delete process.env.RESEND_API_KEY
    await notifyAdmin(purchase)
    expect(mockEmailSend).not.toHaveBeenCalled()
  })

  test('never texts the owner on a purchase, even with ADMIN_SMS_NUMBER set', async () => {
    // Owner payment alerts go by email + Slack only — the SMS was unwanted noise
    // once the iMessage daemon came online (disabled 2026-07-14).
    await jest.isolateModulesAsync(async () => {
      process.env.ADMIN_SMS_NUMBER = '+15125550000'
      const { notifyAdmin: notifyAdminFresh } = require('../lib/purchase-notify')
      await notifyAdminFresh(purchase)
      expect(mockSendSms).not.toHaveBeenCalled()
    })
  })

  test('HTML-escapes XSS-risk customer name', async () => {
    await notifyAdmin({ ...purchase, customerName: '<script>alert(1)</script>' })
    const { html } = mockEmailSend.mock.calls[0][0]
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

// ── sendCustomerReceipt (invoice path) ────────────────────────────────────────

describe('sendCustomerReceipt', () => {
  const invoice = {
    id: 'in_test_001',
    amount_paid: 10824,
    total: 10824,
    subtotal: 9900,
    tax: 817,
    charge: 'ch_test_001',
    hosted_invoice_url: 'https://invoice.stripe.com/i/test',
    lines: {
      data: [
        { description: 'Monthly Rounds', amount: 9900 },
      ],
    },
  }
  const customer = { email: 'alice@example.com', name: 'Alice Test' }

  test('sends receipt to customer email', async () => {
    await sendCustomerReceipt({ invoice, customer, receiptUrl: 'https://pay.stripe.com/receipt' })
    expect(mockEmailSend).toHaveBeenCalledTimes(1)
    const call = mockEmailSend.mock.calls[0][0]
    expect(call.to).toBe('alice@example.com')
  })

  test('subject contains amount paid', async () => {
    await sendCustomerReceipt({ invoice, customer, receiptUrl: null })
    const { subject } = mockEmailSend.mock.calls[0][0]
    expect(subject).toContain('$108.24')
    expect(subject).toContain('paid')
  })

  test('email body addresses customer by first name', async () => {
    await sendCustomerReceipt({ invoice, customer, receiptUrl: null })
    const { html } = mockEmailSend.mock.calls[0][0]
    expect(html).toContain('Thank you, Alice')
  })

  test('tax row shown when tax > 0', async () => {
    await sendCustomerReceipt({ invoice, customer, receiptUrl: null })
    const { html } = mockEmailSend.mock.calls[0][0]
    expect(html).toContain('Sales tax')
    expect(html).toContain('$8.17')
  })

  test('receipt button included when receiptUrl provided', async () => {
    await sendCustomerReceipt({ invoice, customer, receiptUrl: 'https://pay.stripe.com/receipts/r1' })
    const { html } = mockEmailSend.mock.calls[0][0]
    expect(html).toContain('pay.stripe.com/receipts')
  })

  test('invoice link included when hostedInvoiceUrl provided', async () => {
    await sendCustomerReceipt({ invoice, customer, receiptUrl: null, hostedInvoiceUrl: 'https://invoice.stripe.com/i/test' })
    const { html } = mockEmailSend.mock.calls[0][0]
    expect(html).toContain('invoice.stripe.com')
  })

  test('returns { ok: false } when customer has no email', async () => {
    const result = await sendCustomerReceipt({ invoice, customer: { name: 'No Email' }, receiptUrl: null })
    expect(result.ok).toBe(false)
    expect(mockEmailSend).not.toHaveBeenCalled()
  })

  test('returns { ok: false } when RESEND_API_KEY missing', async () => {
    delete process.env.RESEND_API_KEY
    const result = await sendCustomerReceipt({ invoice, customer, receiptUrl: null })
    expect(result.ok).toBe(false)
    expect(mockEmailSend).not.toHaveBeenCalled()
  })

  test('line items rendered in receipt', async () => {
    await sendCustomerReceipt({ invoice, customer, receiptUrl: null })
    const { html } = mockEmailSend.mock.calls[0][0]
    expect(html).toContain('Monthly Rounds')
  })
})

// ── sendCheckoutReceipt (session / quote path) ────────────────────────────────

describe('sendCheckoutReceipt', () => {
  const session = {
    id: 'cs_test_abc',
    amount_total: 10824,
    customer_details: { name: 'Bob Smith', email: 'bob@example.com' },
    customer_email: 'bob@example.com',
  }
  const items = [
    { description: 'Monthly Service (first month)', amount_total: 9900 },
    { description: 'Shipping', amount_total: 107 },
    { description: 'Tax (8.25% TX)', amount_total: 817 },
  ]

  test('sends receipt to customer email', async () => {
    await sendCheckoutReceipt({ session, items, receiptUrl: null })
    const call = mockEmailSend.mock.calls[0][0]
    expect(call.to).toBe('bob@example.com')
  })

  test('BCCs admin email', async () => {
    await sendCheckoutReceipt({ session, items, receiptUrl: null })
    const call = mockEmailSend.mock.calls[0][0]
    expect(call.bcc).toBe('admin@greenguard-usa.com')
  })

  test('subject contains total amount', async () => {
    await sendCheckoutReceipt({ session, items, receiptUrl: null })
    const { subject } = mockEmailSend.mock.calls[0][0]
    expect(subject).toContain('$108.24')
  })

  test('email body addresses customer by first name', async () => {
    await sendCheckoutReceipt({ session, items, receiptUrl: null })
    const { html } = mockEmailSend.mock.calls[0][0]
    expect(html).toContain('Thank you, Bob')
  })

  test('all line items rendered in receipt', async () => {
    await sendCheckoutReceipt({ session, items, receiptUrl: null })
    const { html } = mockEmailSend.mock.calls[0][0]
    expect(html).toContain('Monthly Service')
    expect(html).toContain('Shipping')
    expect(html).toContain('Tax (8.25% TX)')
  })

  test('receipt button shown when receiptUrl provided', async () => {
    await sendCheckoutReceipt({ session, items, receiptUrl: 'https://pay.stripe.com/receipts/ch_1' })
    const { html } = mockEmailSend.mock.calls[0][0]
    expect(html).toContain('pay.stripe.com/receipts')
  })

  test('falls back to customer_email when customer_details.email missing', async () => {
    await sendCheckoutReceipt({
      session: { ...session, customer_details: { name: 'Bob Smith' }, customer_email: 'bob@example.com' },
      items,
      receiptUrl: null,
    })
    const call = mockEmailSend.mock.calls[0][0]
    expect(call.to).toBe('bob@example.com')
  })

  test('returns { ok: false } when no email available', async () => {
    const result = await sendCheckoutReceipt({
      session: { ...session, customer_details: {}, customer_email: '' },
      items,
      receiptUrl: null,
    })
    expect(result.ok).toBe(false)
    expect(mockEmailSend).not.toHaveBeenCalled()
  })

  test('ref in footer is session id', async () => {
    await sendCheckoutReceipt({ session, items, receiptUrl: null })
    const { html } = mockEmailSend.mock.calls[0][0]
    expect(html).toContain('cs_test_abc')
  })
})
