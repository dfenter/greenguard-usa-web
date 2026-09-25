// Integration: spawns scripts/chat-daemon.js on a random port with a stub docs
// index server and a fake claude binary, then drives /chat/sparkbridge-docs.
const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')
const net = require('net')
const crypto = require('crypto')
const { spawn } = require('child_process')
const MiniSearch = require('minisearch')

jest.setTimeout(90_000)

const ORIGIN = 'https://docs.greenguard-usa.com'
const QUEUE_MS = 2500
const FAKE = path.join(__dirname, 'fixtures', 'fake-claude')
const DAEMON = path.join(__dirname, '..', 'scripts', 'chat-daemon.js')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let seq = 0
const nextSid = () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++seq).padStart(12, '0')}`
const nextIp = () => `203.0.113.${100 + seq}`

let root, dataDir, fakeLog, indexServer, daemon, port, stdout = ''
let index83Hits = 0

function buildIndex(version) {
  const options = { idField: 'id', fields: ['title', 'heading', 'text'], storeFields: ['version', 'slug', 'title', 'heading', 'url', 'text'],
    searchOptions: { boost: { title: 2, heading: 3 }, prefix: true, fuzzy: 0.2, combineWith: 'OR' }, maxPerPage: 2 }
  const ms = new MiniSearch(options)
  const url = `${ORIGIN}/sparkbridge/${version}/core/host/#configuration`
  ms.addAll([{ id: `${version}:core/host#configuration:0`, version, slug: 'core/host', title: 'Host', heading: 'Configuration', url,
    text: 'configure the host module broker connection quick slow stubborn question' }])
  return JSON.stringify({ format: 2, version, builtAt: 'T', count: 1, options, index: ms.toJSON() })
}

function freePort() {
  return new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) }) })
}

