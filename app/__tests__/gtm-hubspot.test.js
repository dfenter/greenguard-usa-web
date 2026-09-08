describe('stageIdForLabel (pure)', () => {
  const { stageIdForLabel } = require('../lib/gtm-hubspot')
  const pipeline = {
    pipelineId: 'p1',
    stages: {
      Contacted: 's1',
      'Call booked': 's2',
      'Review delivered': 's3',
      'Partner signed': 's4',
      'Pilot live': 's5',
      'Production measured': 's6',
    },
  }

  test.each([
    ['Contacted', 's1'],
    ['CALL BOOKED', 's2'],
    ['  review delivered  ', 's3'],
    ['partner signed', 's4'],
    ['Pilot Live', 's5'],
    ['production measured', 's6'],
  ])('resolves %s case-insensitively with whitespace trimmed', (label, expected) => {
    expect(stageIdForLabel(pipeline, label)).toBe(expected)
  })

  test('returns undefined for an unknown label', () => {
    expect(stageIdForLabel(pipeline, 'Not A Stage')).toBeUndefined()
  })

  test('returns undefined for missing pipeline or label', () => {
    expect(stageIdForLabel(null, 'Contacted')).toBeUndefined()
    expect(stageIdForLabel(pipeline, undefined)).toBeUndefined()
  })
})

describe('dealName format', () => {
  test('exact middle-dot format', () => {
    const { dealName } = require('../lib/gtm-hubspot')
    const name = dealName('Acme Integrators')
    expect(name).toBe('Acme Integrators · SparkBridge FAP')
    expect(name.charCodeAt('Acme Integrators'.length + 1)).toBe(0x00B7)
  })
})

describe('dealsEnabled', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...OLD_ENV }
    delete process.env.GTM_HUBSPOT_DEALS
  })

  afterEach(() => {
    process.env = OLD_ENV
  })

  test('true by default when the pipelines probe succeeds', async () => {
    jest.doMock('../lib/cache', () => ({ cached: jest.fn((key, ttl, fn) => fn()) }))
    jest.doMock('@hubspot/api-client', () => ({
      Client: jest.fn().mockImplementation(() => ({
        crm: {
          pipelines: {
            pipelinesApi: {
              getAll: jest.fn().mockResolvedValue({
                results: [{
                  id: 'pipe1',
                  label: 'SparkBridge Partners',
                  stages: [
                    { id: 's1', label: 'Contacted' },
                    { id: 's2', label: 'Call booked' },
                    { id: 's3', label: 'Review delivered' },
                    { id: 's4', label: 'Partner signed' },
                    { id: 's5', label: 'Pilot live' },
                    { id: 's6', label: 'Production measured' },
                  ],
                }],
              }),
            },
          },
        },
      })),
    }))
    jest.doMock('../lib/hubspot', () => ({ findContactByEmail: jest.fn() }))
    const { dealsEnabled } = require('../lib/gtm-hubspot')
    expect(await dealsEnabled()).toBe(true)
  })

  test('false when GTM_HUBSPOT_DEALS is "0"', async () => {
    process.env.GTM_HUBSPOT_DEALS = '0'
    const { dealsEnabled } = require('../lib/gtm-hubspot')
    expect(await dealsEnabled()).toBe(false)
  })

  test('false when the pipelines probe fails', async () => {
    jest.doMock('../lib/cache', () => ({ cached: jest.fn((key, ttl, fn) => fn()) }))
    jest.doMock('@hubspot/api-client', () => ({
      Client: jest.fn().mockImplementation(() => ({
        crm: {
          pipelines: {
            pipelinesApi: {
              getAll: jest.fn().mockRejectedValue(new Error('403 missing scope')),
            },
          },
        },
      })),
    }))
    jest.doMock('../lib/hubspot', () => ({ findContactByEmail: jest.fn() }))
    const { dealsEnabled } = require('../lib/gtm-hubspot')
    expect(await dealsEnabled()).toBe(false)
  })
})

describe('call report route: HubSpot failure never loses the DB write', () => {
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

  test('DB insert happens and response is 200 with a warning when HubSpot throws', async () => {
    jest.doMock('../lib/auth', () => {
      const actual = jest.requireActual('../lib/auth')
      return {
        ...actual,
        requireGtm: jest.fn(async () => ({ email: 'mba@greenguard-usa.com', role: 'gtm' })),
      }
    })

    const qMock = jest.fn(async (sql) => {
      if (sql.includes('INSERT INTO gtm_call_reports')) return { rows: [{ id: 42 }] }
      return { rows: [] }
    })
    jest.doMock('../lib/db', () => ({ q: qMock }))

    jest.doMock('../lib/hubspot', () => ({
      upsertContact: jest.fn().mockRejectedValue(new Error('HubSpot down')),
      addNote: jest.fn(),
    }))
    jest.doMock('../lib/gtm-hubspot', () => ({
      dealsEnabled: jest.fn().mockResolvedValue(false),
      syncDeal: jest.fn(),
      associateNoteToDeal: jest.fn(),
    }))

    const handler = require('../pages/api/gtm/call-reports').default
    const { req, res } = mockReqRes({ firm: 'Acme Co', contact_email: 'gtm-test@greenguard-usa.com', next_step: 'follow-up' })
    await handler(req, res)

    const insertCalled = qMock.mock.calls.some(([sql]) => sql.includes('INSERT INTO gtm_call_reports'))
    expect(insertCalled).toBe(true)
    expect(res.statusCode).toBe(200)
    expect(res._json.warning).toBeTruthy()
  })
})

