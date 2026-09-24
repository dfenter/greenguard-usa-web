#!/usr/bin/env node
// Nightly snapshot of GitHub release asset download counts for
// greenguard-usa/sparkbridge-releases.
//   node scripts/sparkbridge-downloads.js            append today's snapshot (idempotent per day)
//   node scripts/sparkbridge-downloads.js summary    per-release totals + 7-day delta
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const REPO = 'greenguard-usa/sparkbridge-releases'
const CSV = path.join(__dirname, '..', 'data', 'sparkbridge-downloads.csv')
const HEADER = ['date', 'tag', 'asset', 'download_count', 'delta']

function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function ghBin() {
  for (const c of ['/opt/homebrew/bin/gh', '/usr/local/bin/gh']) if (fs.existsSync(c)) return c
  return 'gh'
}

function csvField(v) {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

function parseCsv(text) {
  const rows = []
  let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false }
      else field += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

function readRows() {
  if (!fs.existsSync(CSV)) return []
  const rows = parseCsv(fs.readFileSync(CSV, 'utf8'))
  return rows.slice(1).filter((r) => r.length >= 4 && r[0]).map((r) => ({
    date: r[0], tag: r[1], asset: r[2], download_count: Number(r[3]), delta: r[4] ?? '',
  }))
}

function writeRows(rows) {
  fs.mkdirSync(path.dirname(CSV), { recursive: true })
  const lines = [HEADER.join(',')].concat(rows.map((r) => HEADER.map((h) => csvField(r[h])).join(',')))
  fs.writeFileSync(CSV, lines.join('\n') + '\n')
}

function fetchAssets() {
  const out = execFileSync(ghBin(), [
    'api', `repos/${REPO}/releases`, '--paginate',
    '--jq', '.[] | .tag_name as $t | .assets[] | [$t, .name, .download_count] | @json',
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return out.split('\n').filter(Boolean).map((l) => {
    const [tag, asset, n] = JSON.parse(l)
    return { tag, asset, download_count: Number(n) }
  })
}

function snapshot() {
  const today = localDate()
  const assets = fetchAssets()
  const kept = readRows().filter((r) => r.date !== today)
  const last = new Map()
  for (const r of kept) {
    const k = r.tag + '\u0000' + r.asset
    const prev = last.get(k)
    if (!prev || r.date >= prev.date) last.set(k, r)
  }
  const fresh = assets.map((a) => {
    const prev = last.get(a.tag + '\u0000' + a.asset)
    return { date: today, ...a, delta: prev ? a.download_count - prev.download_count : '' }
  })
  const all = kept.concat(fresh).sort((a, b) =>
    a.date.localeCompare(b.date) || a.tag.localeCompare(b.tag) || a.asset.localeCompare(b.asset))
  writeRows(all)
  const total = fresh.reduce((s, r) => s + r.download_count, 0)
  console.log(`[sparkbridge-downloads] ${today}: ${fresh.length} assets, ${total} total downloads -> ${CSV}`)
}

function totalsAt(rows, date) {
  const m = new Map()
  for (const r of rows) if (r.date === date) m.set(r.tag, (m.get(r.tag) || 0) + r.download_count)
  return m
}

const sgn = (n) => (n >= 0 ? '+' + n : String(n))

function summary() {
  const rows = readRows()
  if (!rows.length) { console.log('No snapshots yet. Run without arguments first.'); return }
  const dates = [...new Set(rows.map((r) => r.date))].sort()
  const latest = dates[dates.length - 1]
  const cut = new Date(); cut.setDate(cut.getDate() - 7)
  const older = dates.filter((d) => d <= localDate(cut))
  const base = older.length ? older[older.length - 1] : dates[0]
  const label = older.length ? '7d' : `since ${base}`
  const now = totalsAt(rows, latest)
  const then = totalsAt(rows, base)
  const list = [...now.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const w = Math.max(7, ...list.map(([t]) => t.length))
  console.log(`SparkBridge release downloads, snapshot ${latest} (delta ${label})`)
  console.log(`${'release'.padEnd(w)}  ${'total'.padStart(7)}  ${'delta'.padStart(7)}`)
  let gt = 0, gd = 0
  for (const [tag, total] of list) {
    const d = total - (then.get(tag) || 0)
    gt += total; gd += d
    console.log(`${tag.padEnd(w)}  ${String(total).padStart(7)}  ${sgn(d).padStart(7)}`)
  }
  console.log(`${'TOTAL'.padEnd(w)}  ${String(gt).padStart(7)}  ${sgn(gd).padStart(7)}`)
}

const mode = process.argv[2] || 'snapshot'
if (mode === 'snapshot') snapshot()
else if (mode === 'summary') summary()
else { console.error('usage: sparkbridge-downloads.js [snapshot|summary]'); process.exit(2) }
