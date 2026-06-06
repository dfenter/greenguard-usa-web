/**
 * Purge known junk files from Drive (iTunes/WMP album art, etc.)
 * Searches by exact filename, trashes in batches of 100.
 *
 * Run from photos/ directory:
 *   node scripts/purge-junk.mjs
 *   node scripts/purge-junk.mjs --dry-run   (count only, no deletions)
 *   node scripts/purge-junk.mjs --empty-trash (empty Drive trash after)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dir, '..')

const DRY_RUN = process.argv.includes('--dry-run')
const EMPTY_TRASH = process.argv.includes('--empty-trash')

const JUNK_NAMES = [
  'AlbumArtSmall.jpg',
  'AlbumArt.jpg',
  'Folder.jpg',
  'folder.jpg',
  'photo.jpg',
  'photo 2.jpg',
  'photo 3.jpg',
  'photo 4.jpg',
  'photo 5.jpg',
]

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

async function ensureToken() {
  if (Date.now() > tokenExpiry) {
    accessToken = await getToken()
    tokenExpiry = Date.now() + 55 * 60 * 1000
    process.stdout.write(' [token refreshed]')
  }
}

async function searchByName(name) {
  const ids = []
  let pageToken
  do {
    await ensureToken()
    const params = new URLSearchParams({
      q: `name = '${name.replace(/'/g, "\\'")}' and trashed = false`,
      pageSize: '1000',
      fields: 'nextPageToken,files(id)',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: 'Bearer ' + accessToken },
    })
    const data = await res.json()
    if (data.error) { console.error('Search error:', data.error); break }
    for (const f of data.files ?? []) ids.push(f.id)
    pageToken = data.nextPageToken
  } while (pageToken)
  return ids
}

async function trashBatch(ids) {
  await ensureToken()
  const boundary = 'junk_trash_boundary'
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
    const successes = (text.match(/HTTP\/1\.1 200/g) ?? []).length
    return { successes, failures: ids.length - successes }
  }
  return { successes: 0, failures: ids.length }
}

async function emptyTrash() {
  await ensureToken()
  console.log('\nEmptying Drive trash...')
  const res = await fetch('https://www.googleapis.com/drive/v3/files/trash', {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + accessToken },
  })
  if (res.status === 204) {
    console.log('Trash emptied.')
  } else {
    console.error('Failed to empty trash:', res.status, await res.text())
  }
}

console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Scanning Drive for junk files...\n`)

let grandTotal = 0
let grandTrashed = 0
let grandFailed = 0

for (const name of JUNK_NAMES) {
  process.stdout.write(`  Searching: "${name}"... `)
  const ids = await searchByName(name)
  grandTotal += ids.length
  console.log(`${ids.length.toLocaleString()} found`)

  if (ids.length === 0 || DRY_RUN) continue

  const BATCH = 100
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH)
    const { successes, failures } = await trashBatch(batch)
    grandTrashed += successes
    grandFailed += failures
    process.stdout.write(`\r    Trashed ${Math.min(i + BATCH, ids.length)} / ${ids.length}...`)
    if (i + BATCH < ids.length) await new Promise(r => setTimeout(r, 150))
  }
  console.log()
}

console.log(`\n${'─'.repeat(40)}`)
if (DRY_RUN) {
  console.log(`Dry run complete. Would trash: ${grandTotal.toLocaleString()} files`)
} else {
  console.log(`Junk purge complete.`)
  console.log(`  Found:   ${grandTotal.toLocaleString()}`)
  console.log(`  Trashed: ${grandTrashed.toLocaleString()}`)
  console.log(`  Failed:  ${grandFailed.toLocaleString()}`)
}

if (EMPTY_TRASH && !DRY_RUN) {
  await emptyTrash()
}

console.log('\nNext: node scripts/build-photo-index.mjs')
