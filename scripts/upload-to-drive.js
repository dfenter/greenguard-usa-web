#!/usr/bin/env node
// Uploads local photos to the Google Drive "Photos" folder.
// Usage: node scripts/upload-to-drive.js [folder-path]
// Default source: ~/Pictures/Lauren Iphone Import
// Resumes from upload-progress.json if interrupted.

const fs = require('fs')
const path = require('path')
const { google } = require('googleapis')
const { Readable } = require('stream')

// Load credentials from photos .env.local
const envPath = path.join(__dirname, '../photos/.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
}

const FOLDER_ID = '1HoygRi4umZDQcIPArkDvmuqmq19pmt6C'
const sourceArg = process.argv[2]
const PROGRESS_FILE = path.join(__dirname, `../upload-progress${sourceArg ? '-' + path.basename(sourceArg) : ''}.json`)
const BATCH_SIZE = 8
const SKIP_BELOW_BYTES = 50_000  // Live Photo .mov stubs are ~340 bytes

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.heic', '.heif', '.png', '.gif', '.webp', '.tiff', '.tif'])
const VIDEO_EXTS = new Set(['.mov', '.mp4', '.m4v', '.avi'])

function getDriveClient() {
  const { PHOTOS_GOOGLE_CLIENT_ID, PHOTOS_GOOGLE_CLIENT_SECRET, PHOTOS_GOOGLE_REFRESH_TOKEN } = process.env
  if (!PHOTOS_GOOGLE_CLIENT_ID || !PHOTOS_GOOGLE_CLIENT_SECRET || !PHOTOS_GOOGLE_REFRESH_TOKEN) {
    throw new Error('Missing PHOTOS_GOOGLE_CLIENT_ID / SECRET / REFRESH_TOKEN in photos/.env.local')
  }
  const auth = new google.auth.OAuth2(PHOTOS_GOOGLE_CLIENT_ID, PHOTOS_GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: PHOTOS_GOOGLE_REFRESH_TOKEN })
  return google.drive({ version: 'v3', auth })
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'))
  }
  return { uploaded: [], failed: [] }
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2))
}

function collectFiles(dir) {
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      files.push(...collectFiles(path.join(dir, entry.name)))
      continue
    }
    if (!entry.isFile()) continue
    const ext = path.extname(entry.name).toLowerCase()
    if (!IMAGE_EXTS.has(ext) && !VIDEO_EXTS.has(ext)) continue
    const fullPath = path.join(dir, entry.name)
    const stat = fs.statSync(fullPath)
    if (stat.size < SKIP_BELOW_BYTES) continue  // skip Live Photo stubs
    files.push({ name: entry.name, path: fullPath, size: stat.size })
  }
  return files
}

async function uploadFile(drive, file) {
  const ext = path.extname(file.name).toLowerCase()
  const mimeType = VIDEO_EXTS.has(ext) ? 'video/mp4' : 'image/jpeg'
  const res = await drive.files.create({
    requestBody: {
      name: file.name,
      parents: [FOLDER_ID],
    },
    media: {
      mimeType,
      body: fs.createReadStream(file.path),
    },
    fields: 'id,name',
  })
  return res.data.id
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function main() {
  const sourceDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(process.env.HOME, 'Pictures', 'Lauren Iphone Import')

  if (!fs.existsSync(sourceDir)) {
    console.error(`Source directory not found: ${sourceDir}`)
    process.exit(1)
  }

  console.log(`Source: ${sourceDir}`)
  console.log('Collecting files...')
  const allFiles = collectFiles(sourceDir)
  console.log(`Found ${allFiles.length} files to consider`)

  const progress = loadProgress()
  const uploadedSet = new Set(progress.uploaded)
  const todo = allFiles.filter(f => !uploadedSet.has(f.path))
  console.log(`Already uploaded: ${progress.uploaded.length} | Remaining: ${todo.length}`)

  if (todo.length === 0) {
    console.log('All files already uploaded.')
    return
  }

  const drive = getDriveClient()
  let done = 0
  let failed = 0

  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map(async (file) => {
      let attempts = 0
      while (attempts < 3) {
        try {
          await uploadFile(drive, file)
          progress.uploaded.push(file.path)
          done++
          break
        } catch (err) {
          attempts++
          if (err.code === 429 || (err.response?.status === 429)) {
            console.log(`  Rate limited, waiting 10s...`)
            await sleep(10_000)
          } else if (attempts >= 3) {
            console.error(`  FAILED: ${file.name} — ${err.message}`)
            progress.failed.push({ path: file.path, error: err.message })
            failed++
          } else {
            await sleep(1000 * attempts)
          }
        }
      }
    }))

    saveProgress(progress)
    const pct = (((i + batch.length) / todo.length) * 100).toFixed(1)
    process.stdout.write(`\r  Progress: ${done} uploaded, ${failed} failed (${pct}%)   `)

    // Throttle: ~80 req/min to stay under Drive API limits
    if (i + BATCH_SIZE < todo.length) await sleep(700)
  }

  console.log(`\n\nDone. Uploaded: ${done} | Failed: ${failed}`)
  if (failed > 0) {
    console.log(`Failed files saved to ${PROGRESS_FILE} under "failed" key.`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