// SSE client: collects events; destroy() drops the connection mid-stream.
function ask(message, { version = '8.1', sse = true, origin = ORIGIN, sid = nextSid(), ip = nextIp() } = {}) {
  const events = []
  const waiters = []
  let status = 0, raw = ''
  const body = JSON.stringify({ sid, message, version, page: `/sparkbridge/${version}/`, history: [] })
  const headers = { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }
  if (origin) headers.Origin = origin
  if (sse) headers.Accept = 'text/event-stream'
  const check = () => { for (const w of waiters.slice()) { const e = events.find(w.pred); if (e) { waiters.splice(waiters.indexOf(w), 1); w.resolve(e) } } }
  let endResolve
  const ended = new Promise((r) => { endResolve = r })
  const req = http.request({ host: '127.0.0.1', port, path: '/chat/sparkbridge-docs', method: 'POST', headers }, (res) => {
    status = res.statusCode
    let buf = ''
    res.setEncoding('utf8')
    res.on('data', (d) => {
      raw += d
      buf += d
      let i
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2)
        const name = (block.match(/^event: (.*)$/m) || [])[1]
        const data = (block.match(/^data: (.*)$/m) || [])[1]
        if (name) { events.push({ name, data: JSON.parse(data), at: Date.now() }); check() }
      }
    })
    res.on('end', () => endResolve())
    res.on('close', () => endResolve())
  })
  req.on('error', () => endResolve())
  req.end(body)
  return {
    sid, events, ended, t0: Date.now(),
    get status() { return status },
    json: () => ended.then(() => JSON.parse(raw)),
    waitFor: (name, ms = 10_000) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${name}; got ${events.map((e) => e.name).join(',')}`)), ms)
      const w = { pred: (e) => e.name === name, resolve: (e) => { clearTimeout(timer); resolve(e) } }
      waiters.push(w); check()
    }),
    destroy: () => req.destroy(),
  }
}

function post(p, obj, { origin = ORIGIN } = {}) {
  return new Promise((resolve, reject) => {
    const body = typeof obj === 'string' ? obj : JSON.stringify(obj)
    const headers = { 'Content-Type': 'application/json', 'X-Forwarded-For': nextIp() }
    if (origin) headers.Origin = origin
    const req = http.request({ host: '127.0.0.1', port, path: p, method: 'POST', headers }, (res) => {
      let b = ''; res.on('data', (d) => { b += d }); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b) }))
    })
    req.on('error', reject)
    req.end(body)
  })
}

const spawned = () => fs.readdirSync(fakeLog).filter((f) => f.endsWith('.spawn')).map((f) => parseInt(f, 10))
const booted = (pid) => fs.existsSync(path.join(fakeLog, `${pid}.start`))
const termed = (pid) => fs.existsSync(path.join(fakeLog, `${pid}.term`))
const alive = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }
async function until(pred, ms, step = 50) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (pred()) return true; await wait(step) }
  return pred()
}

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sbask-daemon-'))
  dataDir = path.join(root, 'data')
  fakeLog = path.join(root, 'fake')
  fs.mkdirSync(fakeLog)
  const idx = { '8.1': buildIndex('8.1'), '8.3': buildIndex('8.3') }
  indexServer = http.createServer((req, res) => {
    const m = req.url.match(/^\/index-(8\.[13])\.json$/)
    if (!m) { res.writeHead(404); return res.end() }
    // 8.3: the startup preload fails, later loads take 1.5 s, so a request
    // can close while the daemon awaits the index.
    if (m[1] === '8.3' && index83Hits++ === 0) { res.writeHead(500); return res.end() }
    const reply = () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(idx[m[1]]) }
    if (m[1] === '8.3') setTimeout(reply, 1500); else reply()
  })
  await new Promise((r) => indexServer.listen(0, '127.0.0.1', r))
  port = await freePort()
  const env = {
    ...process.env,
    CHAT_DAEMON_PORT: String(port),
    CHAT_DAEMON_SECRET: 'test-secret',
    CHAT_DAEMON_SCRATCH: path.join(root, 'scratch'),
    CLAUDE_BIN: FAKE,
    FAKE_CLAUDE_LOG: fakeLog,
    SB_ASK_DATA_DIR: dataDir,
    SB_ASK_INDEX_BASE: `http://127.0.0.1:${indexServer.address().port}`,
    SB_ASK_QUEUE_MS: String(QUEUE_MS),
    // Set explicitly so a real app/.env on the daemon host cannot turn these on.
    SB_ASK_TURNSTILE: '0',
    SB_ASK_DEV_ORIGINS: '0',
    TURNSTILE_SECRET_KEY: '',
  }
  daemon = spawn(process.execPath, [DAEMON], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  daemon.stdout.on('data', (d) => { stdout += d })
  daemon.stderr.on('data', (d) => { stdout += d })
  const ok = await until(() => /listening on/.test(stdout) && /index 8\.1 loaded/.test(stdout), 15_000)
  if (!ok) throw new Error(`daemon did not start:\n${stdout}`)
})

afterAll(async () => {
  if (daemon && daemon.exitCode === null) { daemon.kill('SIGTERM'); await until(() => daemon.exitCode !== null, 5000) }
  if (daemon && daemon.exitCode === null) daemon.kill('SIGKILL')
  await new Promise((r) => indexServer.close(r))
  for (const pid of spawned()) if (alive(pid)) { try { process.kill(pid, 'SIGKILL') } catch {} }
})

test('pre-stream error codes: origin, too_long, bad_request', async () => {
  const noOrigin = ask('hello', { origin: '', sse: false })
  expect((await noOrigin.json())).toEqual({ error: 'origin' })
  expect(noOrigin.status).toBe(403)
  const foreign = ask('hello', { origin: 'https://evil.example', sse: false })
  expect((await foreign.json()).error).toBe('origin')
  const long = ask('x'.repeat(1001), { sse: false })
  expect(await long.json()).toEqual({ error: 'too_long' })
  expect(long.status).toBe(400)
  const badVersion = ask('hello', { version: '9.9', sse: false })
  expect(await badVersion.json()).toEqual({ error: 'bad_request' })
})

