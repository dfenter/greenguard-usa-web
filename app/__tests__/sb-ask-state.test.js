// Ask an Engineer A2: salt file, HMAC iphash, legacy state migration,
// feedback validation/storage/limits/summary, Turnstile verification.
const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')
const crypto = require('crypto')
const sb = require('../scripts/sb-ask')

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sbask-a2-'))
const SID = '11111111-1111-4111-8111-111111111111'
const D1 = Date.parse('2026-09-24T10:00:00Z')
const D2 = Date.parse('2026-09-25T00:00:05Z')

describe('salt and iphash', () => {
  test('salt lives in a separate 0600 salt.json, never in state.json', () => {
    const dir = tmp()
    const st = new sb.AskState(path.join(dir, 'state.json'))
    const h = st.ipHash('203.0.113.9', D1)
    st.check(h, SID, D1)
    st.flush()
    const saltFile = path.join(dir, 'salt.json')
    expect(fs.statSync(saltFile).mode & 0o777).toBe(0o600)
    const salt = JSON.parse(fs.readFileSync(saltFile, 'utf8'))
    expect(salt.date).toBe('2026-09-24')
    expect(salt.value).toMatch(/^[0-9a-f]{64}$/)
    const raw = fs.readFileSync(path.join(dir, 'state.json'), 'utf8')
    expect(raw).not.toContain(salt.value)
    expect(raw).not.toContain('203.0.113.9')
    expect(JSON.parse(raw).salt).toBeUndefined()
    expect(Object.keys(JSON.parse(raw).ip)).toEqual([h])
  })

  test('iphash is HMAC-SHA256(salt, ip) hex, first 16 chars', () => {
    const st = new sb.AskState(path.join(tmp(), 'state.json'))
    const salt = st.salt(D1)
    const want = crypto.createHmac('sha256', salt).update('198.51.100.4').digest('hex').slice(0, 16)
    expect(st.ipHash('198.51.100.4', D1)).toBe(want)
  })

  test('salt rotates at the UTC day change, old value overwritten, shared across instances', () => {
    const dir = tmp()
    const a = new sb.AskState(path.join(dir, 'state.json'))
    const s1 = a.salt(D1)
    const b = new sb.AskState(path.join(dir, 'state.json'))
    expect(b.salt(D1)).toBe(s1)
    const s2 = b.salt(D2)
    expect(s2).not.toBe(s1)
    expect([...fs.readdirSync(dir)].sort()).toEqual(['salt.json'])
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'salt.json'), 'utf8'))).toEqual({ date: '2026-09-25', value: s2 })
    expect(fs.readFileSync(path.join(dir, 'salt.json'), 'utf8')).not.toContain(s1)
  })

  test('legacy state: salt field and raw-IP keys dropped on load', () => {
    const dir = tmp()
    const f = path.join(dir, 'state.json')
    const now = Date.now()
    fs.writeFileSync(f, JSON.stringify({
      ip: { '1.2.3.4': [now], '::1': [now], 'abcdef0123456789': [now], 'ABCDEF0123456789': [now] },
      sid: { [SID]: [now] }, day: { date: sb.utcDay(now), count: 2 }, salt: { date: sb.utcDay(now), value: 'ab'.repeat(32) },
    }))
    const st = new sb.AskState(f)
    expect(st.data.salt).toBeUndefined()
    expect(Object.keys(st.data.ip)).toEqual(['abcdef0123456789'])
    expect(st.data.sid[SID].length).toBe(1)
    // Rewritten at construction, without waiting for a flush.
    expect(fs.readFileSync(f, 'utf8')).not.toMatch(/1\.2\.3\.4|"salt"/)
    expect(JSON.parse(fs.readFileSync(f, 'utf8')).sid[SID].length).toBe(1)
    // The legacy salt is not reused.
    expect(st.salt(now)).not.toBe('ab'.repeat(32))
  })
})

