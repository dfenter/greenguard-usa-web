const fs = require('fs')
const path = require('path')

const { scoreTotalAndTier } = require('../lib/gtm-score')
const { colLetter } = require('../lib/gtm-sheets')
const { csvSafeField, toCsvRow } = require('../lib/gtm-csv')
const { slugifyFirm } = require('../lib/gtm-slug')

describe('score total + tier', () => {
  function s(total7) {
    // Distribute a total across 7 scores (each 0-5, sum = total7).
    const scores = { s1: 0, s2: 0, s3: 0, s4: 0, s5: 0, s6: 0, s7: 0 }
    let remaining = total7
    for (const k of Object.keys(scores)) {
      const v = Math.min(5, remaining)
      scores[k] = v
      remaining -= v
    }
    return scores
  }

  test('17 -> C', () => {
    expect(scoreTotalAndTier(s(17)).tier).toBe('C')
  })
  test('18 -> B', () => {
    expect(scoreTotalAndTier(s(18)).tier).toBe('B')
  })
  test('24 -> B', () => {
    expect(scoreTotalAndTier(s(24)).tier).toBe('B')
  })
  test('25 -> A', () => {
    expect(scoreTotalAndTier(s(25)).tier).toBe('A')
  })
  test('35 -> A', () => {
    expect(scoreTotalAndTier(s(35)).tier).toBe('A')
  })
  test('total is the sum', () => {
    expect(scoreTotalAndTier(s(20)).total).toBe(20)
  })

  test('rejects out-of-range score', () => {
    expect(() => scoreTotalAndTier({ s1: 6, s2: 0, s3: 0, s4: 0, s5: 0, s6: 0, s7: 0 })).toThrow()
    expect(() => scoreTotalAndTier({ s1: -1, s2: 0, s3: 0, s4: 0, s5: 0, s6: 0, s7: 0 })).toThrow()
  })
  test('rejects non-integer score', () => {
    expect(() => scoreTotalAndTier({ s1: 2.5, s2: 0, s3: 0, s4: 0, s5: 0, s6: 0, s7: 0 })).toThrow()
    expect(() => scoreTotalAndTier({ s1: '3', s2: 0, s3: 0, s4: 0, s5: 0, s6: 0, s7: 0 })).toThrow()
  })
  test('rejects missing score', () => {
    expect(() => scoreTotalAndTier({ s1: 1, s2: 1, s3: 1, s4: 1, s5: 1, s6: 1 })).toThrow()
  })
})

describe('column letter mapping', () => {
  test('1 -> A', () => expect(colLetter(1)).toBe('A'))
  test('26 -> Z', () => expect(colLetter(26)).toBe('Z'))
  test('27 -> AA', () => expect(colLetter(27)).toBe('AA'))
  test('28 -> AB', () => expect(colLetter(28)).toBe('AB'))
  test('52 -> AZ', () => expect(colLetter(52)).toBe('AZ'))
})

describe('CSV export escaping + injection prevention', () => {
  test('plain field passes through', () => {
    expect(csvSafeField('DMC Inc.')).toBe('DMC Inc.')
  })
  test('comma triggers quoting', () => {
    expect(csvSafeField('Smith, John')).toBe('"Smith, John"')
  })
  test('quote is doubled and field quoted', () => {
    expect(csvSafeField('He said "hi"')).toBe('"He said ""hi"""')
  })
  test('newline triggers quoting', () => {
    expect(csvSafeField('line1\nline2')).toBe('"line1\nline2"')
  })
  test('leading = gets prefixed with single quote', () => {
    expect(csvSafeField('=cmd')).toBe("'=cmd")
  })
  test('leading + gets prefixed', () => {
    expect(csvSafeField('+1234')).toBe("'+1234")
  })
  test('leading - gets prefixed', () => {
    expect(csvSafeField('-1234')).toBe("'-1234")
  })
  test('leading @ gets prefixed', () => {
    expect(csvSafeField('@SUM(1)')).toBe("'@SUM(1)")
  })
  test('leading tab gets prefixed', () => {
    expect(csvSafeField('\tfoo')).toBe("'\tfoo")
  })
  test('toCsvRow joins fields with commas', () => {
    expect(toCsvRow(['a', 'b, c', '=x'])).toBe('a,"b, c",\'=x')
  })
})

describe('slug helper', () => {
  test('round-trips a simple name', () => {
    expect(slugifyFirm('DMC Inc.')).toBe('dmc-inc')
  })
  test('lowercases and strips punctuation', () => {
    expect(slugifyFirm('E Tech Group, LLC')).toBe('e-tech-group-llc')
  })
  test('collision-free over all firms in targets.json', () => {
    const targets = require('../content/gtm/targets.json')
    const slugs = targets.rows.map((r) => slugifyFirm(r.firm))
    const unique = new Set(slugs)
    expect(unique.size).toBe(slugs.length)
    expect(targets.rows.length).toBe(31)
  })
})