test('done carries an answer id, transcript records it, feedback is accepted', async () => {
  const a = ask('QUICK how do I configure the host')
  const done = await a.waitFor('done')
  expect(done.data.id).toMatch(/^[0-9a-f]{12}$/)
  expect(done.data.sources.length).toBe(1)
  await a.ended
  const day = new Date().toISOString().slice(0, 10)
  const tr = fs.readFileSync(path.join(dataDir, 'transcripts', day, `${a.sid}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  expect(tr[0].id).toBe(done.data.id)
  expect(tr[0].iphash).toMatch(/^[0-9a-f]{16}$/)

  const j = ask('QUICK host json', { sse: false })
  const jb = await j.json()
  expect(jb.ok).toBe(true)
  expect(jb.id).toMatch(/^[0-9a-f]{12}$/)

  const fb = { sid: a.sid, id: done.data.id, vote: 'down', version: '8.1', page: '/sparkbridge/8.1/core/host/', text: 'missing a step' }
  expect(await post('/chat/sparkbridge-docs/feedback', fb)).toEqual({ status: 200, body: { ok: true } })
  expect(await post('/chat/sparkbridge-docs/feedback', { ...fb, vote: 'sideways' })).toEqual({ status: 400, body: { error: 'bad_request' } })
  expect(await post('/chat/sparkbridge-docs/feedback', '{nope')).toEqual({ status: 400, body: { error: 'bad_request' } })
  expect(await post('/chat/sparkbridge-docs/feedback', { ...fb, text: 'x'.repeat(5000) })).toEqual({ status: 400, body: { error: 'bad_request' } })
  expect(await post('/chat/sparkbridge-docs/feedback', fb, { origin: '' })).toEqual({ status: 403, body: { error: 'origin' } })
  const stored = fs.readFileSync(path.join(dataDir, 'feedback', day, `${a.sid}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  expect(stored).toHaveLength(1)
  expect(stored[0]).toMatchObject({ sid: a.sid, id: done.data.id, vote: 'down', version: '8.1', text: 'missing a step' })
  expect(stored[0].iphash).toMatch(/^[0-9a-f]{16}$/)
  // The ask route itself still matches exactly.
  expect((await post('/chat/sparkbridge-docs/other', {})).status).toBe(404)
})

test('SSE close mid-stream kills the child (SIGTERM, SIGKILL after 2 s) and the next request starts', async () => {
  const a = ask('STUBBORN configure the host')
  await a.waitFor('text')
  const b = ask('slow configure the host')
  await b.waitFor('queue')
  const live = spawned().filter((p) => alive(p))
  expect(live).toHaveLength(1)
  const [pidA] = live
  expect(pidA).toBeTruthy()
  const t = Date.now()
  a.destroy()
  expect(await until(() => termed(pidA), 1000)).toBe(true)
  expect(await until(() => !alive(pidA), 3500)).toBe(true)
  const killMs = Date.now() - t
  expect(killMs).toBeGreaterThanOrEqual(1800) // stubborn: survived SIGTERM, needed SIGKILL
  expect(killMs).toBeLessThan(3500)
  await b.waitFor('start', 3000)
  // The fake writes its spawn file a moment after `start`.
  let pidB
  await until(() => (pidB = spawned().find((p) => p !== pidA && alive(p) && booted(p))), 2000)
  expect(pidB).toBeTruthy()
  b.destroy()
  expect(await until(() => termed(pidB) && !alive(pidB), 3000)).toBe(true)
  await until(() => /client_closed/.test(stdout), 1000)
  expect(stdout).toMatch(/"status":"client_closed"/)
})

test('close while queued or while the index loads never spawns', async () => {
  // Index await: 8.3 loads take 1.5 s, the client leaves after 300 ms.
  const before = spawned().length
  const c = ask('slow configure the host', { version: '8.3' })
  await wait(300)
  c.destroy()
  await wait(2500)
  expect(spawned().length).toBe(before)

  const a = ask('slow configure the host')
  await a.waitFor('text') // A's child is up and streaming
  const b = ask('slow configure the host')
  await b.waitFor('queue')
  b.destroy()
  await wait(200)
  a.destroy()
  await wait(1500)
  expect(spawned().length).toBe(before + 1)
  // 8.3 index is loaded now and serves normally.
  const d = ask('QUICK configure the host', { version: '8.3' })
  expect((await d.waitFor('done')).data.id).toMatch(/^[0-9a-f]{12}$/)
})

test('a queued job gets queue_timeout after SB_ASK_QUEUE_MS', async () => {
  const a = ask('slow configure the host')
  await a.waitFor('start')
  const b = ask('slow configure the host')
  await b.waitFor('queue')
  const err = await b.waitFor('error', QUEUE_MS + 3000)
  expect(err.data).toEqual({ error: 'queue_timeout', handoff: true })
  expect(err.at - b.t0).toBeGreaterThanOrEqual(QUEUE_MS - 100)
  a.destroy()
  await wait(500)
})

test('queue_full when three public jobs are already waiting', async () => {
  const a = ask('slow configure the host')
  await a.waitFor('start')
  const waiting = [ask('slow q1'), ask('slow q2'), ask('slow q3')]
  for (const w of waiting) await w.waitFor('queue')
  const e = ask('slow q4', { sse: false })
  expect(await e.json()).toEqual({ error: 'queue_full', handoff: true })
  expect(e.status).toBe(503)
  for (const w of waiting) w.destroy()
  a.destroy()
  await wait(800)
})

test('flag off: the turnstile field is ignored, even when malformed', async () => {
  const sid = nextSid()
  const r = await new Promise((resolve) => {
    const body = JSON.stringify({ sid, message: 'QUICK host', version: '8.1', turnstile: { bad: true } })
    const req = http.request({ host: '127.0.0.1', port, path: '/chat/sparkbridge-docs', method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-Forwarded-For': nextIp() } }, (res) => {
      let b = ''; res.on('data', (d) => { b += d }); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b) }))
    })
    req.end(body)
  })
  expect(r.status).toBe(200)
  expect(r.body.id).toMatch(/^[0-9a-f]{12}$/)
})