describe('salt file mode and global day counter', () => {
  test('an existing salt.json with a looser mode is tightened to 0600 on reuse', () => {
    const dir = tmp()
    const saltFile = path.join(dir, 'salt.json')
    const value = 'cd'.repeat(32)
    fs.writeFileSync(saltFile, JSON.stringify({ date: '2026-09-24', value }), { mode: 0o644 })
    fs.chmodSync(saltFile, 0o644)
    const st = new sb.AskState(path.join(dir, 'state.json'))
    expect(st.salt(D1)).toBe(value)
    expect(fs.statSync(saltFile).mode & 0o777).toBe(0o600)
  })

  test('deferGlobal checks the day cap without counting; commitGlobal counts and enforces it', () => {
    const st = new sb.AskState(path.join(tmp(), 'state.json'))
    expect(st.check('abcdef0123456789', SID, D1, { deferGlobal: true }).ok).toBe(true)
    expect(st.data.day.count).toBe(0)
    expect(st.commitGlobal(D1).ok).toBe(true)
    expect(st.data.day.count).toBe(1)
    st.data.day.count = sb.LIMITS.globalPerDay
    const full = st.commitGlobal(D1)
    expect(full.ok).toBe(false)
    expect(full.scope).toBe('global')
    expect(st.check('0123456789abcdef', SID.replace(/1$/, '2'), D1, { deferGlobal: true }).scope).toBe('global')
  })
})

describe('feedback', () => {
  const ok = { sid: SID, id: '0123456789ab', vote: 'up', version: '8.1', page: '/sparkbridge/8.1/core/host/', text: 'clear' }

  test('validation', () => {
    expect(sb.validateFeedback(ok)).toEqual(ok)
    expect(sb.validateFeedback({ ...ok, text: undefined, page: undefined })).toEqual({ ...ok, text: '', page: '' })
    for (const bad of [null, [], 'x', { ...ok, sid: 'nope' }, { ...ok, id: '0123456789AB' }, { ...ok, id: 'abc' },
      { ...ok, vote: 'meh' }, { ...ok, version: '8.2' }, { ...ok, page: 'p'.repeat(301) }, { ...ok, page: 5 },
      { ...ok, text: 't'.repeat(501) }, { ...ok, text: 7 }]) {
      expect(sb.validateFeedback(bad)).toBeNull()
    }
    expect(sb.validateFeedback({ ...ok, page: 'p'.repeat(300), text: 't'.repeat(500) })).not.toBeNull()
    expect(sb.newAnswerId()).toMatch(/^[0-9a-f]{12}$/)
  })

  test('stored per UTC day per sid, 0700 dirs, 0600 files, pruned at 30 days with transcripts', () => {
    const dir = tmp()
    sb.appendFeedback(dir, { ts: 't', ...ok, iphash: 'abcdef0123456789' }, D1)
    sb.appendFeedback(dir, { ts: 't', ...ok, vote: 'down', iphash: 'abcdef0123456789' }, D1)
    const f = path.join(dir, 'feedback', '2026-09-24', `${SID}.jsonl`)
    const lines = fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    expect(lines.map((l) => l.vote)).toEqual(['up', 'down'])
    expect(fs.statSync(f).mode & 0o777).toBe(0o600)
    expect(fs.statSync(path.dirname(f)).mode & 0o777).toBe(0o700)
    fs.mkdirSync(path.join(dir, 'feedback', '2026-08-20'))
    fs.mkdirSync(path.join(dir, 'transcripts', '2026-08-21'), { recursive: true })
    const removed = sb.pruneTranscripts(dir, D1)
    expect([...removed].sort()).toEqual(['2026-08-21', 'feedback/2026-08-20'])
    expect(fs.existsSync(f)).toBe(true)
  })

  test('limits: 30 per sid and 60 per iphash per hour, persisted', () => {
    const f = path.join(tmp(), 'state.json')
    const st = new sb.AskState(f)
    const h = 'abcdef0123456789'
    for (let i = 0; i < 30; i++) expect(st.checkFeedback(h, SID, D1 + i).ok).toBe(true)
    const r = st.checkFeedback(h, SID, D1 + 100)
    expect(r).toMatchObject({ ok: false, scope: 'fbSid' })
    for (let i = 0; i < 30; i++) expect(st.checkFeedback(h, `22222222-2222-4222-8222-${String(i).padStart(12, '0')}`, D1 + i).ok).toBe(true)
    expect(st.checkFeedback(h, '33333333-3333-4333-8333-333333333333', D1 + 200)).toMatchObject({ ok: false, scope: 'fbIp' })
    expect(st.checkFeedback(h, '33333333-3333-4333-8333-333333333333', D1 + 3600_001).ok).toBe(true)
    st.flush()
    // Feedback does not consume ask quota.
    expect(new sb.AskState(f).data.fbIp[h].length).toBeGreaterThan(0)
    expect(st.check(h, SID, D1 + 3600_002).ok).toBe(true)
  })

  test('daily summary: emitted once for the previous day, survives restart', () => {
    const f = path.join(tmp(), 'state.json')
    const st = new sb.AskState(f)
    expect(st.countFeedback('up', false, D1)).toBeNull()
    expect(st.countFeedback('down', true, D1)).toBeNull()
    expect(st.countFeedback('up', true, D1)).toBeNull()
    st.flush()
    const again = new sb.AskState(f)
    expect(again.rollFeedbackDay(D1)).toBeNull()
    expect(again.rollFeedbackDay(D2)).toEqual({ date: '2026-09-24', up: 2, down: 1, withText: 2 })
    expect(again.rollFeedbackDay(D2 + 1000)).toBeNull()
    // A quiet day still yields a zero line on the next rollover.
    expect(again.rollFeedbackDay(D2 + 86_400_000)).toEqual({ date: '2026-09-25', up: 0, down: 0, withText: 0 })
  })
})

