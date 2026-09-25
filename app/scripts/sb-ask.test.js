// node --test app/scripts/sb-ask.test.js
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const MiniSearch = require('minisearch')
const sb = require('./sb-ask')

const U = (s) => `https://docs.greenguard-usa.com/sparkbridge/8.1/${s}`
const chunks = [
  { title: 'Host', heading: 'Configuration', url: U('core/host/#configuration'), text: 'a' },
  { title: 'Edge', heading: 'Edge', url: U('core/edge/'), text: 'b' },
  { title: 'Host', heading: 'Configuration', url: U('core/host/#configuration'), text: 'c' },
  { title: 'Licensing', heading: 'Activation', url: U('licensing/#activation'), text: 'd' },
]

test('citations: valid kept, invalid dropped, renumbered in order, deduped by URL', () => {
  const r = sb.validateCitations('Edge first [2]. Host [1] and again [3]. Bogus [9]. Group [4, 7].', chunks)
  assert.strictEqual(r.text, 'Edge first [1]. Host [2] and again [2]. Bogus. Group [3].')
  assert.deepStrictEqual(r.sources.map((s) => s.n), [1, 2, 3])
  assert.strictEqual(r.sources[0].url, U('core/edge/'))
  assert.strictEqual(r.sources[1].title, 'Host > Configuration')
  assert.strictEqual(r.sources[0].title, 'Edge')
  assert.strictEqual(sb.validateCitations('Both [1][3] here.', chunks).text, 'Both [1] here.')
})

test('citations: markdown link labels are not treated as markers', () => {
  const r = sb.validateCitations('See [1](https://docs.greenguard-usa.com/sparkbridge/x/) now [0]', chunks)
  assert.match(r.text, /\[1\]\(https/)
  assert.strictEqual(r.sources.length, 0)
})

test('URL stripping: foreign links reduced to text, bare foreign URLs removed', () => {
  const t = sb.stripUrls('Read [the guide](https://evil.example/x) or https://evil.example/y. ' +
    'Also [host](https://docs.greenguard-usa.com/sparkbridge/8.1/core/host/) and https://docs.greenguard-usa.com/sparkbridge/8.3/a/. ' +
    'Tricks https://docs.greenguard-usa.com.evil.io/sparkbridge/ and https://docs.greenguard-usa.com/other/ and http://docs.greenguard-usa.com/sparkbridge/x/', [])
  assert.ok(!/evil/.test(t), t)
  assert.ok(t.includes('Read the guide or .'))
  assert.ok(t.includes('[host](https://docs.greenguard-usa.com/sparkbridge/8.1/core/host/)'))
  assert.ok(t.includes('https://docs.greenguard-usa.com/sparkbridge/8.3/a/.'))
  assert.ok(!t.includes('/other/'))
  assert.ok(!t.includes('http://'))
})

test('sentinel stripped across every chunk boundary', () => {
  const full = '[not-covered] The documentation does not cover that.'
  for (let cut = 1; cut < full.length; cut++) {
    for (const size of [1, 2, 3, 5, 40]) {
      const s = new sb.SentinelStripper()
      let out = ''
      const parts = [full.slice(0, cut), ...full.slice(cut).match(new RegExp(`[\\s\\S]{1,${size}}`, 'g'))]
      for (const p of parts) out += s.feed(p)
      out += s.end()
      assert.strictEqual(out, 'The documentation does not cover that.', `cut ${cut} size ${size}`)
      assert.strictEqual(s.notCovered, true)
    }
  }
})

test('sentinel stripper passes normal text and near misses unchanged', () => {
  for (const full of ['Use the Host module [1].', '[1] says so.', '[not-cov is not it', '[no', '  leading space']) {
    const s = new sb.SentinelStripper()
    let out = ''
    for (const ch of full) out += s.feed(ch)
    out += s.end()
    assert.strictEqual(out, full)
    assert.strictEqual(s.notCovered, false)
  }
})

test('finalizeAnswer: sentinel sets answered false', () => {
  const r = sb.finalizeAnswer('[not-covered] Not covered [1]. We can send this thread to an engineer.', chunks)
  assert.strictEqual(r.answered, false)
  assert.ok(!r.text.includes('[not-covered]'))
  const ok = sb.finalizeAnswer('Yes [1].', chunks)
  assert.strictEqual(ok.answered, true)
  assert.strictEqual(ok.sources.length, 1)
})

test('history cap: 6 turns and 6K chars, newest kept', () => {
  const h = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: String(i).repeat(1500) }))
  const c = sb.capHistory(h)
  assert.ok(c.length <= 6)
  assert.ok(c.reduce((n, m) => n + m.content.length, 0) <= 6000)
  assert.strictEqual(c[c.length - 1].content[0], '9')
  assert.deepStrictEqual(sb.capHistory([{ role: 'system', content: 'x' }, 'junk']), [])
})

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'sbask-')) }

