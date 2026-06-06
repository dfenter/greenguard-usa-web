/**
 * Trash verified duplicate Drive files from duplicates-verified.csv
 * Uses Drive batch API (100 per request), resumes via delete-progress.json
 *
 * Run from photos/ directory:
 *   node scripts/delete-duplicates.mjs
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

// Batch-trash up to 100 IDs in one HTTP call using Drive batch API
async function trashBatch(ids) {
  await ensureToken()
  const boundary = 'trash_batch_boundary'
  const parts = ids.map(id =>
    `--${boundary}\r\nContent-Type: application/http\r\n\r\nPATCH /drive/v3/files/${id}?fields=id\r\nContent-Type: application/json\r\n\r\n{"trashed":true}\r\n`
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
      const wait = (5 - retries) * 8000
      process.stdout.write(` [rate limit, wait ${wait / 1000}s]`)
      await new Promise(r => setTimeout(r, wait))
      retries--
      await ensureToken()
      continue
    }

    const text = await res.text()
    // Count successes (HTTP 200) and failures
    const successes = (text.match(/HTTP\/1\.1 200/g) ?? []).length
    const failures = ids.length - successes
    return { successes, failures }
  }
  return { successes: 0, failures: ids.length }
}

// Load CSV — collect all delete_ids
const csvText = readFileSync(join(ROOT, 'duplicates-verified.csv'), 'utf8')
const lines = csvText.trim().split('\n').slice(1) // skip header
const allDeleteIds = lines.map(l => l.split(',')[4]).filter(Boolean)
console.log(`Total files to trash: ${allDeleteIds.length.toLocaleString()}`)

// Load progress
const progressPath = join(ROOT, 'lib', 'delete-progress.json')
const progress = existsSync(progressPath)
  ? JSON.parse(readFileSync(progressPath, 'utf8'))
  : { done: [], failed: [] }

const doneSet = new Set(progress.done)
const remaining = allDeleteIds.filter(id => !doneSet.has(id))
console.log(`Already trashed: ${doneSet.size.toLocaleString()}`)
console.log(`Remaining: ${remaining.length.toLocaleString()}\n`)

if (remaining.length === 0) {
  console.log('All done!')
  process.exit(0)
}

const BATCH = 100
let totalDone = 0
let totalFailed = 0
const startTime = Date.now()

for (let i = 0; i < remaining.length; i += BATCH) {
  const batch = remaining.slice(i, i + BATCH)
  const { successes, failures } = await trashBatch(batch)

  // Record successful deletes
  for (let j = 0; j < successes; j++) progress.done.push(batch[j])
  for (let j = successes; j < batch.length; j++) progress.failed.push(batch[j])

  totalDone += successes
  totalFailed += failures

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
  const pct = (((doneSet.size + totalDone) / allDeleteIds.length) * 100).toFixed(1)
  process.stdout.write(`\r  ${(doneSet.size + totalDone).toLocaleString()} / ${allDeleteIds.length.toLocaleString()} trashed (${pct}%) — ${elapsed}s elapsed, ${totalFailed} failed`)

  // Checkpoint every 1k
  if ((i + BATCH) % 1000 < BATCH) {
    writeFileSync(progressPath, JSON.stringify(progress))
  }

  if (i + BATCH < remaining.length) await new Promise(r => setTimeout(r, 150))
}

writeFileSync(progressPath, JSON.stringify(progress))

console.log(`\n\nDone!`)
console.log(`  Trashed: ${(doneSet.size + totalDone).toLocaleString()}`)
console.log(`  Failed:  ${totalFailed.toLocaleString()}`)
if (totalFailed > 0) console.log(`  Failed IDs saved to lib/delete-progress.json under "failed"`)
console.log(`\nRun build-photo-index.mjs next to rebuild the index without duplicates.`)
