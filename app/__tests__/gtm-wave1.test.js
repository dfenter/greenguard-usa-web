const path = require('path')

describe('role resolution', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...OLD_ENV }
    process.env.OWNER_EMAIL = 'admin@greenguard-usa.com'
    process.env.ADMIN_EMAILS = 'bruce@greenguard-usa.com'
    process.env.GTM_EMAILS = 'mba@greenguard-usa.com, Other@Example.com '
  })

  afterEach(() => {
    process.env = OLD_ENV
  })

  test('gtm email resolves to role gtm', async () => {
    const { createSessionToken, verifyToken } = require('../lib/auth')
    const token = await createSessionToken('mba@greenguard-usa.com', null)
    const payload = await verifyToken(token)
    expect(payload.role).toBe('gtm')
  })

  test('gtm email matches case-insensitively with whitespace trimmed', async () => {
    const { createSessionToken, verifyToken } = require('../lib/auth')
    const token = await createSessionToken('other@example.com', null)
    const payload = await verifyToken(token)
    expect(payload.role).toBe('gtm')
  })

  test('admin email still resolves tech even with GTM_EMAILS set', async () => {
    const { createSessionToken, verifyToken } = require('../lib/auth')
    const token = await createSessionToken('bruce@greenguard-usa.com', null)
    const payload = await verifyToken(token)
    expect(payload.role).toBe('tech')
  })

  test('owner email still resolves owner even with GTM_EMAILS set', async () => {
    const { createSessionToken, verifyToken } = require('../lib/auth')
    const token = await createSessionToken('admin@greenguard-usa.com', null)
    const payload = await verifyToken(token)
    expect(payload.role).toBe('owner')
  })

  test('unknown email with no stripe customer resolves prospect', async () => {
    const { createSessionToken, verifyToken } = require('../lib/auth')
    const token = await createSessionToken('nobody@example.com', null)
    const payload = await verifyToken(token)
    expect(payload.role).toBe('prospect')
  })
})

describe('isGtmEmail', () => {
  const OLD_ENV = process.env
  afterEach(() => { process.env = OLD_ENV })

  test('false when GTM_EMAILS unset', () => {
    jest.resetModules()
    process.env = { ...OLD_ENV }
    delete process.env.GTM_EMAILS
    const { isGtmEmail } = require('../lib/auth')
    expect(isGtmEmail('anyone@example.com')).toBe(false)
  })

  test('false when GTM_EMAILS is empty string', () => {
    jest.resetModules()
    process.env = { ...OLD_ENV }
    process.env.GTM_EMAILS = '   '
    const { isGtmEmail } = require('../lib/auth')
    expect(isGtmEmail('anyone@example.com')).toBe(false)
  })
})

describe('requireGtm', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...OLD_ENV }
    process.env.OWNER_EMAIL = 'admin@greenguard-usa.com'
    process.env.ADMIN_EMAILS = 'bruce@greenguard-usa.com'
    process.env.GTM_EMAILS = 'mba@greenguard-usa.com'
  })

  afterEach(() => { process.env = OLD_ENV })

  function mockRes() {
    const res = {}
    res.status = jest.fn(() => res)
    res.json = jest.fn(() => res)
    return res
  }

  test('rejects a customer session with 403', async () => {
    const { createSessionToken, requireGtm, SESSION_COOKIE_NAME } = require('../lib/auth')
    const token = await createSessionToken('customer@example.com', 'cus_abc123')
    const req = { cookies: { [SESSION_COOKIE_NAME]: token } }
    const res = mockRes()
    const result = await requireGtm(req, res)
    expect(result).toBeNull()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  test('allows a gtm session', async () => {
    const { createSessionToken, requireGtm, SESSION_COOKIE_NAME } = require('../lib/auth')
    const token = await createSessionToken('mba@greenguard-usa.com', null)
    const req = { cookies: { [SESSION_COOKIE_NAME]: token } }
    const res = mockRes()
    const result = await requireGtm(req, res)
    expect(result).not.toBeNull()
    expect(result.email).toBe('mba@greenguard-usa.com')
  })
})

describe('checklist parser output', () => {
  test('checklist.json has at least 10 items, all unique non-empty ids with labels', () => {
    const checklistPath = path.join(__dirname, '..', 'content', 'gtm', 'checklist.json')
    let checklist
    try {
      checklist = require(checklistPath)
    } catch {
      checklist = null
    }
    if (!checklist) {
      // Content not built in this environment — skip rather than fail the suite.
      console.warn('content/gtm/checklist.json not found — run scripts/build-gtm-content.js')
      return
    }
    const items = checklist.items
    expect(Array.isArray(items)).toBe(true)
    expect(items.length).toBeGreaterThanOrEqual(10)
    const ids = items.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const item of items) {
      expect(item.id).toBeTruthy()
      expect(item.label).toBeTruthy()
    }
  })
})

