// Combined key per gateway: mergeGrants, fulfilment merge path, reissue API, store SQL.
const crypto = require('crypto')

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
process.env.SPARKBRIDGE_LICENSE_SIGNING_KEY = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')

const mockSendEmail = jest.fn().mockResolvedValue({ messageId: 'm1' })
jest.mock('../lib/email', () => ({ sendEmail: mockSendEmail }))

// In-memory stand-in for lib/sparkbridge-store with the same pair semantics.
const mockDb = { grants: [], keys: [], fail: false }
jest.mock('../lib/sparkbridge-store', () => {
  const ne = (e) => String(e || '').trim().toLowerCase()
  const ng = (g) => String(g || '').trim().toLowerCase()
  return {
    normEmail: ne,
    normGateway: ng,
    recordGrant: jest.fn(async (g) => {
      if (mockDb.fail) throw new Error('db down')
      if (mockDb.grants.some((x) => x.session_id === g.sessionId)) return false
      mockDb.grants.push({
        id: mockDb.grants.length + 1, email: ne(g.email), gateway_id: ng(g.gateway), gateway_display: g.gateway,
        licensee: g.licensee, sku: g.sku, entitlements: g.entitlements, support_until: g.supportUntil,
        session_id: g.sessionId, status: 'active', created_at: new Date(Date.UTC(2026, 8, 1) + mockDb.grants.length * 1000),
      })
      return true
    }),
    activeGrants: jest.fn(async (email, gateway) => {
      if (mockDb.fail) throw new Error('db down')
      return mockDb.grants.filter((g) => g.email === ne(email) && g.gateway_id === ng(gateway) && g.status === 'active')
    }),
    recordIssuedKey: jest.fn(async (k) => {
      const id = mockDb.keys.length + 1
      for (const x of mockDb.keys) {
        if (x.email === ne(k.email) && x.gateway_id === ng(k.gateway) && x.status === 'active') Object.assign(x, { status: 'superseded', superseded_by: id })
      }
      mockDb.keys.push({ id, email: ne(k.email), gateway_id: ng(k.gateway), entitlements: k.entitlements, reason: k.reason, status: 'active' })
      return id
    }),
  }
})

const L = require('../lib/sparkbridge-license')
const { fulfillSparkBridgeOrder } = require('../lib/sparkbridge-fulfill')
const reissue = require('../pages/api/sparkbridge/reissue').default

function verify(text) {
  const body = text.slice(L.MAGIC.length + 1, text.indexOf('\n#signature=') + 1)
  const sig = Buffer.from(text.split('#signature=')[1].trim(), 'base64')
  return crypto.verify('sha256', Buffer.from(body, 'utf8'), { key: publicKey, dsaEncoding: 'der' }, sig)
}
const entLine = (text) => text.split('\n').find((l) => l.startsWith('entitlements=')).slice('entitlements='.length).split(',')

beforeEach(() => {
  mockDb.grants = []
  mockDb.keys = []
  mockDb.fail = false
  mockSendEmail.mockClear()
})

