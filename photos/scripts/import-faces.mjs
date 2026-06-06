/**
 * Merge faces.json (Apple Photos export) into the Drive photo-tags.json.
 * Matches by filename across the photo index.
 *
 * Run from photos/ directory:
 *   node scripts/import-faces.mjs
 */

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

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
  const t = await res.json()
  if (!t.access_token) { console.error('Token error:', t); process.exit(1) }
  return t.access_token
}

const faces = JSON.parse(readFileSync(join(ROOT, 'lib', 'faces.json'), 'utf8'))
const index = JSON.parse(readFileSync(join(ROOT, 'lib', 'photo-index.json'), 'utf8'))

console.log(`Faces: ${Object.keys(faces).length} tagged photos`)
console.log(`Index: ${index.length} photos\n`)

// Build filename → [id] map (filenames may not be unique, so map to array)
const nameToIds = new Map()
for (const entry of index) {
  if (!nameToIds.has(entry.name)) nameToIds.set(entry.name, [])
  nameToIds.get(entry.name).push(entry.id)
}

// Build tags map: driveId → people[]
const tags = {}
let matched = 0, unmatched = 0

for (const [filename, people] of Object.entries(faces)) {
  const ids = nameToIds.get(filename)
  if (!ids) { unmatched++; continue }
  for (const id of ids) {
    if (!tags[id]) tags[id] = []
    for (const person of people) {
      if (!tags[id].includes(person)) tags[id].push(person)
    }
  }
  matched++
}

console.log(`Matched: ${matched}, Unmatched: ${unmatched}`)
const totalTagged = Object.keys(tags).length
console.log(`Drive files tagged: ${totalTagged}\n`)

// People summary
const counts = {}
for (const people of Object.values(tags)) {
  for (const p of people) counts[p] = (counts[p] ?? 0) + 1
}
console.log('People:')
Object.entries(counts).sort((a,b) => b[1]-a[1]).forEach(([n,c]) => console.log(`  ${n}: ${c}`))

// Find or create photo-tags.json in Drive
const token = await getToken()
const search = await fetch(
  `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("name='photo-tags.json' and trashed=false")}&fields=files(id)`,
  { headers: { Authorization: `Bearer ${token}` } }
)
const { files } = await search.json()
let fileId = files?.[0]?.id

if (!fileId) {
  console.log('\nCreating photo-tags.json in Drive...')
  const meta = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'photo-tags.json', mimeType: 'application/json' }),
  })
  fileId = (await meta.json()).id
}

console.log('\nUploading tags to Drive...')
const upload = await fetch(
  `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
  {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(tags),
  }
)
if (!upload.ok) {
  console.error('Upload failed:', await upload.text()); process.exit(1)
}

console.log(`Done. ${totalTagged} photos tagged in Drive.`)
