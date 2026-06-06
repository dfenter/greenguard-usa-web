/**
 * Fetch Drive file sizes for duplicate candidates via the Drive batch API,
 * then filter to same-name + same-date + same-size groups (true duplicates).
 * Writes duplicates-verified.csv with columns: name, date, size, keep_id, delete_id
 *
 * Run from photos/ directory:
 *   node scripts/fetch-sizes-and-dedupe.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dir, '..')

// Parse .env.local
const env = {}
for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}

async function getToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.PHOTOS_GOOGLE_CLIENT_ID,
      client_secret: env.PHOTOS_GOOGLE_CLIENT_SECRET,
      refresh_token: env.PHOTOS_GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  })
  const t = await res.json()
  if (!t.access_token) { console.error('Token error:', t); process.exit(1) }
  return t.access_token
}

let accessToken = await getToken()
let tokenExpiry = Date.now() + 55 * 60 * 1000
console.log('Token OK.\n')

async function ensureToken() {
  if (Date.now() > tokenExpiry) {
    accessToken = await getToken()
    tokenExpiry = Date.now() + 55 * 60 * 1000
    process.stdout.write(' [token refreshed]')
  }
}

// Drive HTTP batch API: send up to 100 files.get requests in one HTTP call
async function fetchSizesBatch(ids) {
  await ensureToken()
  const boundary = 'batch_boundary_xyz'
  const parts = ids.map(id =>
    `--${boundary}\r\nContent-Type: application/http\r\n\r\nGET /drive/v3/files/${id}?fields=id,size\r\n`
  )
  const body = parts.join('\r\n') + `\r\n--${boundary}--`

  let retries = 4
  while (retries > 0) {
    const res = await fetch('https://www.googleapis.com/batch/drive/v3', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': `multipart/mixed; boundary=${boundary}`,
      },
      body,
    })

    if (res.status === 429 || res.status === 503) {
      const wait = (5 - retries) * 5000
      process.stdout.write(` [rate limit, wait ${wait/1000}s]`)
      await new Promise(r => setTimeout(r, wait))
      retries--
      await ensureToken()
      continue
    }

    const text = await res.text()
    // Parse multipart response
    const sizes = {}
    const jsonBlocks = text.match(/\{[^{}]*"id"\s*:[^{}]+\}/g) ?? []
    for (const block of jsonBlocks) {
      try {
        const obj = JSON.parse(block)
        if (obj.id) sizes[obj.id] = obj.size ?? null
      } catch {}
    }
    // Mark any IDs not found in response
    for (const id of ids) {
      if (!(id in sizes)) sizes[id] = null
    }
    return sizes
  }
  // On total failure, mark all null
  return Object.fromEntries(ids.map(id => [id, null]))
}

// Load photo index and find duplicate candidate groups (same name + same date)
const photos = JSON.parse(readFileSync(join(ROOT, 'lib', 'photo-index.json'), 'utf8'))
console.log(`Index loaded: ${photos.length.toLocaleString()} photos`)

const byNameDate = new Map()
for (const p of photos) {
  const key = `${p.name}|||${p.date.slice(0, 10)}`
  if (!byNameDate.has(key)) byNameDate.set(key, [])
  byNameDate.get(key).push(p)
}
const dupGroups = [...byNameDate.values()].filter(v => v.length > 1)
const allDupIds = [...new Set(dupGroups.flatMap(g => g.map(p => p.id)))]
console.log(`Duplicate groups (name+date): ${dupGroups.length.toLocaleString()}`)
console.log(`Unique IDs to size-check: ${allDupIds.length.toLocaleString()}\n`)

// Load size cache if exists (so we can resume)
const cachePath = join(ROOT, 'lib', 'size-cache.json')
const sizeCache = existsSync(cachePath)
  ? JSON.parse(readFileSync(cachePath, 'utf8'))
  : {}
console.log(`Size cache: ${Object.keys(sizeCache).length.toLocaleString()} entries`)

const needed = allDupIds.filter(id => !(id in sizeCache))
console.log(`Still need to fetch: ${needed.length.toLocaleString()} sizes\n`)

// Fetch in batches of 100 (Drive batch API limit)
const BATCH = 100
let fetched = 0

for (let i = 0; i < needed.length; i += BATCH) {
  const batch = needed.slice(i, i + BATCH)
  const sizes = await fetchSizesBatch(batch)
  Object.assign(sizeCache, sizes)
  fetched += batch.length

  process.stdout.write(`\r  ${fetched.toLocaleString()} / ${needed.length.toLocaleString()} sizes fetched...`)

  // Checkpoint every 5k
  if (fetched % 5000 < BATCH) {
    writeFileSync(cachePath, JSON.stringify(sizeCache))
    process.stdout.write(` [checkpoint]`)
  }

  // 120ms between batches (~8 req/s, safe under quota)
  if (i + BATCH < needed.length) await new Promise(r => setTimeout(r, 120))
}

writeFileSync(cachePath, JSON.stringify(sizeCache))
console.log(`\n\nSize cache complete: ${Object.keys(sizeCache).length.toLocaleString()} entries\n`)

// Filter: same name + same date + same size = true duplicate
let csvRows = ['name,date,size,keep_id,delete_id']
let trueGroups = 0
let trueExtras = 0

for (const entries of dupGroups) {
  const withSize = entries.map(p => ({ ...p, size: sizeCache[p.id] ?? 'unknown' }))

  // Sub-group by size
  const bySize = new Map()
  for (const p of withSize) {
    if (!bySize.has(p.size)) bySize.set(p.size, [])
    bySize.get(p.size).push(p)
  }

  for (const [size, group] of bySize) {
    if (group.length < 2) continue
    trueGroups++
    const keep = group[0]
    for (const del of group.slice(1)) {
      trueExtras++
      const safeName = keep.name.replace(/,/g, ' ')
      csvRows.push(`${safeName},${keep.date.slice(0, 10)},${size},${keep.id},${del.id}`)
    }
  }
}

const outPath = join(ROOT, 'duplicates-verified.csv')
writeFileSync(outPath, csvRows.join('\n'))
console.log(`True duplicates (name + date + size match): ${trueGroups.toLocaleString()} groups`)
console.log(`Files to delete: ${trueExtras.toLocaleString()}`)
console.log(`Written to: duplicates-verified.csv`)
