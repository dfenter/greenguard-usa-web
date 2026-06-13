/**
 * Trash all screenshots except those from June 2026.
 * Updates photo-deleted.json in Drive and removes entries from photo-index.json.
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dir, '..')

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
  const data = await res.json()
  if (!data.access_token) { console.error('Token error:', data); process.exit(1) }
  return data.access_token
}

function isScreenshot(p) {
  if (p.mimeType === 'image/png') return true
  const l = p.name.toLowerCase()
  return l.includes('screenshot') || l.includes('screen shot') || l.includes('screen_shot')
}

const indexPath = join(ROOT, 'lib', 'photo-index.json')
const index = JSON.parse(readFileSync(indexPath, 'utf8'))

const toDelete = index.filter(p => isScreenshot(p) && !p.date.startsWith('2026-06'))
const keep = index.filter(p => !isScreenshot(p) || p.date.startsWith('2026-06'))

console.log(`Screenshots to trash: ${toDelete.length}`)
console.log(`Index entries to keep: ${keep.length}`)

const token = await getToken()
console.log('Token OK\n')

// Find or create photo-deleted.json in Drive
async function findDeletedFile(tok) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name%3D'photo-deleted.json'+and+trashed%3Dfalse&fields=files(id)`,
    { headers: { Authorization: `Bearer ${tok}` } }
  )
  const data = await res.json()
  if (data.files?.[0]?.id) return data.files[0].id
  // Create it
  const create = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'photo-deleted.json', mimeType: 'application/json' }),
  })
  return (await create.json()).id
}

// Load existing deleted IDs
const deletedFileId = await findDeletedFile(token)
const existingRes = await fetch(
  `https://www.googleapis.com/drive/v3/files/${deletedFileId}?alt=media`,
  { headers: { Authorization: `Bearer ${token}` } }
)
const existingText = await existingRes.text()
const existingDeleted = new Set(existingText ? JSON.parse(existingText) : [])
console.log(`Existing deleted IDs: ${existingDeleted.size}`)

// Trash photos in Drive (5 concurrent)
let trashed = 0
let failed = 0
const newlyDeleted = []

async function trashOne(id, tok) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  })
  return res.ok
}

const CONCURRENCY = 5
for (let i = 0; i < toDelete.length; i += CONCURRENCY) {
  const batch = toDelete.slice(i, i + CONCURRENCY)
  const results = await Promise.all(batch.map(p => trashOne(p.id, token)))
  for (let j = 0; j < batch.length; j++) {
    if (results[j]) {
      trashed++
      newlyDeleted.push(batch[j].id)
    } else {
      failed++
      console.warn(`  Failed to trash: ${batch[j].name}`)
    }
  }
  process.stdout.write(`\r  Trashed ${trashed}/${toDelete.length} (${failed} failed)...`)
}
console.log('\n')

// Update photo-deleted.json
const allDeleted = new Set([...existingDeleted, ...newlyDeleted])
const writeRes = await fetch(
  `https://www.googleapis.com/upload/drive/v3/files/${deletedFileId}?uploadType=media`,
  {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([...allDeleted]),
  }
)
if (!writeRes.ok) {
  console.error('Failed to update deleted list:', await writeRes.text())
  process.exit(1)
}
console.log(`photo-deleted.json updated: ${allDeleted.size} total deleted IDs`)

// Update photo-index.json
writeFileSync(indexPath, JSON.stringify(keep))
console.log(`photo-index.json updated: ${keep.length} entries remain`)
console.log(`\nDone! Trashed ${trashed}, failed ${failed}`)