test('client IP is the last X-Forwarded-For entry (earlier entries are client-controlled)', async () => {
  const a = ask('QUICK host', { ip: '198.51.100.66, 192.0.2.77' })
  await a.waitFor('done')
  await wait(700)
  const salt = JSON.parse(fs.readFileSync(path.join(dataDir, 'salt.json'), 'utf8')).value
  const h = (ip) => crypto.createHmac('sha256', salt).update(ip).digest('hex').slice(0, 16)
  const state = JSON.parse(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8'))
  expect(state.ip[h('192.0.2.77')]).toBeDefined()
  expect(state.ip[h('198.51.100.66')]).toBeUndefined()
})

test('privacy: salt only in 0600 salt.json, state keyed by iphash, raw IPs never logged', async () => {
  await wait(700) // state saves are debounced 500 ms
  const state = JSON.parse(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8'))
  expect(state.salt).toBeUndefined()
  expect(Object.keys(state.ip).length).toBeGreaterThan(0)
  for (const k of [...Object.keys(state.ip), ...Object.keys(state.fbIp || {})]) expect(k).toMatch(/^[0-9a-f]{16}$/)
  const saltFile = path.join(dataDir, 'salt.json')
  expect(fs.statSync(saltFile).mode & 0o777).toBe(0o600)
  const salt = JSON.parse(fs.readFileSync(saltFile, 'utf8')).value
  const rawState = fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8')
  expect(rawState).not.toContain(salt)
  expect(stdout).not.toContain(salt)
  expect(stdout).not.toMatch(/203\.0\.113\./)
  expect(rawState).not.toMatch(/203\.0\.113\./)
  const day = new Date().toISOString().slice(0, 10)
  for (const sub of ['transcripts', 'feedback']) {
    for (const f of fs.readdirSync(path.join(dataDir, sub, day))) {
      expect(fs.readFileSync(path.join(dataDir, sub, day, f), 'utf8')).not.toMatch(/203\.0\.113\./)
    }
  }
})