test('limits: sid 8 per 10 min, ip 20 per hour, global 500 per UTC day', () => {
  const st = new sb.AskState(path.join(tmpdir(), 'state.json'))
  const t = Date.parse('2026-09-24T12:00:00Z')
  const sid = '11111111-1111-4111-8111-111111111111'
  for (let i = 0; i < 8; i++) assert.ok(st.check('1.1.1.1', sid, t + i).ok)
  const r = st.check('1.1.1.1', sid, t + 10)
  assert.strictEqual(r.ok, false); assert.strictEqual(r.scope, 'sid')
  assert.ok(r.retryAfter > 590 && r.retryAfter <= 600)
  assert.ok(st.check('1.1.1.1', sid, t + 600_001).ok)
  const st2 = new sb.AskState(path.join(tmpdir(), 'state.json'))
  for (let i = 0; i < 20; i++) assert.ok(st2.check('2.2.2.2', `22222222-2222-4222-8222-${String(i).padStart(12, '0')}`, t + i).ok)
  const r2 = st2.check('2.2.2.2', '33333333-3333-4333-8333-333333333333', t + 100)
  assert.strictEqual(r2.scope, 'ip')
  const st3 = new sb.AskState(path.join(tmpdir(), 'state.json'))
  st3.data.day = { date: '2026-09-24', count: 500 }
  const r3 = st3.check('3.3.3.3', sid, t)
  assert.strictEqual(r3.scope, 'global'); assert.strictEqual(r3.retryAfter, 12 * 3600)
  assert.ok(st3.check('3.3.3.3', sid, Date.parse('2026-09-25T00:00:01Z')).ok)
})

test('state file written atomically and reloaded', () => {
  const f = path.join(tmpdir(), 'd', 'state.json')
  const st = new sb.AskState(f)
  st.check('4.4.4.4', '44444444-4444-4444-8444-444444444444', Date.now())
  st.flush()
  const again = new sb.AskState(f)
  assert.strictEqual(again.data.ip['4.4.4.4'].length, 1)
  assert.strictEqual(fs.statSync(f).mode & 0o777, 0o600)
  assert.deepStrictEqual(fs.readdirSync(path.dirname(f)), ['state.json'])
})

test('iphash: stable within a UTC day, rotates next day, salt never equals hash input', () => {
  const st = new sb.AskState(path.join(tmpdir(), 'state.json'))
  const d1 = Date.parse('2026-09-24T01:00:00Z'), d1b = Date.parse('2026-09-24T23:00:00Z'), d2 = Date.parse('2026-09-25T00:00:00Z')
  const a = st.ipHash('5.5.5.5', d1)
  assert.match(a, /^[0-9a-f]{16}$/)
  assert.strictEqual(st.ipHash('5.5.5.5', d1b), a)
  const salt1 = st.data.salt.value
  const b = st.ipHash('5.5.5.5', d2)
  assert.notStrictEqual(b, a)
  assert.notStrictEqual(st.data.salt.value, salt1)
  assert.notStrictEqual(st.ipHash('6.6.6.6', d2), b)
})

test('transcripts: appended per sid per day, dirs older than 30 days pruned', () => {
  const dir = tmpdir()
  const now = Date.parse('2026-09-24T12:00:00Z')
  sb.appendTranscript(dir, 'sid-a', { q: 'x' }, now)
  sb.appendTranscript(dir, 'sid-a', { q: 'y' }, now)
  const f = path.join(dir, 'transcripts', '2026-09-24', 'sid-a.jsonl')
  assert.strictEqual(fs.readFileSync(f, 'utf8').trim().split('\n').length, 2)
  assert.strictEqual(fs.statSync(path.dirname(f)).mode & 0o777, 0o700)
  for (const d of ['2026-08-24', '2026-08-23', '2026-08-26', 'notes']) fs.mkdirSync(path.join(dir, 'transcripts', d))
  const removed = sb.pruneTranscripts(dir, now)
  assert.deepStrictEqual(removed.sort(), ['2026-08-23', '2026-08-24'])
  assert.deepStrictEqual(fs.readdirSync(path.join(dir, 'transcripts')).sort(), ['2026-08-26', '2026-09-24', 'notes'])
})

