const mockSendEmail = jest.fn().mockResolvedValue({ messageId: 'm1' })
jest.mock('../lib/email', () => ({ sendEmail: mockSendEmail }))
jest.mock('../lib/sparkbridge-license', () => ({
  skuInfo: (s) => (s === 'sparkvault' ? { name: 'SparkVault', unit: 'central gateway', cents: 99500, entitlements: ['io.sparkvault.historian'] } : null),
  issueForPurchase: ({ quantity }) => Array.from({ length: quantity }, (_, i) => ({ filename: `k${i + 1}.key`, content: `#sparkbridge-license/1\nkey${i + 1}` })),
  licenseEmailHtml: () => '<p>keys</p>',
  supportUntilFrom: (d) => new Date(d.getTime() + 365 * 86400000),
  isoDate: (d) => d.toISOString().slice(0, 10),
}))

const { fulfillSparkBridgeOrder } = require('../lib/sparkbridge-fulfill')

describe('fulfillSparkBridgeOrder', () => {
  const session = {
    id: 'cs_1', created: 1788000000, amount_total: 199000, amount_subtotal: 199000, currency: 'usd',
    customer_details: { email: 'buyer@acme.com', name: 'Jane Buyer' },
    custom_fields: [{ key: 'licensee', text: { value: 'Acme Water District' } }],
    metadata: { source: 'sparkbridge', sku: 'sparkvault', quantity: '1' },
  }
  const stripe = { checkout: { sessions: { listLineItems: jest.fn().mockResolvedValue({ data: [{ quantity: 2 }] }) } } }

  test('emails one key per gateway from the line-item quantity, with admin bcc and note', async () => {
    const notifyAdmin = jest.fn().mockResolvedValue({})
    const addNote = jest.fn().mockResolvedValue({})
    const findContactByEmail = jest.fn().mockResolvedValue({ id: 'c1' })
    const r = await fulfillSparkBridgeOrder({ session, stripe, notifyAdmin, addNote, findContactByEmail, upsertContact: jest.fn() })
    expect(r.keys).toBe(2)
    const call = mockSendEmail.mock.calls[0][0]
    expect(call.to).toBe('buyer@acme.com')
    expect(call.bcc).toBe('admin@greenguard-usa.com')
    expect(call.subject).toMatch(/SparkVault x 2/)
    expect(call.attachments).toHaveLength(2)
    expect(call.attachments[1].filename).toBe('k2.key')
    expect(notifyAdmin).toHaveBeenCalledWith(expect.objectContaining({ source: 'SparkBridge checkout', customerName: 'Acme Water District' }))
    expect(addNote).toHaveBeenCalledWith('c1', expect.stringMatching(/\[SPARKBRIDGE\] SparkVault x2/))
  })

  test('unknown sku throws so the webhook surfaces it', async () => {
    await expect(fulfillSparkBridgeOrder({ session: { ...session, metadata: { source: 'sparkbridge', sku: 'zzz' } }, stripe })).rejects.toThrow(/unknown sku/)
  })
})
