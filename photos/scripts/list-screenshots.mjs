#!/usr/bin/env node
/**
 * list-screenshots.mjs — Scan photo-index.json and report all screenshots.
 *
 * A file is considered a screenshot if:
 *   - mimeType is image/png, OR
 *   - name contains "screenshot", "screen shot", or "screen_shot" (case-insensitive)
 *
 * Run from photos/ directory:
 *   node scripts/list-screenshots.mjs [--csv]
 */

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dir, '..')

const args = process.argv.slice(2)
const csvMode = args.includes('--csv')

const indexPath = join(ROOT, 'lib', 'photo-index.json')
let photos
try {
  photos = JSON.parse(readFileSync(indexPath, 'utf8'))
} catch {
  console.error('photo-index.json not found or empty. Run build-photo-index.mjs first.')
  process.exit(1)
}

function isScreenshot(p) {
  if (p.mimeType === 'image/png') return true
  const lower = (p.name ?? '').toLowerCase()
  return lower.includes('screenshot') || lower.includes('screen shot') || lower.includes('screen_shot')
}

const screenshots = photos.filter(isScreenshot)
screenshots.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

console.log(`Total photos in index: ${photos.length.toLocaleString()}`)
console.log(`Screenshots found:     ${screenshots.length.toLocaleString()}`)

// Year breakdown
const byYear = {}
for (const p of screenshots) {
  const y = new Date(p.date).getFullYear()
  byYear[y] = (byYear[y] ?? 0) + 1
}
console.log('\nBy year:')
Object.entries(byYear).sort((a, b) => Number(b[0]) - Number(a[0])).forEach(([y, c]) => {
  console.log(`  ${y}: ${c.toLocaleString()}`)
})

if (csvMode) {
  const rows = ['id,name,date,mimeType']
  for (const p of screenshots) {
    const safeName = (p.name ?? '').replace(/,/g, ' ')
    rows.push(`${p.id},${safeName},${p.date.slice(0, 10)},${p.mimeType ?? ''}`)
  }
  const outPath = join(ROOT, 'screenshots.csv')
  writeFileSync(outPath, rows.join('\n'))
  console.log(`\nWritten to screenshots.csv (${screenshots.length} rows)`)
} else {
  console.log('\nFirst 20:')
  screenshots.slice(0, 20).forEach(p => {
    console.log(`  ${p.date.slice(0, 10)}  ${p.name}`)
  })
  if (screenshots.length > 20) console.log(`  ... and ${screenshots.length - 20} more. Run with --csv for full list.`)
}
