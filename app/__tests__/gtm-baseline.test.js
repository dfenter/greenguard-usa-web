describe('call-reports.js route: kind field (baseline vs call)', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...OLD_ENV }
  })

  afterEach(() => {
    process.env = OLD_ENV
  })

  function mockPostReqRes(body) {
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

  function mockGetReqRes(query) {
    const res = {
      statusCode: 200,
      _json: null,
      status(code) { this.statusCode = code; return this },
      json(payload) { this._json = payload; return this },
      end() { return this },
    }
    const req = { method: 'GET', query }
    return { req, res }
  }

  function mockAuthAndHubspot() {
    jest.doMock('../lib/auth', () => {
      const actual = jest.requireActual('../lib/auth')
      return {
        ...actual,
        requireGtm: jest.fn(async () => ({ email: 'mba@greenguard-usa.com', role: 'gtm' })),
      }
    })
    jest.doMock('../lib/hubspot', () => ({
      upsertContact: jest.fn(),
      addNote: jest.fn(),
    }))
    jest.doMock('../lib/gtm-hubspot', () => ({
      dealsEnabled: jest.fn().mockResolvedValue(false),
      syncDeal: jest.fn(),
      associateNoteToDeal: jest.fn(),
    }))
  }

  test('POST with kind: "baseline" stores kind and returns it in response', async () => {
    mockAuthAndHubspot()

    let insertParams = null
    const qMock = jest.fn(async (sql, params) => {
      if (sql.includes('INSERT INTO gtm_call_reports')) {
        insertParams = params
        return { rows: [{ id: 7 }] }
      }
      return { rows: [] }
    })
    jest.doMock('../lib/db', () => ({ q: qMock }))

    const handler = require('../pages/api/gtm/call-reports').default
    const { req, res } = mockPostReqRes({ firm: 'Acme Co', kind: 'baseline' })
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res._json.kind).toBe('baseline')
    const insertSql = qMock.mock.calls.find(([sql]) => sql.includes('INSERT INTO gtm_call_reports'))[0]
    expect(insertSql).toMatch(/kind/)
    expect(insertParams).toContain('baseline')
  })

  test('POST with no kind defaults to "call"', async () => {
    mockAuthAndHubspot()

    let insertParams = null
    const qMock = jest.fn(async (sql, params) => {
      if (sql.includes('INSERT INTO gtm_call_reports')) {
        insertParams = params
        return { rows: [{ id: 8 }] }
      }
      return { rows: [] }
    })
    jest.doMock('../lib/db', () => ({ q: qMock }))

    const handler = require('../pages/api/gtm/call-reports').default
    const { req, res } = mockPostReqRes({ firm: 'Acme Co' })
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res._json.kind).toBe('call')
    expect(insertParams).toContain('call')
  })

  test('POST with an unrecognized kind falls back to "call"', async () => {
    mockAuthAndHubspot()
    const qMock = jest.fn(async () => ({ rows: [{ id: 9 }] }))
    jest.doMock('../lib/db', () => ({ q: qMock }))

    const handler = require('../pages/api/gtm/call-reports').default
    const { req, res } = mockPostReqRes({ firm: 'Acme Co', kind: 'not-a-real-kind' })
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res._json.kind).toBe('call')
  })

  test('GET returns kind column for each row', async () => {
    jest.doMock('../lib/auth', () => {
      const actual = jest.requireActual('../lib/auth')
      return {
        ...actual,
        requireGtm: jest.fn(async () => ({ email: 'mba@greenguard-usa.com', role: 'gtm' })),
      }
    })
    const qMock = jest.fn(async () => ({
      rows: [{ id: 1, firm: 'Acme Co', kind: 'baseline' }],
    }))
    jest.doMock('../lib/db', () => ({ q: qMock }))

    const handler = require('../pages/api/gtm/call-reports').default
    const { req, res } = mockGetReqRes({ firm: 'Acme Co' })
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res._json.rows[0].kind).toBe('baseline')
    const selectSql = qMock.mock.calls[0][0]
    expect(selectSql).toMatch(/kind/)
  })

  test('GET with kind=baseline query filters the SQL by kind', async () => {
    jest.doMock('../lib/auth', () => {
      const actual = jest.requireActual('../lib/auth')
      return {
        ...actual,
        requireGtm: jest.fn(async () => ({ email: 'mba@greenguard-usa.com', role: 'gtm' })),
      }
    })
    const qMock = jest.fn(async () => ({ rows: [] }))
    jest.doMock('../lib/db', () => ({ q: qMock }))

    const handler = require('../pages/api/gtm/call-reports').default
    const { req, res } = mockGetReqRes({ firm: 'Acme Co', kind: 'baseline' })
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    const [selectSql, params] = qMock.mock.calls[0]
    expect(selectSql).toMatch(/kind = \$3/)
    expect(params).toContain('baseline')
  })
})