describe('library.js route: kind whitelist', () => {
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

  test('rejects a kind outside the whitelist with 400', async () => {
    jest.doMock('../lib/auth', () => {
      const actual = jest.requireActual('../lib/auth')
      return {
        ...actual,
        requireGtm: jest.fn(async () => ({ email: 'mba@greenguard-usa.com', role: 'gtm' })),
      }
    })
    jest.doMock('../lib/db', () => ({ q: jest.fn() }))

    const handler = require('../pages/api/gtm/library').default
    const { req, res } = mockReqRes({ kind: 'not-a-real-kind', data: { a: 1 } })
    await handler(req, res)
    expect(res.statusCode).toBe(400)
  })

  test('accepts a whitelisted kind', async () => {
    jest.doMock('../lib/auth', () => {
      const actual = jest.requireActual('../lib/auth')
      return {
        ...actual,
        requireGtm: jest.fn(async () => ({ email: 'mba@greenguard-usa.com', role: 'gtm' })),
      }
    })
    const qMock = jest.fn(async () => ({ rows: [{ id: 1 }] }))
    jest.doMock('../lib/db', () => ({ q: qMock }))

    const handler = require('../pages/api/gtm/library').default
    const { req, res } = mockReqRes({ kind: 'objection', data: { objection: 'test' } })
    await handler(req, res)
    expect(res.statusCode).toBe(200)
  })
})

describe('gtm-sheets: graceful no-op when product has no sheetId', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  test('writeTargetCells returns ok:false without throwing for a product with sheetId null', async () => {
    jest.doMock('../lib/gsheets', () => ({ getSheets: jest.fn(() => { throw new Error('should not be called') }) }))
    jest.doMock('../lib/db', () => ({ q: jest.fn() }))
    const { writeTargetCells } = require('../lib/gtm-sheets')
    const result = await writeTargetCells('Acme', { approve: 'Y' }, 'ops')
    expect(result).toEqual({ ok: false, reason: 'sheet not configured' })
  })

  test('pullApprovals returns ok:false without throwing for a product with sheetId null', async () => {
    jest.doMock('../lib/gsheets', () => ({ getSheets: jest.fn(() => { throw new Error('should not be called') }) }))
    jest.doMock('../lib/db', () => ({ q: jest.fn() }))
    const { pullApprovals } = require('../lib/gtm-sheets')
    const result = await pullApprovals('ops')
    expect(result).toEqual({ ok: false, reason: 'sheet not configured' })
  })

  test('sparkbridge (default) still attempts a sheets call when sheets client is unavailable', async () => {
    jest.doMock('../lib/gsheets', () => ({ getSheets: jest.fn(() => null) }))
    jest.doMock('../lib/db', () => ({ q: jest.fn() }))
    const { writeTargetCells } = require('../lib/gtm-sheets')
    const result = await writeTargetCells('Acme', { approve: 'Y' })
    expect(result).toEqual({ ok: false, reason: 'sheets not configured' })
  })

  test('legacy SHEET_ID export matches sparkbridge product config', () => {
    const { SHEET_ID } = require('../lib/gtm-sheets')
    const { PRODUCTS } = require('../lib/gtm-products')
    expect(SHEET_ID).toBe(PRODUCTS.sparkbridge.sheetId)
  })
})

describe('gtm-hubspot: dealsEnabled/dealName per product', () => {
  // An earlier describe block jest.doMock()s ../lib/gtm-hubspot with a partial
  // mock that has no dealName. resetModules clears the module registry but not
  // the doMock registration, so the real module must be un-mocked here.
  beforeEach(() => {
    jest.dontMock('../lib/gtm-hubspot')
    jest.resetModules()
  })

  test('dealName default (sparkbridge) format unchanged', () => {
    jest.resetModules()
    const { dealName } = jest.requireActual('../lib/gtm-hubspot')
    expect(dealName('Acme Integrators')).toBe('Acme Integrators · SparkBridge FAP')
  })

  test('dealName for ops uses the ops product label', () => {
    jest.resetModules()
    const { dealName } = jest.requireActual('../lib/gtm-hubspot')
    expect(dealName('Acme Integrators', 'ops')).toBe('Acme Integrators · One Person Show')
  })

  test('dealsEnabled resolves false gracefully when pipeline probe fails', async () => {
    jest.resetModules()
    process.env.GTM_HUBSPOT_DEALS = undefined
    const { dealsEnabled } = jest.requireActual('../lib/gtm-hubspot')
    const ok = await dealsEnabled('sparkbridge')
    expect(typeof ok).toBe('boolean')
  })
})
