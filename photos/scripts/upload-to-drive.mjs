#!/usr/bin/env node
/**
 * upload-to-drive.mjs — Resume-safe bulk uploader to the family photo Drive folder.
 *
 * Usage:
 *   node upload-to-drive.mjs /path/to/photos
 *   node upload-to-drive.mjs /path/to/photos --dry-run
 *
 * Requirements: Node 18+ (native fetch). No npm install needed — copy and run.
 *
 * How it works:
 *   1. Fetches all filenames already in Drive to skip duplicates.
 *   2. Keeps a local upload-progress.json so interrupted runs resume where they left off.
 *   3. Skips .mov Live Photo stubs under 50 KB.
 *   4. Uses the Drive resumable-upload API — safe for large files and flaky connections.
 *   5. Retries 429/5xx with exponential back-off.
 */

import { readdir, stat, readFile, writeFile } from 'fs/promises'
import { join, extname, basename, dirname }    from 'path'
import { fileURLToPath }                       from 'url'
import { readFileSync }                        from 'fs'

// ── Credentials (from .env.local) ─────────────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dir, '..', '.env.local')
const env = {}
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const CLIENT_ID     = env.PHOTOS_GOOGLE_CLIENT_ID
const CLIENT_SECRET = env.PHOTOS_GOOGLE_CLIENT_SECRET
const REFRESH_TOKEN = env.PHOTOS_GOOGLE_REFRESH_TOKEN
const FOLDER_ID     = env.PHOTOS_DRIVE_FOLDER_ID || '1HoygRi4umZDQcIPArkDvmuqmq19pmt6C'

// ── Config ────────────────────────────────────────────────────────────────────
const PROGRESS_FILE  = 'upload-progress.json'
const CONCURRENT     = 5
const SKIP_MOV_UNDER = 50 * 1024   // skip .mov Live Photo stubs < 50 KB
const PHOTO_EXTS     = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.gif', '.webp', '.tiff', '.tif', '.bmp', '.mov', '.mp4', '.m4v'])
const MIME_MAP       = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.heic': 'image/heic', '.heif': 'image/heif', '.gif': 'image/gif',
  '.webp': 'image/webp', '.tiff': 'image/tiff', '.tif': 'image/tiff',
  '.bmp': 'image/bmp', '.mov': 'video/quicktime',
  '.mp4': 'video/mp4', '.m4v': 'video/x-m4v',
}

// ── Auth ──────────────────────────────────────────────────────────────────────
let _accessToken = ''
let _tokenExpiry = 0