describe('mergeGrants', () => {
  const g = (o) => ({ status: 'active', entitlements: [], ...o })

  test('unions and dedupes entitlements in first-seen order, oldest grant first', () => {
    const m = L.mergeGrants([
      g({ sku: 'gitops', entitlements: L.CATALOG.gitops.entitlements, created_at: '2026-09-02T00:00:00Z' }),
      g({ sku: 'central', entitlements: L.CATALOG.central.entitlements, created_at: '2026-09-01T00:00:00Z' }),
      g({ sku: 'sparks7', entitlements: [L.E.S7], created_at: '2026-09-03T00:00:00Z' }),
    ])
    expect(m.entitlements).toEqual([L.E.HOST, L.E.CALC, L.E.SPARKID, L.E.GITOPS, L.E.S7])
    expect(m.products).toEqual(['SparkBridge Host', 'GitOps / Enterprise Governance', 'SparkS7'])
  })

  test('SparkValidate gateway + CLI grants on one gateway merge to both ids', () => {
    const m = L.mergeGrants([
      g({ sku: 'sparkvalidate', entitlements: L.CATALOG.sparkvalidate.entitlements, created_at: '2026-09-01T00:00:00Z' }),
      g({ sku: 'sparkvalidate-cli', entitlements: L.CATALOG['sparkvalidate-cli'].entitlements, created_at: '2026-09-02T00:00:00Z' }),
      g({ sku: 'sparkvalidate', entitlements: [L.E.VALIDATE], created_at: '2026-09-03T00:00:00Z' }),
    ])
    expect(m.entitlements).toEqual(['io.sparkvalidate', 'io.sparkvalidate.cli'])
  })

  test('ignores superseded and revoked grants', () => {
    const m = L.mergeGrants([
      g({ sku: 'sparks7', entitlements: [L.E.S7] }),
      g({ sku: 'sparkvault', entitlements: [L.E.VAULT], status: 'revoked' }),
      g({ sku: 'dnp3', entitlements: [L.E.DNP3], status: 'superseded' }),
    ])
    expect(m.entitlements).toEqual([L.E.S7])
    expect(m.products).toEqual(['SparkS7'])
  })

  test('licensee from the most recent grant, support from the earliest date', () => {
    const m = L.mergeGrants([
      g({ sku: 'sparks7', entitlements: [L.E.S7], licensee: 'New Name', support_until: '2027-01-01', created_at: '2026-09-05T00:00:00Z' }),
      g({ sku: 'dnp3', entitlements: [L.E.DNP3], licensee: 'Old Name', support_until: '2027-09-01', created_at: '2026-09-01T00:00:00Z' }),
    ])
    expect(m.licensee).toBe('New Name')
    expect(L.isoDate(m.supportUntil)).toBe('2027-01-01')
  })

  test('no active grants throws', () => {
    expect(() => L.mergeGrants([])).toThrow(/no active grants/)
    expect(() => L.mergeGrants(null)).toThrow(/no active grants/)
    expect(() => L.mergeGrants([g({ entitlements: [L.E.S7], status: 'revoked' })])).toThrow(/no active grants/)
  })

  test('issueCombinedKey keeps gateway=any and verifies', () => {
    const k = L.issueCombinedKey({ grants: [g({ sku: 'sparks7', entitlements: [L.E.S7], licensee: 'Acme', support_until: '2027-09-01' })], gatewayDisplay: 'Plant-1' })
    expect(k.filename).toBe('sparkbridge-license.key')
    expect(k.content).toContain('\ngateway=any\n')
    expect(k.content).not.toContain('Plant-1')
    expect(verify(k.content)).toBe(true)
  })
})