describe('turnstile verification', () => {
  let server, url, reply, lastBody
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let b = ''
      req.on('data', (d) => { b += d })
      req.on('end', () => { lastBody = new URLSearchParams(b); reply(res) })
    })
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    url = `http://127.0.0.1:${server.address().port}/siteverify`
  })
  afterAll(() => new Promise((r) => server.close(r)))
  const json = (code, obj) => (res) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(typeof obj === 'string' ? obj : JSON.stringify(obj)) }

  test('success posts secret, response and remoteip', async () => {
    reply = json(200, { success: true, hostname: 'docs.greenguard-usa.com' })
    expect(await sb.verifyTurnstile({ token: 'tok', secret: 'sec', remoteip: '203.0.113.5', url })).toEqual({ ok: true })
    expect(lastBody.get('secret')).toBe('sec')
    expect(lastBody.get('response')).toBe('tok')
    expect(lastBody.get('remoteip')).toBe('203.0.113.5')
    reply = json(200, { success: true })
    expect((await sb.verifyTurnstile({ token: 'tok', secret: 'sec', url })).ok).toBe(true)
  })

  test('failure, hostname mismatch, non-200, bad JSON', async () => {
    reply = json(200, { success: false, 'error-codes': ['invalid-input-response'] })
    expect(await sb.verifyTurnstile({ token: 'tok', secret: 'sec', url })).toEqual({ ok: false, reason: 'rejected' })
    reply = json(200, { success: 'true' })
    expect((await sb.verifyTurnstile({ token: 'tok', secret: 'sec', url })).ok).toBe(false)
    reply = json(200, { success: true, hostname: 'evil.example' })
    expect(await sb.verifyTurnstile({ token: 'tok', secret: 'sec', url })).toEqual({ ok: false, reason: 'hostname' })
    reply = json(200, { success: true, hostname: 'localhost' })
    expect((await sb.verifyTurnstile({ token: 'tok', secret: 'sec', url })).ok).toBe(false)
    expect((await sb.verifyTurnstile({ token: 'tok', secret: 'sec', url, devOrigins: true })).ok).toBe(true)
    reply = json(500, { success: true })
    expect(await sb.verifyTurnstile({ token: 'tok', secret: 'sec', url })).toEqual({ ok: false, reason: 'http_500' })
    reply = json(200, 'not json')
    expect(await sb.verifyTurnstile({ token: 'tok', secret: 'sec', url })).toEqual({ ok: false, reason: 'bad_json' })
  })

  test('network error and timeout fail closed', async () => {
    const dead = http.createServer()
    await new Promise((r) => dead.listen(0, '127.0.0.1', r))
    const deadUrl = `http://127.0.0.1:${dead.address().port}/`
    await new Promise((r) => dead.close(r))
    expect(await sb.verifyTurnstile({ token: 'tok', secret: 'sec', url: deadUrl })).toEqual({ ok: false, reason: 'network' })
    reply = (res) => setTimeout(() => json(200, { success: true })(res), 800)
    expect(await sb.verifyTurnstile({ token: 'tok', secret: 'sec', url, timeoutMs: 200 })).toEqual({ ok: false, reason: 'timeout' })
  })

  test('flag on without secret, or missing/oversized token: fail without a network call', async () => {
    lastBody = null
    reply = json(200, { success: true })
    expect(await sb.verifyTurnstile({ token: 'tok', secret: '', url })).toEqual({ ok: false, reason: 'no_secret' })
    expect(await sb.verifyTurnstile({ token: '', secret: 'sec', url })).toEqual({ ok: false, reason: 'no_token' })
    expect(await sb.verifyTurnstile({ token: 'x'.repeat(2049), secret: 'sec', url })).toEqual({ ok: false, reason: 'no_token' })
    expect(lastBody).toBeNull()
  })
})

