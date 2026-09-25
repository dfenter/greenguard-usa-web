const mockSendEmail = jest.fn().mockResolvedValue({ messageId: 'm1' })
jest.mock('../lib/email', () => ({ sendEmail: mockSendEmail }))

const ORIGIN = 'https://docs.greenguard-usa.com'
const SID = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b'

function load() {
  let handler
  jest.isolateModules(() => { handler = require('../pages/api/sparkbridge/ask-handoff').default })
  return handler
}

function body(over = {}) {
  return {
    sid: SID,
    version: '8.3',
    page: '/sparkbridge/8.3/install/',
    transcript: [
      { role: 'user', content: 'How do I   install\nthe module on a redundant pair?' },
      { role: 'assistant', content: 'Install on the primary first.', sources: [
        { title: 'Install', url: 'https://docs.greenguard-usa.com/sparkbridge/8.3/install/' },
        { title: 'Install', url: 'https://docs.greenguard-usa.com/sparkbridge/8.3/install/' },
        { title: 'Redundancy', url: 'https://docs.greenguard-usa.com/sparkbridge/8.3/redundancy/' },
      ] },
    ],
    ...over,
  }
}

function call(handler, { method = 'POST', origin = ORIGIN, ip = '1.2.3.4', b = body() } = {}) {
  const headers = { 'x-forwarded-for': `${ip}, 10.0.0.1` }
  if (origin) headers.origin = origin
  const res = {
    statusCode: 0, headers: {}, payload: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v },
    status(c) { this.statusCode = c; return this },
    json(p) { this.payload = p; return this },
    end() { return this },
  }
  return Promise.resolve(handler({ method, headers, body: b }, res)).then(() => res)
}

beforeEach(() => { mockSendEmail.mockClear(); delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN; delete process.env.VERCEL_ENV })