async function getAccessToken() {
  if (_accessToken && Date.now() < _tokenExpiry - 60_000) return _accessToken
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN, grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`)
  const data = await res.json()
  _accessToken = data.access_token
  _tokenExpiry = Date.now() + (data.expires_in ?? 3600) * 1000
  return _accessToken
}

// ── Drive: fetch all filenames already uploaded ───────────────────────────────
async function fetchUploadedNames() {
  const names = new Set()
  let pageToken = ''
  process.stdout.write('Fetching existing Drive files')
  do {
    const token = await getAccessToken()
    const params = new URLSearchParams({
      q: `'${FOLDER_ID}' in parents and trashed = false`,
      fields: 'nextPageToken,files(name)',
      pageSize: '1000',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`Drive list failed: ${await res.text()}`)
    const data = await res.json()
    for (const f of data.files ?? []) names.add(f.name)
    pageToken = data.nextPageToken ?? ''
    process.stdout.write('.')
  } while (pageToken)
  console.log(` ${names.size} files already in Drive`)
  return names
}

// ── Drive: resumable upload ───────────────────────────────────────────────────
async function uploadFile(filePath, fileName, mimeType, fileSize, dryRun) {
  if (dryRun) { console.log(`  [dry] ${fileName}`); return }

  const token = await getAccessToken()

  // Step 1: initiate resumable session
  const initRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(fileSize),
      },
      body: JSON.stringify({ name: fileName, parents: [FOLDER_ID] }),
    }
  )
  if (!initRes.ok) throw new Error(`Init upload failed (${initRes.status}): ${await initRes.text()}`)
  const sessionUri = initRes.headers.get('location')
  if (!sessionUri) throw new Error('No session URI in response')

  // Step 2: upload the file body
  const fileData = await readFile(filePath)
  const uploadRes = await fetch(sessionUri, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType, 'Content-Length': String(fileSize) },
    body: fileData,
  })
  if (!uploadRes.ok) throw new Error(`Upload body failed (${uploadRes.status}): ${await uploadRes.text()}`)
}

// ── Retry with exponential back-off ──────────────────────────────────────────
async function withRetry(fn, label, maxAttempts = 4) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const msg = err.message ?? ''
      const isRetryable = msg.includes('429') || msg.includes('rate') || /5\d\d/.test(msg)
      if (isRetryable && attempt < maxAttempts) {
        const wait = Math.min(2 ** attempt * 1000, 30_000)
        console.log(`  ↻ ${label} — retry ${attempt}/${maxAttempts - 1} in ${wait / 1000}s`)
        await new Promise(r => setTimeout(r, wait))
      } else {
        throw err
      }
    }
  }
}

// ── Scan local directory recursively ─────────────────────────────────────────
async function scanDir(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      files.push(...await scanDir(full))
    } else if (PHOTO_EXTS.has(extname(e.name).toLowerCase())) {
      files.push(full)
    }
  }
  return files
}

// ── Progress file ─────────────────────────────────────────────────────────────
async function loadProgress() {
  try {
    const raw = await readFile(PROGRESS_FILE, 'utf8')
    return new Set(JSON.parse(raw))
  } catch { return new Set() }
}

async function saveProgress(done) {
  await writeFile(PROGRESS_FILE, JSON.stringify([...done], null, 2))
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args   = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const dir    = args.find(a => !a.startsWith('--'))

  if (!dir) {
    console.error('Usage: node upload-to-drive.mjs /path/to/photos [--dry-run]')
    process.exit(1)
  }

  console.log(`\nPhoto Drive Uploader${dryRun ? ' (DRY RUN)' : ''}`)
  console.log(`Source: ${dir}\n`)

  const [allFiles, alreadyInDrive, progressDone] = await Promise.all([
    scanDir(dir),
    fetchUploadedNames(),
    loadProgress(),
  ])

  const toUpload = []
  let skippedDupe = 0, skippedMov = 0

  for (const filePath of allFiles) {
    const name = basename(filePath)
    const ext  = extname(name).toLowerCase()
    const size = (await stat(filePath)).size

    if (ext === '.mov' && size < SKIP_MOV_UNDER) { skippedMov++;  continue }
    if (alreadyInDrive.has(name))                { skippedDupe++; continue }
    if (progressDone.has(filePath))              { skippedDupe++; continue }

    toUpload.push({ path: filePath, name, size, mime: MIME_MAP[ext] ?? 'application/octet-stream' })
  }

  console.log(`Found:         ${allFiles.length} total files`)
  console.log(`Already done:  ${skippedDupe} (Drive + progress file)`)
  console.log(`Skipped stubs: ${skippedMov} (.mov < 50 KB)`)
  console.log(`To upload:     ${toUpload.length}\n`)

  if (toUpload.length === 0) { console.log('Nothing to do.'); return }

  let sent = 0, failed = 0

  for (let i = 0; i < toUpload.length; i += CONCURRENT) {
    const batch = toUpload.slice(i, i + CONCURRENT)
    await Promise.all(batch.map(async ({ path, name, size, mime }) => {
      try {
        await withRetry(() => uploadFile(path, name, mime, size, dryRun), name)
        progressDone.add(path)
        sent++
        const pct = Math.round((sent + failed) / toUpload.length * 100)
        console.log(`  ✓ [${pct}%] ${name} (${(size / 1024 / 1024).toFixed(1)} MB)`)
      } catch (err) {
        failed++
        console.error(`  ✗ ${name}: ${err.message}`)
      }
    }))
    if (!dryRun) await saveProgress(progressDone)
  }

  console.log(`\nDone.  Sent: ${sent}  Failed: ${failed}`)
  if (failed > 0) console.log('Re-run the same command to retry failed files — progress is saved.')
}

main().catch(err => { console.error(err.message); process.exit(1) })
