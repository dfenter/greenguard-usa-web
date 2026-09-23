const crypto = require('crypto')

describe('sparkbridge-license', () => {
  let L, pub
  beforeAll(() => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    process.env.SPARKBRIDGE_LICENSE_SIGNING_KEY = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')
    pub = publicKey
    L = require('../lib/sparkbridge-license')
  })

  function verify(text) {
    const body = text.slice(L.MAGIC.length + 1, text.indexOf('\n#signature=') + 1)
    const sig = Buffer.from(text.split('#signature=')[1].trim(), 'base64')
    return crypto.verify('sha256', Buffer.from(body, 'utf8'), { key: pub, dsaEncoding: 'der' }, sig)
  }

  test('issues a key in the Java text format that verifies', () => {
    const k = L.issueKey({ licensee: 'Acme\nWater', entitlements: [L.E.HOST, L.E.VAULT], issued: new Date('2026-08-29T12:00:00Z'), supportUntil: new Date('2027-08-29T00:00:00Z') })
    expect(k.startsWith('#sparkbridge-license/1\nlicensee=Acme Water\ngateway=any\nentitlements=io.sparkbridge.host,io.sparkvault.historian\nissued=2026-08-29\nsupport-until=2027-08-29\n#signature=')).toBe(true)
    expect(verify(k)).toBe(true)
    expect(verify(k.replace('gateway=any', 'gateway=x'))).toBe(false)
  })

  test('central package carries all nine ids and never SparkFlow', () => {
    const ids = L.CATALOG['central-package'].entitlements
    expect(ids).toHaveLength(9)
    expect(ids).not.toContain(L.E.FLOW)
    expect(L.CATALOG['central-package'].cents).toBe(399500)
    expect(L.CATALOG.sparkvault.cents).toBe(399500)
  })

  test('Host and Provider are separate entitlements', () => {
    expect(L.CATALOG.central.name).toBe('SparkBridge Host')
    expect(L.CATALOG.central.cents).toBe(149500)
    expect(L.CATALOG.central.entitlements).toEqual([L.E.HOST, L.E.CALC, L.E.SPARKID])
    expect(L.CATALOG.provider.cents).toBe(199500)
    expect(L.CATALOG.provider.entitlements).toEqual([L.E.PROVIDER])
    const host = L.issueForPurchase({ sku: 'central', licensee: 'Acme' })[0].content
    expect(host).toContain('\nentitlements=io.sparkbridge.host,io.sparkcalc.engine,cli.sparkbridge.sparkid\n')
    expect(host).not.toContain(L.E.PROVIDER)
    const prov = L.issueForPurchase({ sku: 'provider', licensee: 'Acme' })[0]
    expect(prov.filename).toBe('sparkbridge-license-provider.key')
    expect(prov.content).toContain('\nentitlements=io.sparkbridge.provider\n')
    expect(verify(prov.content)).toBe(true)
  })

  test('one key per gateway bought', () => {
    const keys = L.issueForPurchase({ sku: 'edge', quantity: 3, licensee: 'Acme' })
    expect(keys.map((k) => k.filename)).toEqual(['sparkbridge-license-edge-1.key', 'sparkbridge-license-edge-2.key', 'sparkbridge-license-edge-3.key'])
    keys.forEach((k) => expect(verify(k.content)).toBe(true))
    expect(() => L.issueForPurchase({ sku: 'nope', licensee: 'x' })).toThrow(/unknown/)
  })
})