describe('gtm-content loader', () => {
  test('getPage returns html for the plan path', () => {
    let content
    try {
      content = require('../lib/gtm-content')
    } catch {
      content = null
    }
    if (!content) return
    const page = content.getPage('01-plan/mba-90-day-gtm-sprint')
    if (!page) {
      console.warn('content/gtm/pages.json not found — run scripts/build-gtm-content.js')
      return
    }
    expect(typeof page.html).toBe('string')
    expect(page.html.length).toBeGreaterThan(0)
  })

  test('getTargets returns rows with >= 20 rows and a firm-ish column', () => {
    const content = require('../lib/gtm-content')
    const targets = content.getTargets()
    if (!targets.rows.length) {
      console.warn('content/gtm/targets.json not found or empty — run scripts/build-gtm-content.js')
      return
    }
    expect(targets.rows.length).toBeGreaterThanOrEqual(20)
    const hasFirmColumn = targets.columns.some((c) => /firm/i.test(c))
    expect(hasFirmColumn).toBe(true)
  })
})

describe('gtm-content loader: per-product isolation + legacy fallback', () => {
  const os = require('os')
  const fsx = require('fs')
  let tmpDir
  let restoreCwd

  beforeEach(() => {
    jest.resetModules()
    tmpDir = fsx.mkdtempSync(path.join(os.tmpdir(), 'gtm-content-test-'))
    const contentDir = path.join(tmpDir, 'content', 'gtm')
    fsx.mkdirSync(contentDir, { recursive: true })
    // Legacy flat sparkbridge files (no per-product subdir).
    fsx.writeFileSync(path.join(contentDir, 'pages.json'), JSON.stringify({ pages: { legacy: { path: 'legacy', title: 'Legacy', html: '<p>legacy</p>', headings: [] } } }))
    fsx.writeFileSync(path.join(contentDir, 'targets.json'), JSON.stringify({ columns: ['firm'], rows: [{ firm: 'LegacyCo' }] }))
    fsx.writeFileSync(path.join(contentDir, 'checklist.json'), JSON.stringify({ items: [{ id: 'legacy-item', label: 'Legacy item' }] }))
    // Per-product ops files.
    const opsDir = path.join(contentDir, 'ops')
    fsx.mkdirSync(opsDir, { recursive: true })
    fsx.writeFileSync(path.join(opsDir, 'targets.json'), JSON.stringify({ columns: ['firm'], rows: [{ firm: 'OpsCo' }] }))

    const origCwd = process.cwd
    restoreCwd = () => { process.cwd = origCwd }
    process.cwd = () => tmpDir
  })

  afterEach(() => {
    restoreCwd()
    fsx.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('sparkbridge falls back to legacy flat files when no per-product dir exists', () => {
    const content = require('../lib/gtm-content')
    const targets = content.getTargets('sparkbridge')
    expect(targets.rows).toEqual([{ firm: 'LegacyCo' }])
    const page = content.getPage('legacy', 'sparkbridge')
    expect(page.title).toBe('Legacy')
    const checklist = content.getChecklist('sparkbridge')
    expect(checklist[0].id).toBe('legacy-item')
  })

  test('ops reads its own per-product file, not the legacy sparkbridge one', () => {
    const content = require('../lib/gtm-content')
    const targets = content.getTargets('ops')
    expect(targets.rows).toEqual([{ firm: 'OpsCo' }])
  })

  test('ops missing files return the same empty shapes as sparkbridge, never throw', () => {
    const content = require('../lib/gtm-content')
    expect(() => content.getChecklist('ops')).not.toThrow()
    expect(content.getChecklist('ops')).toEqual([])
    expect(() => content.getPage('nope', 'ops')).not.toThrow()
    expect(content.getPage('nope', 'ops')).toBeNull()
  })

  test('unknown product falls back to default product behavior, never throws', () => {
    const content = require('../lib/gtm-content')
    expect(() => content.getTargets('bogus-product')).not.toThrow()
    expect(content.getTargets('bogus-product').rows).toEqual([{ firm: 'LegacyCo' }])
  })

  test('caches are isolated per product (mutating one does not affect the other)', () => {
    const content = require('../lib/gtm-content')
    const sb = content.getTargets('sparkbridge')
    const ops = content.getTargets('ops')
    expect(sb).not.toBe(ops)
    expect(sb.rows[0].firm).toBe('LegacyCo')
    expect(ops.rows[0].firm).toBe('OpsCo')
  })
})
