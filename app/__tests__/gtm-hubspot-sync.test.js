describe('hubspot-sync route: reverse stage map', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...OLD_ENV }
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

  test('an unmapped HubSpot stage (Closed Lost) reports a truthful reason, not a dropped/undefined stage', async () => {
    jest.doMock('../lib/auth', () => {
      const actual = jest.requireActual('../lib/auth')
      return { ...actual, requireGtm: jest.fn(async () => ({ email: 'admin@greenguard-usa.com', role: 'owner' })) }
    })
    jest.doMock('../lib/db', () => ({
      q: jest.fn(async (sql) => {
        if (sql.includes('SELECT firm FROM gtm_deals')) return { rows: [{ firm: 'Acme Co' }] }
        return { rows: [] }
      }),
    }))
    jest.doMock('../lib/gtm-hubspot', () => ({
      resolvePipeline: jest.fn(async () => ({
        pipelineId: 'default',
        stages: {
          'Appointment Scheduled': 'a1',
          'Closed Lost': 'cl1',
        },
      })),
      STAGE_LABELS: ['Contacted', 'Call booked', 'Review delivered', 'Partner signed', 'Pilot live', 'Production measured'],
      dealName: jest.fn((firm) => `${firm} · One Person Show`),
    }))
    jest.doMock('@hubspot/api-client', () => ({
      Client: jest.fn().mockImplementation(() => ({
        crm: {
          deals: {
            searchApi: {
              doSearch: jest.fn().mockResolvedValue({
                results: [{ id: 'd1', properties: { dealstage: 'cl1' } }],
              }),
            },
          },
        },
      })),
    }))

    const handler = require('../pages/api/gtm/hubspot-sync').default
    const { req, res } = mockReqRes({ product: 'ops' })
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res._json.ok).toBe(true)
    expect(res._json.synced).toEqual([])
    expect(res._json.failed).toEqual([{ firm: 'Acme Co', reason: 'unrecognized HubSpot stage: Closed Lost' }])
  })
})