describe('ask-handoff CORS', () => {
  test('foreign or missing origin => 403 before any work', async () => {
    const h = load()
    for (const origin of ['https://evil.example', null, 'https://docs.greenguard-usa.com.evil.io']) {
      const r = await call(h, { origin })
      expect(r.statusCode).toBe(403)
      expect(r.payload).toEqual({ error: 'origin' })
      expect(r.headers['access-control-allow-origin']).toBeUndefined()
      expect(r.headers.vary).toBe('Origin')
    }
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
  test('preflight echoes docs origin', async () => {
    const r = await call(load(), { method: 'OPTIONS' })
    expect(r.statusCode).toBe(204)
    expect(r.headers['access-control-allow-origin']).toBe(ORIGIN)
  })
  test('localhost only outside production', async () => {
    const h = load()
    expect((await call(h, { method: 'OPTIONS', origin: 'http://localhost:4321' })).statusCode).toBe(204)
    process.env.VERCEL_ENV = 'production'
    expect((await call(h, { method: 'OPTIONS', origin: 'http://localhost:4321' })).statusCode).toBe(403)
    expect((await call(h, { method: 'OPTIONS', origin: 'http://127.0.0.1:4321' })).statusCode).toBe(403)
  })
  test('GET => 405', async () => {
    expect((await call(load(), { method: 'GET' })).statusCode).toBe(405)
  })
})

describe('ask-handoff validation', () => {
  const bad = [
    { sid: 'nope' },
    { version: '8.2' },
    { page: '/other/page/' },
    { note: 'x'.repeat(1001) },
    { transcript: [] },
    { transcript: Array.from({ length: 13 }, () => ({ role: 'user', content: 'q' })) },
    { transcript: [{ role: 'system', content: 'q' }] },
    { transcript: [{ role: 'user', content: 'x'.repeat(4001) }] },
    { transcript: [{ role: 'user', content: 'q', sources: [{ title: 't', url: 'https://evil.example/sparkbridge/' }] }] },
    { transcript: [{ role: 'assistant', content: 'a' }] },
  ]
  test.each(bad.map((o, i) => [i, o]))('bad body %i => 400', async (_i, over) => {
    const r = await call(load(), { b: body(over) })
    expect(r.statusCode).toBe(400)
    expect(r.payload).toEqual({ error: 'bad_request' })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
  test('valid body => 200 and one email to admin', async () => {
    const r = await call(load())
    expect(r.statusCode).toBe(200)
    expect(r.payload).toEqual({ ok: true })
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail.mock.calls[0][0].to).toBe('admin@greenguard-usa.com')
  })
  test('send failure => 502', async () => {
    mockSendEmail.mockRejectedValueOnce(new Error('boom'))
    const r = await call(load())
    expect(r.statusCode).toBe(502)
    expect(r.payload).toEqual({ error: 'send_failed' })
  })
})

describe('ask-handoff rate limits', () => {
  test('4th call for one sid in an hour => 429', async () => {
    const h = load()
    for (let i = 0; i < 3; i++) expect((await call(h, { ip: `9.9.9.${i}` })).statusCode).toBe(200)
    const r = await call(h, { ip: '9.9.9.9' })
    expect(r.statusCode).toBe(429)
    expect(r.payload).toEqual({ error: 'rate_limited' })
  })
  test('11th call for one IP in a day => 429', async () => {
    const h = load()
    for (let i = 0; i < 10; i++) {
      const sid = `3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a${String(i).padStart(2, '0')}`
      expect((await call(h, { b: body({ sid }) })).statusCode).toBe(200)
    }
    const r = await call(h, { b: body({ sid: '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5aff' }) })
    expect(r.statusCode).toBe(429)
  })
  test('KV path uses incr+expire with sbask-handoff prefixes', async () => {
    process.env.KV_REST_API_URL = 'https://kv.test'; process.env.KV_REST_API_TOKEN = 't'
    const counts = {}
    const kv = { incr: jest.fn(async (k) => (counts[k] = (counts[k] || 0) + 1)), expire: jest.fn(async () => 1) }
    jest.doMock('@vercel/kv', () => ({ kv }))
    const r = await call(load())
    jest.dontMock('@vercel/kv')
    expect(r.statusCode).toBe(200)
    expect(kv.incr).toHaveBeenCalledWith(`sbask-handoff-sid:${SID}`)
    expect(kv.incr).toHaveBeenCalledWith('sbask-handoff-ip:1.2.3.4')
    expect(kv.expire).toHaveBeenCalledWith(`sbask-handoff-sid:${SID}`, 3600)
    expect(kv.expire).toHaveBeenCalledWith('sbask-handoff-ip:1.2.3.4', 86400)
  })
})

describe('ask-handoff message', () => {
  test('Reply-To only for a valid visitor email', async () => {
    const h = load()
    await call(h, { b: body({ email: 'visitor@example.com' }) })
    expect(mockSendEmail.mock.calls[0][0].replyTo).toBe('visitor@example.com')
    for (const email of ['not-an-email', 'a@b', 'x@y.com\r\nBcc: z@evil.io', `${'a'.repeat(250)}@b.co`, 42]) {
      mockSendEmail.mockClear()
      const r = await call(h, { ip: `7.7.7.${String(email).length % 200}`, b: body({ sid: '11111111-2222-4333-8444-' + String(Math.random()).slice(2, 14).padEnd(12, '0'), email }) })
      expect(r.statusCode).toBe(200)
      const m = mockSendEmail.mock.calls[0][0]
      expect(m).not.toHaveProperty('replyTo')
      expect(m.html).toContain('none given')
    }
  })
  test('subject is first user question, whitespace collapsed, 80 chars max', async () => {
    const long = 'word '.repeat(40)
    const h = load()
    await call(h, { b: body({ transcript: [{ role: 'user', content: `  ${long}` }] }) })
    const subject = mockSendEmail.mock.calls[0][0].subject
    expect(subject).toBe(`Ask an Engineer: ${long.replace(/\s+/g, ' ').trim().slice(0, 80)}`)
    expect(subject.length).toBe('Ask an Engineer: '.length + 80)
    mockSendEmail.mockClear()
    await call(h, { ip: '5.5.5.5', b: body({ sid: '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a77' }) })
    expect(mockSendEmail.mock.calls[0][0].subject).toBe('Ask an Engineer: How do I install the module on a redundant pair?')
  })
  test('HTML escapes user content and dedupes cited pages', async () => {
    await call(load(), { b: body({
      note: '<b>note</b> & "q"',
      transcript: [
        { role: 'user', content: '<script>alert(1)</script>' },
        { role: 'assistant', content: "it's <img src=x>", sources: [
          { title: '<i>T</i>', url: 'https://docs.greenguard-usa.com/sparkbridge/8.3/a/"onmouseover' },
          { title: '<i>T</i>', url: 'https://docs.greenguard-usa.com/sparkbridge/8.3/a/"onmouseover' },
        ] },
      ],
    }) })
    const html = mockSendEmail.mock.calls[0][0].html
    expect(html).not.toMatch(/<script>|<img|<b>note|<i>T/)
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&lt;b&gt;note&lt;/b&gt; &amp; &quot;q&quot;')
    expect(html).toContain('it&#x27;s &lt;img src=x&gt;')
    expect(html).toContain('/a/&quot;onmouseover')
    expect(html.match(/<li>/g)).toHaveLength(1)
    expect(html).toContain('Visitor:')
    expect(html).toContain('Assistant:')
    expect(html).toContain('https://docs.greenguard-usa.com/sparkbridge/8.3/install/')
    expect(html).toContain('Ignition:</strong> 8.3')
    expect(html).not.toMatch(/\u2014/)
  })
})
