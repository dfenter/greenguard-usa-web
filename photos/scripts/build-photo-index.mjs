/**
 * Build photo-index.json — scans all Drive photos, extracts real EXIF dates,
 * sorts chronologically, writes to lib/photo-index.json.
 *
 * Run from photos/ directory:
 *   node scripts/build-photo-index.mjs
 *
 * Re-run whenever new photos are uploaded to Drive.
 */

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT  = join(__dir, '..')

// Parse .env.local
const env = {}
for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}

// Get access token
const tokRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id:     env.PHOTOS_GOOGLE_CLIENT_ID,
    client_secret: env.PHOTOS_GOOGLE_CLIENT_SECRET,
    refresh_token: env.PHOTOS_GOOGLE_REFRESH_TOKEN,
    grant_type:    'refresh_token',
  }),
})
const tok = await tokRes.json()
if (!tok.access_token) { console.error('Token error:', tok); process.exit(1) }
console.log('Token OK. Scanning Drive...\n')

const H = { Authorization: 'Bearer ' + tok.access_token }
const outPath = join(ROOT, 'lib', 'photo-index.json')
const photos = []
const seen = new Set()
let pageToken = undefined
let emptyPages = 0
let totalPages = 0

do {
  const params = new URLSearchParams({
    q:         '(mimeType contains "image/" or mimeType contains "video/") and trashed = false',
    pageSize:  '1000',
    fields:    'nextPageToken,files(id,name,mimeType,size,createdTime,thumbnailLink,imageMediaMetadata(time))',
  })
  if (pageToken) params.set('pageToken', pageToken)

  const data = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, { headers: H })
    .then(r => r.json())

  if (data.error) { console.error('Drive error:', data.error); process.exit(1) }

  const files = data.files ?? []
  let newInPage = 0
  for (const f of files) {
    if (seen.has(f.id)) continue
    seen.add(f.id)
    newInPage++
    let date = f.createdTime  // fallback: upload date
    const exif = f.imageMediaMetadata?.time
    if (exif) {
      const p = exif.split(/[: ]/)
      if (p.length >= 3 && p[0] && p[0] !== '0000') {
        try {
          const d = new Date(`${p[0]}-${p[1]}-${p[2]}T${p[3] ?? '00'}:${p[4] ?? '00'}:${p[5] ?? '00'}.000Z`)
          if (!isNaN(d.getTime()) && d.getFullYear() > 1990) date = d.toISOString()
        } catch {}
      }
    }
    const thumb = f.thumbnailLink ? f.thumbnailLink.replace(/=s\d+$/, '=s400') : undefined
    const mimeType = f.mimeType ?? undefined
    const size = f.size ? parseInt(f.size, 10) : undefined
    photos.push({ id: f.id, name: f.name, date, thumb, mimeType, size })
  }

  pageToken = data.nextPageToken
  totalPages++
  process.stdout.write(`\r  ${photos.length.toLocaleString()} photos (page ${totalPages}, +${newInPage} new)...`)

  // Save checkpoint every 10k photos
  if (photos.length % 10000 === 0 && photos.length > 0) {
    writeFileSync(outPath, JSON.stringify(photos))
    process.stdout.write(` [checkpoint saved]`)
  }

  // Only stop when Drive says there are no more pages (nextPageToken is null/undefined)

} while (pageToken)

// Sort newest first
photos.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

writeFileSync(outPath, JSON.stringify(photos))
console.log(`\n\nDone! ${photos.length.toLocaleString()} photos indexed → lib/photo-index.json`)
console.log(`File size: ${(JSON.stringify(photos).length / 1024 / 1024).toFixed(1)} MB`)

// Print year distribution
const byYear = {}
for (const p of photos) {
  const y = new Date(p.date).getFullYear()
  byYear[y] = (byYear[y] ?? 0) + 1
}
console.log('\nYear distribution:')
Object.entries(byYear).sort((a,b) => Number(b[0])-Number(a[0])).forEach(([y,c]) => console.log(`  ${y}: ${c.toLocaleString()}`))