test('index store: local dir load, search, last good kept on failure', async () => {
  const dir = tmpdir()
  const options = { idField: 'id', fields: ['title', 'heading', 'text'], storeFields: ['version', 'slug', 'title', 'heading', 'url', 'text'],
    searchOptions: { boost: { title: 2, heading: 3 }, prefix: true, fuzzy: 0.2, combineWith: 'OR' } }
  const ms = new MiniSearch(options)
  ms.addAll([{ id: '8.1:a#x:0', version: '8.1', slug: 'a', title: 'Store and forward', heading: 'Replay', url: U('a/#replay'), text: 'store and forward replays buffered data' },
    { id: '8.1:b:0', version: '8.1', slug: 'b', title: 'Install', heading: 'Install', url: U('b/'), text: 'install the module' }])
  const f = path.join(dir, 'index-8.1.json')
  fs.writeFileSync(f, JSON.stringify({ format: 1, version: '8.1', builtAt: 'T', count: 2, options, index: ms.toJSON() }))
  const store = new sb.IndexStore(dir, { recheckMs: 0 })
  const e = await store.get('8.1')
  const hits = sb.searchChunks(e, 'how does replay work', [])
  assert.strictEqual(hits[0].url, U('a/#replay'))
  fs.writeFileSync(f, '{broken')
  const e2 = await store.get('8.1', Date.now() + 5)
  assert.strictEqual(e2, e)
  assert.strictEqual(await store.get('8.3'), null)
  assert.strictEqual(store.status()['8.1'].builtAt, 'T')
})

test('prompt: system has no SparkBridge version or prices; user turn carries line, excerpts, history, question', () => {
  assert.ok(!/\d+\.\d+\.\d+|\$\d/.test(sb.systemPrompt(true)))
  assert.ok(!/—/.test(sb.systemPrompt(true)))
  assert.ok(sb.systemPrompt(true).startsWith(sb.SPARKBRIDGE_DOCS_SYSTEM))
  const u = sb.buildUserTurn({ version: '8.3', chunks: chunks.slice(0, 2), history: [{ role: 'user', content: 'hi' }], question: 'Q?' })
  assert.ok(u.startsWith('Ignition line: 8.3.x'))
  assert.ok(u.includes(`[1] Host > Configuration (${U('core/host/#configuration')})`))
  assert.ok(u.includes('Visitor: hi'))
  assert.ok(u.trim().endsWith('Question: Q?'))
})

test('query procedure: format 2 options drop stopwords, stem, boost overview, exclude root, cap 2 per page', async () => {
  const options = { idField: 'id', fields: ['title', 'heading', 'text', 'context'], storeFields: ['version', 'slug', 'title', 'heading', 'url', 'text'],
    searchOptions: { boost: { title: 2, heading: 3, context: 2 }, prefix: true, fuzzy: 0.2, combineWith: 'OR' },
    stopwords: ['what', 'does', 'the', 'do', 'it', 'sparkbridge'], stem: 'lite-2', prefixMinLength: 5, fuzzyMinLength: 7, camelSplit: true,
    kindBoost: { 'release-notes/': 0.4, 'reference/': 0.6, '/overview': 2 }, excludeSlugs: [''], maxPerPage: 2 }
  const ms = new MiniSearch({ ...options, processTerm: sb.makeProcessTerm(options) })
  const doc = (slug, n, text) => ({ id: `8.1:${slug}#:${n}`, version: '8.1', slug, title: 'T', heading: '', url: U(`${slug}/#${n}`), text, context: slug.replace(/\//g, ' ') })
  ms.addAll([doc('', 0, 'what does sparkbridge do: flow modules'), doc('core/flow/overview', 0, 'the SparkFlow module publishes points'),
    doc('core/flow/install', 0, 'install the flow module'), doc('core/flow/install', 1, 'flow modules install steps'), doc('core/flow/install', 2, 'flow module upgrade'),
    doc('release-notes/3-0-0', 0, 'flow flow flow module changes')])
  const slugs = sb.askSearch(ms, options, 'What does the Flow module do?', 8).map((h) => h.slug)
  assert.deepStrictEqual(slugs, ['core/flow/overview', 'core/flow/install', 'core/flow/install', 'release-notes/3-0-0'])
  assert.deepStrictEqual(sb.askSearch(ms, options, 'what does it do', 8), [])
  assert.deepStrictEqual(sb.makeProcessTerm(options)('`Licensing`'), 'licens')
})