describe('eval token allowlist', () => {
  const SECRET = 'e'.repeat(48)
  test('evalTokenOk: exact match only; wrong, empty, or unconfigured secrets are ignored', () => {
    expect(sb.evalTokenOk(SECRET, SECRET)).toBe(true)
    expect(sb.evalTokenOk(SECRET.slice(1), SECRET)).toBe(false)
    expect(sb.evalTokenOk('wrong-token-value-here', SECRET)).toBe(false)
    expect(sb.evalTokenOk('', SECRET)).toBe(false)
    expect(sb.evalTokenOk(undefined, SECRET)).toBe(false)
    expect(sb.evalTokenOk('', '')).toBe(false)
    expect(sb.evalTokenOk('short', 'short')).toBe(false)
  })
  test('skipLimits bypasses per-IP and per-sid buckets but still counts and honors the global day cap', () => {
    const st = new sb.AskState(path.join(tmp(), 'state.json'))
    const h = st.ipHash('203.0.113.50', D1)
    for (let i = 0; i < sb.LIMITS.ip.max; i++) {
      const sid = `22222222-2222-4222-8222-${String(i).padStart(12, '0')}`
      expect(st.check(h, sid, D1 + i).ok).toBe(true)
    }
    expect(st.check(h, SID, D1 + 100)).toMatchObject({ ok: false, scope: 'ip' })
    const before = st.data.day.count
    for (let i = 0; i < 30; i++) expect(st.check(h, SID, D1 + 200 + i, { skipLimits: true }).ok).toBe(true)
    expect(st.data.day.count).toBe(before + 30)
    expect(st.data.sid[SID]).toBeUndefined()
    expect(st.data.ip[h]).toHaveLength(sb.LIMITS.ip.max)
    st.data.day.count = sb.LIMITS.globalPerDay
    expect(st.check(h, SID, D1 + 300, { skipLimits: true })).toMatchObject({ ok: false, scope: 'global' })
  })
})
