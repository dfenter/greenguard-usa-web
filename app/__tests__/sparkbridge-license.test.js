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

  test('retired items are not sellable but still fulfil', () => {
    for (const sku of ['central-package', 'sparkcalc', 'sparkid']) {
      expect(L.CATALOG[sku]).toBeUndefined()
      expect(L.skuInfo(sku)).toBeNull()
      expect(L.skuInfo(sku, { retired: true })).toBe(L.RETIRED[sku])
    }
    const ids = L.RETIRED['central-package'].entitlements
    expect(ids).toHaveLength(9)
    expect(ids).not.toContain(L.E.FLOW)
    const pkg = L.issueForPurchase({ sku: 'central-package', licensee: 'Acme' })[0].content
    expect(verify(pkg)).toBe(true)
    expect(L.skuInfo('sparkvault').cents).toBe(399500)
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

  test('pricing page add-ons are sellable at page prices', () => {
    const want = {
      sparkads: [69500, 'com.sparkbridge.sparkads'], sparks7: [69500, 'com.sparkbridge.sparks7'],
      spark61850: [69500, 'com.sparkbridge.spark61850'], sparkbacnet: [69500, 'com.sparkbridge.sparkbacnet'],
      sparknotify: [69500, 'com.sparkbridge.sparknotify'], sparkgantt: [69500, 'com.sparkbridge.sparkgantt'],
      sparkrecord: [799500, 'io.sparkrecord.gateway'], provider: [199500, 'io.sparkbridge.provider'],
    }
    for (const [sku, [cents, id]] of Object.entries(want)) {
      expect(L.skuInfo(sku).cents).toBe(cents)
      expect(L.skuInfo(sku).entitlements).toEqual([id])
    }
  })

  test('SparkValidate gateway and CLI SKUs carry separate entitlements', () => {
    expect(L.skuInfo('sparkvalidate').cents).toBe(249500)
    expect(L.skuInfo('sparkvalidate').entitlements).toEqual(['io.sparkvalidate'])
    expect(L.skuInfo('sparkvalidate').unit).toBe('gateway')
    const cli = L.skuInfo('sparkvalidate-cli')
    expect(cli.cents).toBe(99500)
    expect(cli.entitlements).toEqual(['io.sparkvalidate.cli'])
    expect(cli.unit).toBe('workstation')
    const k = L.issueForPurchase({ sku: 'sparkvalidate-cli', licensee: 'Acme' })[0].content
    expect(k.split('\n').filter((l) => l.startsWith('entitlements='))).toEqual(['entitlements=io.sparkvalidate.cli'])
    expect(verify(k)).toBe(true)
  })

  test('gitops key grants Host, SparkCalc and SparkID with GitOps', () => {
    expect(L.skuInfo('gitops').cents).toBe(999500)
    expect(L.skuInfo('gitops').entitlements).toEqual(['io.sparkbridge.host', 'io.sparkcalc.engine', 'cli.sparkbridge.sparkid', 'com.greenguardusa.gitops'])
  })

  test('one key per gateway bought', () => {
    const keys = L.issueForPurchase({ sku: 'edge', quantity: 3, licensee: 'Acme' })
    expect(keys.map((k) => k.filename)).toEqual(['sparkbridge-license-edge-1.key', 'sparkbridge-license-edge-2.key', 'sparkbridge-license-edge-3.key'])
    keys.forEach((k) => expect(verify(k.content)).toBe(true))
    expect(() => L.issueForPurchase({ sku: 'nope', licensee: 'x' })).toThrow(/unknown/)
  })
})