describe('fulfilment with a gateway name', () => {
  const stripe = (q = 1) => ({ checkout: { sessions: { listLineItems: jest.fn().mockResolvedValue({ data: [{ quantity: q }] }) } } })
  const session = (id, sku, { email = 'buyer@acme.com', gateway = 'Plant-Gateway', quantity = '1', created = 1788000000 } = {}) => ({
    id, created, amount_total: 69500, currency: 'usd',
    customer_details: { email, name: 'Jane Buyer' },
    custom_fields: [{ key: 'licensee', text: { value: 'Acme Water' } }, ...(gateway != null ? [{ key: 'gateway', text: { value: gateway } }] : [])],
    metadata: { source: 'sparkbridge', sku, quantity },
  })

  test('second purchase for the same email + gateway yields one combined key and supersedes the first', async () => {
    const addNote = jest.fn().mockResolvedValue({})
    const hub = { addNote, findContactByEmail: jest.fn().mockResolvedValue({ id: 'c1' }), upsertContact: jest.fn() }
    const r1 = await fulfillSparkBridgeOrder({ session: session('cs_a', 'sparks7'), stripe: stripe(), ...hub })
    expect(r1).toEqual({ keys: 1, combined: true })
    const first = mockSendEmail.mock.calls[0][0]
    expect(first.attachments).toHaveLength(1)
    expect(first.attachments[0].filename).toBe('sparkbridge-license.key')
    expect(first.html).not.toMatch(/replaces the existing/)
    expect(first.html).toContain(L.REISSUE_URL)

    const r2 = await fulfillSparkBridgeOrder({ session: session('cs_b', 'gitops', { gateway: '  plant-gateway ', created: 1788100000 }), stripe: stripe(), ...hub })
    expect(r2.combined).toBe(true)
    expect(mockSendEmail).toHaveBeenCalledTimes(2)
    const second = mockSendEmail.mock.calls[1][0]
    expect(second.to).toBe('buyer@acme.com')
    expect(second.bcc).toBe('admin@greenguard-usa.com')
    expect(second.attachments).toHaveLength(1)
    const key = second.attachments[0].content
    expect(verify(key)).toBe(true)
    const ents = entLine(key)
    expect(ents).toContain('com.sparkbridge.sparks7')
    for (const e of L.CATALOG.gitops.entitlements) expect(ents).toContain(e)
    expect(key).toContain('\ngateway=any\n')
    expect(second.html).toMatch(/replaces the existing sparkbridge-license.key on gateway/)
    expect(second.html).toContain('SparkS7')
    expect(second.html).toContain('GitOps / Enterprise Governance')
    expect(second.html).toMatch(/delete or overwrite the old file/)
    expect(second.html).toContain(L.REISSUE_URL)
    expect(second.html).toMatch(/earliest support date among the products it covers/)
    expect(key).toContain('\nsupport-until=2027-08-29\n') // first purchase's term, not the later 2027-08-30

    expect(mockDb.keys).toHaveLength(2)
    expect(mockDb.keys[0]).toMatchObject({ status: 'superseded', superseded_by: 2, reason: 'purchase' })
    expect(mockDb.keys[1]).toMatchObject({ status: 'active', reason: 'purchase' })
    expect(addNote.mock.calls[1][1]).toMatch(/gateway="plant-gateway" combined key/)
  })

  test('webhook retry of the same session does not add a second grant', async () => {
    await fulfillSparkBridgeOrder({ session: session('cs_a', 'sparks7'), stripe: stripe() })
    await fulfillSparkBridgeOrder({ session: session('cs_a', 'sparks7'), stripe: stripe() })
    expect(mockDb.grants).toHaveLength(1)
  })

  test('same gateway name, different email: no merge', async () => {
    await fulfillSparkBridgeOrder({ session: session('cs_a', 'sparks7', { gateway: 'Ignition-Gateway' }), stripe: stripe() })
    await fulfillSparkBridgeOrder({ session: session('cs_b', 'dnp3', { gateway: 'Ignition-Gateway', email: 'other@else.com' }), stripe: stripe() })
    const second = mockSendEmail.mock.calls[1][0]
    expect(second.to).toBe('other@else.com')
    expect(entLine(second.attachments[0].content)).toEqual([L.E.DNP3])
    expect(second.html).not.toMatch(/replaces the existing/)
    expect(mockDb.keys.every((k) => k.status === 'active')).toBe(true)
  })

  test('no gateway name: per-purchase key, no store calls', async () => {
    const store = require('../lib/sparkbridge-store')
    store.recordGrant.mockClear()
    const r = await fulfillSparkBridgeOrder({ session: session('cs_c', 'sparks7', { gateway: null }), stripe: stripe() })
    expect(r).toEqual({ keys: 1, combined: false })
    expect(store.recordGrant).not.toHaveBeenCalled()
    expect(mockSendEmail.mock.calls[0][0].attachments[0].filename).toBe('sparkbridge-license-sparks7.key')
  })

  test('quantity 2: one key per gateway, no merge', async () => {
    const r = await fulfillSparkBridgeOrder({ session: session('cs_d', 'sparks7'), stripe: stripe(2) })
    expect(r).toEqual({ keys: 2, combined: false })
    expect(mockDb.grants).toHaveLength(0)
    expect(mockSendEmail.mock.calls[0][0].attachments.map((a) => a.filename)).toEqual(['sparkbridge-license-sparks7-1.key', 'sparkbridge-license-sparks7-2.key'])
  })

  test('store failure falls back to the per-purchase key', async () => {
    mockDb.fail = true
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const r = await fulfillSparkBridgeOrder({ session: session('cs_e', 'sparks7'), stripe: stripe() })
    expect(r).toEqual({ keys: 1, combined: false })
    expect(mockSendEmail.mock.calls[0][0].attachments[0].filename).toBe('sparkbridge-license-sparks7.key')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('fulfilment fallback around the combined key', () => {
  const stripe = { checkout: { sessions: { listLineItems: jest.fn().mockResolvedValue({ data: [{ quantity: 1 }] }) } } }
  const session = {
    id: 'cs_f', created: 1788000000, amount_total: 69500, currency: 'usd',
    customer_details: { email: 'buyer@acme.com', name: 'Jane' },
    custom_fields: [{ key: 'licensee', text: { value: 'Acme' } }, { key: 'gateway', text: { value: 'GW' } }],
    metadata: { source: 'sparkbridge', sku: 'sparks7', quantity: '1' },
  }

  test('merge or sign failure before the email falls back to the per-purchase key, one email', async () => {
    const spy = jest.spyOn(L, 'issueCombinedKey').mockImplementationOnce(() => { throw new Error('sign failed') })
    const err = jest.spyOn(console, 'error').mockImplementation(() => {})
    const r = await fulfillSparkBridgeOrder({ session, stripe })
    expect(r).toEqual({ keys: 1, combined: false })
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail.mock.calls[0][0].attachments[0].filename).toBe('sparkbridge-license-sparks7.key')
    spy.mockRestore()
    err.mockRestore()
  })

  test('a failed combined email is not followed by a second, legacy email', async () => {
    mockSendEmail.mockRejectedValueOnce(new Error('smtp down'))
    await expect(fulfillSparkBridgeOrder({ session, stripe })).rejects.toThrow(/smtp down/)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail.mock.calls[0][0].attachments[0].filename).toBe('sparkbridge-license.key')
  })
})

describe('reissue API', () => {
  // Fake clock: sleep advances fake time and yields a macrotask, so mocked DB/email work
  // (microtasks) finishes first unless it deliberately hangs.
  const fake = { t: 1000, sleeps: [] }
  beforeAll(() => {
    reissue.clock.now = () => fake.t
    reissue.clock.sleep = async (ms) => { fake.sleeps.push(ms); fake.t += Math.max(0, ms); await new Promise((r) => setImmediate(r)) }
  })
  let ipSeq = 0
  const call = async (method, body, ip = `10.0.0.${++ipSeq}`) => {
    const res = { statusCode: 0, body: null, headers: {} }
    res.status = (c) => { res.statusCode = c; return res }
    res.json = (b) => { res.body = b; return res }
    res.end = () => res
    res.setHeader = (k, v) => { res.headers[k] = v }
    const start = fake.t
    await reissue({ method, body, headers: { 'x-forwarded-for': `${ip}, 172.16.0.1` } }, res)
    res.elapsed = fake.t - start
    return res
  }
  const GENERIC = 'If that email holds active SparkBridge licences for that gateway, a combined key is on its way.'

  test('405 on GET', async () => {
    expect((await call('GET')).statusCode).toBe(405)
  })

  test('400 on bad input', async () => {
    expect((await call('POST', { email: 'nope', gateway: 'x' })).statusCode).toBe(400)
    expect((await call('POST', { email: 'a@b.co', gateway: '' })).statusCode).toBe(400)
    expect((await call('POST', { email: 'a@b.co', gateway: 'x'.repeat(101) })).statusCode).toBe(400)
  })

  test('no match: generic 200, no email', async () => {
    const r = await call('POST', { email: 'nobody@nowhere.com', gateway: 'GW' })
    expect(r.statusCode).toBe(200)
    expect(r.body.message).toBe(GENERIC)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  test('match: same generic 200, one email with one attachment to the email of record, then throttled', async () => {
    mockDb.grants.push(
      { id: 1, email: 'buyer@acme.com', gateway_id: 'gw-7', gateway_display: 'GW-7', licensee: 'Acme', sku: 'sparks7', entitlements: [L.E.S7], support_until: '2027-09-01', status: 'active', created_at: '2026-09-01T00:00:00Z' },
      { id: 2, email: 'buyer@acme.com', gateway_id: 'gw-7', gateway_display: 'GW-7', licensee: 'Acme', sku: 'dnp3', entitlements: [L.E.DNP3], support_until: '2027-09-02', status: 'active', created_at: '2026-09-02T00:00:00Z' },
    )
    const r = await call('POST', { email: 'Buyer@Acme.com', gateway: 'gw-7' })
    expect(r.statusCode).toBe(200)
    expect(r.body.message).toBe(GENERIC)
    expect(JSON.stringify(r.body)).not.toContain('sparkbridge-license')
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    const m = mockSendEmail.mock.calls[0][0]
    expect(m.to).toBe('buyer@acme.com')
    expect(m.bcc).toBe('admin@greenguard-usa.com')
    expect(m.attachments).toHaveLength(1)
    expect(entLine(m.attachments[0].content)).toEqual([L.E.S7, L.E.DNP3])
    expect(verify(m.attachments[0].content)).toBe(true)
    expect(mockDb.keys[mockDb.keys.length - 1]).toMatchObject({ reason: 'reissue', status: 'active' })

    const again = await call('POST', { email: 'buyer@acme.com', gateway: 'GW-7' })
    expect(again.statusCode).toBe(200)
    expect(again.body.message).toBe(GENERIC)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
  })

  const seed = (gw) => mockDb.grants.push({ id: 50, email: 'buyer@acme.com', gateway_id: gw, gateway_display: gw, licensee: 'Acme', sku: 'sparks7', entitlements: [L.E.S7], support_until: '2027-09-01', status: 'active', created_at: '2026-09-01T00:00:00Z' })

  test('match and no-match take the same padded time', async () => {
    seed('gw-t')
    const miss = await call('POST', { email: 'nobody@nowhere.com', gateway: 'gw-t' })
    const hit = await call('POST', { email: 'buyer@acme.com', gateway: 'gw-t' })
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(miss.elapsed).toBe(reissue.FLOOR_MS)
    expect(hit.elapsed).toBe(reissue.FLOOR_MS)
    expect(hit.body).toEqual(miss.body)
  })

  test('slow or hung match work is capped and still gets the generic reply on time', async () => {
    seed('gw-h')
    mockSendEmail.mockImplementationOnce(() => new Promise(() => {}))
    const err = jest.spyOn(console, 'error').mockImplementation(() => {})
    const r = await call('POST', { email: 'buyer@acme.com', gateway: 'gw-h' })
    expect(r.statusCode).toBe(200)
    expect(r.body.message).toBe(GENERIC)
    expect(r.elapsed).toBe(reissue.FLOOR_MS)
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/exceeded cap/))
    err.mockRestore()
  })

  test('per-IP throttle: the 11th request in an hour from one IP sends nothing, same reply', async () => {
    seed('gw-ip')
    for (let i = 0; i < 10; i++) await call('POST', { email: `x${i}@nowhere.com`, gateway: 'gw-ip' }, '203.0.113.9')
    const r = await call('POST', { email: 'buyer@acme.com', gateway: 'gw-ip' }, '203.0.113.9')
    expect(r.statusCode).toBe(200)
    expect(r.body.message).toBe(GENERIC)
    expect(r.elapsed).toBe(reissue.FLOOR_MS)
    expect(mockSendEmail).not.toHaveBeenCalled()
    await call('POST', { email: 'buyer@acme.com', gateway: 'gw-ip' }, '198.51.100.4')
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
  })
})
