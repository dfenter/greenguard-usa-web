// Integration: chat-daemon with SB_ASK_TURNSTILE=1 against a local siteverify
// stub (SB_ASK_TURNSTILE_VERIFY_URL). Success reaches `start`; failure is 403
// verify_failed and does not spend the global day counter.
const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')
const net = require('net')
const { spawn } = require('child_process')
const MiniSearch = require('minisearch')

jest.setTimeout(60_000)

const ORIGIN = 'https://docs.greenguard-usa.com'
const FAKE = path.join(__dirname, 'fixtures', 'fake-claude')
const DAEMON = path.join(__dirname, '..', 'scripts', 'chat-daemon.js')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let seq = 0
const nextSid = () => `bbbbbbbb-bbbb-4bbb-8bbb-${String(++seq).padStart(12, '0')}`

let root, dataDir, indexServer, verifyServer, daemon, port, stdout = ''
const verifyCalls = []

function buildIndex(version) {
  const options = { idField: 'id', fields: ['title', 'heading', 'text'], storeFields: ['version', 'slug', 'title', 'heading', 'url', 'text'],
    searchOptions: { boost: { title: 2, heading: 3 }, prefix: true, fuzzy: 0.2, combineWith: 'OR' }, maxPerPage: 2 }
  const ms = new MiniSearch(options)
  ms.addAll([{ id: `${version}:core/host#configuration:0`, version, slug: 'core/host', title: 'Host', heading: 'Configuration',
    url: `${ORIGIN}/sparkbridge/${version}/core/host/#configuration`, text: 'configure the host module broker connection quick' }])
  return JSON.stringify({ format: 2, version, builtAt: 'T', count: 1, options, index: ms.toJSON() })
}
function freePort() {
  return new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) }) })
}
async function until(pred, ms, step = 50) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (pred()) return true; await wait(step) }
  return pred()
}
function ask(extra) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ sid: nextSid(), message: 'QUICK configure the host', version: '8.1', ...extra })
    const req = http.request({ host: '127.0.0.1', port, path: '/chat/sparkbridge-docs', method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Accept: 'text/event-stream', 'X-Forwarded-For': `192.0.2.${10 + seq}` } }, (res) => {
      let b = ''; res.setEncoding('utf8'); res.on('data', (d) => { b += d }); res.on('end', () => resolve({ status: res.statusCode, raw: b }))
    })
    req.end(body)
  })
}
const dayCount = () => {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8')).day.count } catch { return 0 }
}

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sbask-ts-'))
  dataDir = path.join(root, 'data')
  fs.mkdirSync(path.join(root, 'fake'))
  const idx = { '8.1': buildIndex('8.1'), '8.3': buildIndex('8.3') }
  indexServer = http.createServer((req, res) => {
    const m = req.url.match(/^\/index-(8\.[13])\.json$/)
    if (!m) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(idx[m[1]])
  })
  verifyServer = http.createServer((req, res) => {
    let b = ''; req.on('data', (d) => { b += d })
    req.on('end', () => {
      const f = new URLSearchParams(b)
      verifyCalls.push({ secret: f.get('secret'), response: f.get('response'), remoteip: f.get('remoteip') })
      const ok = f.get('response') === 'good-token'
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(ok ? { success: true, hostname: 'docs.greenguard-usa.com' } : { success: false }))
    })
  })
  await new Promise((r) => indexServer.listen(0, '127.0.0.1', r))
  await new Promise((r) => verifyServer.listen(0, '127.0.0.1', r))
  port = await freePort()
  const env = {
    ...process.env,
    CHAT_DAEMON_PORT: String(port),
    CHAT_DAEMON_SECRET: 'test-secret',
    CHAT_DAEMON_SCRATCH: path.join(root, 'scratch'),
    CLAUDE_BIN: FAKE,
    FAKE_CLAUDE_LOG: path.join(root, 'fake'),
    SB_ASK_DATA_DIR: dataDir,
    SB_ASK_INDEX_BASE: `http://127.0.0.1:${indexServer.address().port}`,
    SB_ASK_TURNSTILE: '1',
    TURNSTILE_SECRET_KEY: 'ts-secret',
    SB_ASK_TURNSTILE_VERIFY_URL: `http://127.0.0.1:${verifyServer.address().port}/siteverify`,
    SB_ASK_DEV_ORIGINS: '0',
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
  await new Promise((r) => verifyServer.close(r))
})

test('failed, missing, or malformed token: 403 verify_failed, global counter untouched', async () => {
  const before = dayCount()
  for (const extra of [{ turnstile: 'bad-token' }, {}, { turnstile: 42 }, { turnstile: 'x'.repeat(2049) }]) {
    const r = await ask(extra)
    expect(r.status).toBe(403)
    expect(JSON.parse(r.raw)).toEqual({ error: 'verify_failed', handoff: true })
  }
  // Only the well-formed string token reaches siteverify.
  expect(verifyCalls.map((c) => c.response)).toEqual(['bad-token'])
  expect(verifyCalls[0]).toEqual({ secret: 'ts-secret', response: 'bad-token', remoteip: '192.0.2.11' })
  await wait(700) // state saves are debounced 500 ms
  expect(dayCount()).toBe(before)
  expect(stdout).not.toContain('bad-token')
  expect(stdout).not.toContain('ts-secret')
})

test('valid token reaches start and done, and spends one global count', async () => {
  const before = dayCount()
  const r = await ask({ turnstile: 'good-token' })
  expect(r.status).toBe(200)
  expect(r.raw).toMatch(/event: start/)
  expect(r.raw).toMatch(/event: done/)
  await wait(700)
  expect(dayCount()).toBe(before + 1)
})
