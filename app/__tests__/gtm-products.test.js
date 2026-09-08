const {
  PRODUCTS,
  DEFAULT_PRODUCT,
  isValidProduct,
  resolveProduct,
  tierFor,
  scoreFieldsFor,
} = require('../lib/gtm-products')

describe('DEFAULT_PRODUCT', () => {
  test('is sparkbridge', () => {
    expect(DEFAULT_PRODUCT).toBe('sparkbridge')
  })
})

describe('isValidProduct', () => {
  test('true for sparkbridge and ops', () => {
    expect(isValidProduct('sparkbridge')).toBe(true)
    expect(isValidProduct('ops')).toBe(true)
  })
  test('false for unknown/garbage/missing input', () => {
    expect(isValidProduct('nope')).toBe(false)
    expect(isValidProduct(undefined)).toBe(false)
    expect(isValidProduct(null)).toBe(false)
    expect(isValidProduct(123)).toBe(false)
    expect(isValidProduct('')).toBe(false)
  })
})

describe('resolveProduct', () => {
  test('string input: valid product passes through', () => {
    expect(resolveProduct('ops')).toBe('ops')
    expect(resolveProduct('sparkbridge')).toBe('sparkbridge')
  })
  test('string input: unknown falls back to default', () => {
    expect(resolveProduct('bogus')).toBe(DEFAULT_PRODUCT)
  })
  test('null/undefined falls back to default, never throws', () => {
    expect(() => resolveProduct(null)).not.toThrow()
    expect(resolveProduct(null)).toBe(DEFAULT_PRODUCT)
    expect(resolveProduct(undefined)).toBe(DEFAULT_PRODUCT)
  })
  test('reads product from req.query', () => {
    expect(resolveProduct({ query: { product: 'ops' } })).toBe('ops')
  })
  test('reads product from req.body when query absent', () => {
    expect(resolveProduct({ body: { product: 'ops' } })).toBe('ops')
  })
  test('unknown product in query/body falls back to default', () => {
    expect(resolveProduct({ query: { product: 'not-real' } })).toBe(DEFAULT_PRODUCT)
    expect(resolveProduct({ body: { product: 'not-real' } })).toBe(DEFAULT_PRODUCT)
  })
  test('malformed request-like objects never throw', () => {
    expect(() => resolveProduct({})).not.toThrow()
    expect(resolveProduct({})).toBe(DEFAULT_PRODUCT)
    expect(() => resolveProduct(42)).not.toThrow()
    expect(resolveProduct(42)).toBe(DEFAULT_PRODUCT)
    expect(() => resolveProduct({ query: null, body: null })).not.toThrow()
  })
})

describe('tierFor', () => {
  test('sparkbridge thresholds: A>=25, B>=18, else C', () => {
    expect(tierFor('sparkbridge', 25)).toBe('A')
    expect(tierFor('sparkbridge', 35)).toBe('A')
    expect(tierFor('sparkbridge', 18)).toBe('B')
    expect(tierFor('sparkbridge', 24)).toBe('B')
    expect(tierFor('sparkbridge', 17)).toBe('C')
    expect(tierFor('sparkbridge', 0)).toBe('C')
  })
  test('ops thresholds match spec (A>=25, B>=18)', () => {
    expect(tierFor('ops', 25)).toBe('A')
    expect(tierFor('ops', 18)).toBe('B')
    expect(tierFor('ops', 17)).toBe('C')
  })
  test('unknown product falls back to sparkbridge thresholds, never throws', () => {
    expect(() => tierFor('bogus', 25)).not.toThrow()
    expect(tierFor('bogus', 25)).toBe('A')
  })
})

describe('scoreFieldsFor', () => {
  test('sparkbridge fields copied exactly from prior hardcoded values', () => {
    expect(scoreFieldsFor('sparkbridge')).toEqual([
      ['s1', 'Ignition practice'],
      ['s2', 'Multi-site'],
      ['s3', 'MQTT'],
      ['s4', 'Vertical fit'],
      ['s5', 'Enterprise'],
      ['s6', 'Pain'],
      ['s7', 'Sophistication'],
    ])
  })
  test('ops fields per spec', () => {
    expect(scoreFieldsFor('ops')).toEqual([
      ['s1', 'Recurring cadence'],
      ['s2', 'Google/Stripe fit'],
      ['s3', 'Size band'],
      ['s4', 'Office pain'],
      ['s5', 'Owner-operated'],
      ['s6', 'Review volume'],
      ['s7', 'Reachability'],
    ])
  })
  test('unknown product falls back to sparkbridge fields', () => {
    expect(scoreFieldsFor('bogus')).toEqual(scoreFieldsFor('sparkbridge'))
  })
})

describe('PRODUCTS config sanity', () => {
  test('sparkbridge sheetId is the exact original value', () => {
    expect(PRODUCTS.sparkbridge.sheetId).toBe('1-Fm2-s7BJkM6HGokTDFOHnVUw4I0mbW-YqkYiuvywBI')
  })
  test('ops targets sheet is configured; hubspot pipeline still pending Dan', () => {
    // The OPS targets Sheet was created via Drive media upload. The HubSpot
    // "OPS Operators" pipeline must be created in the UI by Dan, so its id
    // stays null and lib/gtm-hubspot.js degrades gracefully until it exists.
    expect(typeof PRODUCTS.ops.sheetId).toBe('string')
    expect(PRODUCTS.ops.sheetId).toMatch(/^[A-Za-z0-9_-]{20,}$/)
    expect(PRODUCTS.ops.hubspot.pipelineId).toBeNull()
  })
  test('ops nav mirrors sparkbridge nav labels, under /gtm/ops', () => {
    const sbLabels = PRODUCTS.sparkbridge.nav.map((n) => n.label)
    const opsLabels = PRODUCTS.ops.nav.map((n) => n.label)
    expect(opsLabels).toEqual(sbLabels)
    for (const item of PRODUCTS.ops.nav) {
      expect(item.href === '/gtm/ops' || item.href.startsWith('/gtm/ops/')).toBe(true)
    }
  })
  test('labels', () => {
    expect(PRODUCTS.sparkbridge.label).toBe('SparkBridge')
    expect(PRODUCTS.ops.label).toBe('One Person Show')
  })
})