describe('owner-only routes', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...OLD_ENV }
    process.env.OWNER_EMAIL = 'admin@greenguard-usa.com'
    process.env.GTM_EMAILS = 'mba@greenguard-usa.com'
  })

  afterEach(() => {
    process.env = OLD_ENV
  })

  function mockReqRes(body) {
    const res = {
      statusCode: 200,
      _json: null,
      status(code) { this.statusCode = code; return this },
      json(payload) { this._json = payload; return this },
      end() { return this },
    }
    const req = { method: 'POST', body }
    return { req, res }
  }

  test('approve route returns 403 for non-owner gtm session', async () => {
    jest.doMock('../lib/auth', () => {
      const actual = jest.requireActual('../lib/auth')
      return {
        ...actual,
        requireGtm: jest.fn(async (req, res) => {
          res.status(200).json({ email: 'mba@greenguard-usa.com', role: 'gtm' })
          return { email: 'mba@greenguard-usa.com', role: 'gtm' }
        }),
        isOwnerEmail: jest.fn(() => false),
      }
    })
    jest.doMock('../lib/db', () => ({ q: jest.fn() }))
    jest.doMock('../lib/gtm-sheets', () => ({ writeTargetCells: jest.fn(async () => ({ ok: true })) }))

    const handler = require('../pages/api/gtm/targets/approve').default
    const { req, res } = mockReqRes({ firm: 'DMC Inc.', approved: true })
    await handler(req, res)
    expect(res.statusCode).toBe(403)
  })

  test('pull-approvals route returns 403 for non-owner gtm session', async () => {
    jest.doMock('../lib/auth', () => {
      const actual = jest.requireActual('../lib/auth')
      return {
        ...actual,
        requireGtm: jest.fn(async (req, res) => ({ email: 'mba@greenguard-usa.com', role: 'gtm' })),
        isOwnerEmail: jest.fn(() => false),
      }
    })
    jest.doMock('../lib/gtm-sheets', () => ({ pullApprovals: jest.fn(async () => ({ ok: true })) }))

    const handler = require('../pages/api/gtm/targets/pull-approvals').default
    const { req, res } = mockReqRes({})
    await handler(req, res)
    expect(res.statusCode).toBe(403)
  })
})

describe('every GTM API route references requireGtm', () => {
  function walk(dir) {
    let out = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) out = out.concat(walk(full))
      else if (entry.name.endsWith('.js')) out.push(full)
    }
    return out
  }

  const apiDir = path.join(__dirname, '..', 'pages', 'api', 'gtm')
  const files = walk(apiDir)

  test('found gtm api route files', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  test.each(files.map((f) => [path.relative(apiDir, f), f]))('%s references requireGtm', (_name, full) => {
    const src = fs.readFileSync(full, 'utf8')
    expect(src.includes('requireGtm')).toBe(true)
  })
})

describe('API product resolution: touches route defaults + falls back on unknown product', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...OLD_ENV }
    process.env.OWNER_EMAIL = 'admin@greenguard-usa.com'
    process.env.GTM_EMAILS = 'mba@greenguard-usa.com'
  })

  afterEach(() => {
    process.env = OLD_ENV
  })

  function mockReqRes({ method, query, body }) {
    const res = {
      statusCode: 200,
      _json: null,
      status(code) { this.statusCode = code; return this },
      json(payload) { this._json = payload; return this },
      end() { return this },
    }
    const req = { method, query: query || {}, body: body || {} }
    return { req, res }
  }

  test('GET with no product param queries product=sparkbridge', async () => {
    jest.doMock('../lib/auth', () => {
      const actual = jest.requireActual('../lib/auth')
      return { ...actual, requireGtm: jest.fn(async () => ({ email: 'mba@greenguard-usa.com', role: 'gtm' })) }
    })
    const qMock = jest.fn(async () => ({ rows: [] }))
    jest.doMock('../lib/db', () => ({ q: qMock }))

    const handler = require('../pages/api/gtm/touches').default
    const { req, res } = mockReqRes({ method: 'GET', query: { firm: 'Acme' } })
    await handler(req, res)
    expect(res.statusCode).toBe(200)
    expect(qMock).toHaveBeenCalledWith(expect.any(String), ['Acme', 'sparkbridge'])
  })

  test('GET with an unknown product falls back to sparkbridge, never errors', async () => {
    jest.doMock('../lib/auth', () => {
      const actual = jest.requireActual('../lib/auth')
      return { ...actual, requireGtm: jest.fn(async () => ({ email: 'mba@greenguard-usa.com', role: 'gtm' })) }
    })
    const qMock = jest.fn(async () => ({ rows: [] }))
    jest.doMock('../lib/db', () => ({ q: qMock }))

    const handler = require('../pages/api/gtm/touches').default
    const { req, res } = mockReqRes({ method: 'GET', query: { firm: 'Acme', product: 'totally-bogus' } })
    await handler(req, res)
    expect(res.statusCode).toBe(200)
    expect(qMock).toHaveBeenCalledWith(expect.any(String), ['Acme', 'sparkbridge'])
  })

  test('GET with product=ops scopes the query to ops', async () => {
    jest.doMock('../lib/auth', () => {
      const actual = jest.requireActual('../lib/auth')
      return { ...actual, requireGtm: jest.fn(async () => ({ email: 'mba@greenguard-usa.com', role: 'gtm' })) }
    })
    const qMock = jest.fn(async () => ({ rows: [] }))
    jest.doMock('../lib/db', () => ({ q: qMock }))

    const handler = require('../pages/api/gtm/touches').default
    const { req, res } = mockReqRes({ method: 'GET', query: { firm: 'Acme', product: 'ops' } })
    await handler(req, res)
    expect(res.statusCode).toBe(200)
    expect(qMock).toHaveBeenCalledWith(expect.any(String), ['Acme', 'ops'])
  })
})
