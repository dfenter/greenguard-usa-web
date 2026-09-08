#!/usr/bin/env node
// Builds app/content/gtm/<product>/{pages,checklist,targets}.json from each
// product's GTM bundle and copies bundle PDFs + CSV into
// app/public/gtm/<product>/. Safe no-op per product when its bundle
// directory isn't present (e.g. source repo not checked out on Vercel).
//
// COMPAT: also writes the legacy sparkbridge-only outputs at
// content/gtm/{pages,checklist,targets}.json and public/gtm/ exactly as
// before, so existing readers keep working untouched.

const fs = require('fs')
const path = require('path')
const MarkdownIt = require('markdown-it')
const { PRODUCTS } = require('../lib/gtm-products')

const APP_DIR = path.join(__dirname, '..')
const CONTENT_ROOT = path.join(APP_DIR, 'content', 'gtm')
const PUBLIC_ROOT = path.join(APP_DIR, 'public', 'gtm')

const md = new MarkdownIt('default', { html: false, linkify: true, typographer: false })

function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function walk(dir, exts, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, exts, out)
    else if (exts.some((e) => entry.name.toLowerCase().endsWith(e))) out.push(full)
  }
  return out
}

function safeName(relPath) {
  return relPath.split(path.sep).join('__')
}

function injectHeadingIds(html, headings) {
  // headings: [{id, text, level}] in document order for h2/h3
  let i2 = 0
  return html.replace(/<h([23])>(.*?)<\/h\1>/g, (match, level, inner) => {
    const h = headings[i2]
    i2 += 1
    if (!h) return match
    return `<h${level} id="${h.id}">${inner}</h${level}>`
  })
}

// Build one product's content into contentDir/publicDir. Returns nothing;
// writes pages.json, checklist.json, targets.json into contentDir and
// copies PDF/CSV assets into publicDir.
function buildOne(bundleDir, contentDir, publicDir) {
  fs.mkdirSync(contentDir, { recursive: true })
  fs.mkdirSync(publicDir, { recursive: true })

  // ── Copy PDFs + CSV ─────────────────────────────────────────────────
  const assetFiles = walk(bundleDir, ['.pdf', '.csv'])
  for (const f of assetFiles) {
    const rel = path.relative(bundleDir, f)
    const flat = safeName(rel)
    fs.copyFileSync(f, path.join(publicDir, flat))
  }
  console.log(`copied ${assetFiles.length} PDF/CSV assets into ${publicDir}`)

  // ── Render markdown pages ───────────────────────────────────────────
  const mdFiles = walk(bundleDir, ['.md'])
  const pages = {}

  for (const f of mdFiles) {
    const rel = path.relative(bundleDir, f)
    const relNoExt = rel.replace(/\.md$/i, '')
    const raw = fs.readFileSync(f, 'utf8')
    const html = md.render(raw)

    const h1Match = raw.match(/^#\s+(.+)$/m)
    const title = h1Match ? h1Match[1].trim() : path.basename(relNoExt)

    const headings = []
    const seen = {}
    const lines = raw.split('\n')
    for (const line of lines) {
      const m = line.match(/^(##|###)\s+(.+)$/)
      if (!m) continue
      const level = m[1].length
      const text = m[2].trim()
      let id = slugify(text)
      if (seen[id]) { seen[id] += 1; id = `${id}-${seen[id]}` } else { seen[id] = 1 }
      headings.push({ id, text, level })
    }

    const htmlWithIds = injectHeadingIds(html, headings)
    pages[relNoExt] = { path: relNoExt, title, html: htmlWithIds, headings }
  }
  console.log(`rendered ${mdFiles.length} markdown pages`)
  fs.writeFileSync(path.join(contentDir, 'pages.json'), JSON.stringify({ pages }, null, 2))

  // ── Checklist from the 90-day plan ─────────────────────────────────
  const planFile = mdFiles.find((f) => /01-plan/.test(f) && f.toLowerCase().endsWith('.md'))
  const checklistItems = []

  if (planFile) {
    const raw = fs.readFileSync(planFile, 'utf8')
    const lines = raw.split('\n')

    const sectionStarts = []
    lines.forEach((line, idx) => {
      const m = line.match(/^##\s+(\d+)\.\s+(.+)$/)
      if (m) sectionStarts.push({ num: Number(m[1]), title: m[2].trim(), line: idx })
    })
    sectionStarts.push({ num: null, title: null, line: lines.length })

    function sectionBody(num) {
      const i = sectionStarts.findIndex((s) => s.num === num)
      if (i === -1) return null
      const start = sectionStarts[i].line
      const end = sectionStarts[i + 1].line
      return { title: sectionStarts[i].title, text: lines.slice(start, end).join('\n') }
    }

    const s27 = sectionBody(27)
    if (s27) {
      const rows = s27.text.split('\n').filter((l) => l.trim().startsWith('|') && !/^\|---/.test(l.trim()))
      for (const row of rows) {
        const cells = row.split('|').map((c) => c.trim()).filter((c) => c.length)
        if (cells.length < 3) continue
        if (/^days$/i.test(cells[0])) continue
        const dayMatch = cells[0].match(/(\d+)\s*to\s*(\d+)/i)
        const id = slugify(`section-27-${cells[0]}-${cells[1]}`)
        checklistItems.push({
          id,
          section: 27,
          label: `${cells[1]}: ${cells[2]}`,
          dayStart: dayMatch ? Number(dayMatch[1]) : null,
          dayEnd: dayMatch ? Number(dayMatch[2]) : null,
        })
      }
    }

    const s5 = sectionBody(5)
    if (s5) {
      const subMatches = [...s5.text.matchAll(/^###\s+(.+)$/gm)]
      for (const m of subMatches) {
        const label = m[1].trim()
        const dayMatch = label.match(/Days?\s+(\d+)(?:\s*to\s*(\d+))?/i)
        checklistItems.push({
          id: slugify(`section-5-${label}`),
          section: 5,
          label,
          dayStart: dayMatch ? Number(dayMatch[1]) : null,
          dayEnd: dayMatch ? Number(dayMatch[2] || dayMatch[1]) : null,
        })
      }
    }

    for (const num of [7, 9, 10, 15, 16, 19]) {
      const s = sectionBody(num)
      if (!s) continue
      const dayMatch = s.title.match(/Days?\s+(\d+)(?:\s*to\s*(\d+))?/i)
      checklistItems.push({
        id: slugify(`section-${num}-${s.title}`),
        section: num,
        label: s.title,
        dayStart: dayMatch ? Number(dayMatch[1]) : null,
        dayEnd: dayMatch ? Number(dayMatch[2] || dayMatch[1]) : null,
      })
    }
  }

  console.log(`parsed ${checklistItems.length} checklist items`)
  fs.writeFileSync(path.join(contentDir, 'checklist.json'), JSON.stringify({ items: checklistItems }, null, 2))

  // ── Targets CSV (hand-rolled RFC4180 parser) ───────────────────────
  function parseCSV(text) {
    const rows = []
    let row = []
    let field = ''
    let inQuotes = false
    let i = 0
    const n = text.length
    while (i < n) {
      const c = text[i]
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue }
          inQuotes = false; i += 1; continue
        }
        field += c; i += 1; continue
      } else {
        if (c === '"') { inQuotes = true; i += 1; continue }
        if (c === ',') { row.push(field); field = ''; i += 1; continue }
        if (c === '\r') { i += 1; continue }
        if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 1; continue }
        field += c; i += 1; continue
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row) }
    return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''))
  }

  const targetsFile = walk(bundleDir, ['.csv']).find((f) => /06-targets/.test(f))
  let targets = { columns: [], rows: [] }
  if (targetsFile) {
    const raw = fs.readFileSync(targetsFile, 'utf8')
    const parsed = parseCSV(raw)
    const columns = parsed[0] || []
    const rows = parsed.slice(1).map((r) => {
      const obj = {}
      columns.forEach((col, idx) => { obj[col] = r[idx] ?? '' })
      return obj
    })
    targets = { columns, rows }
  }
  console.log(`parsed ${targets.rows.length} target rows`)
  fs.writeFileSync(path.join(contentDir, 'targets.json'), JSON.stringify(targets, null, 2))
}

for (const product of Object.values(PRODUCTS)) {
  const bundleDir = product.key === 'sparkbridge' ? (process.env.GTM_BUNDLE_DIR || product.bundleDir) : product.bundleDir

  if (!fs.existsSync(bundleDir)) {
    console.log(`GTM bundle dir not found for product "${product.key}" at ${bundleDir} — skipping (safe no-op).`)
    continue
  }

  const contentDir = path.join(CONTENT_ROOT, product.key)
  const publicDir = path.join(PUBLIC_ROOT, product.key)
  console.log(`building GTM content for product "${product.key}" from ${bundleDir}`)
  buildOne(bundleDir, contentDir, publicDir)

  // COMPAT: sparkbridge also writes the legacy flat locations.
  if (product.key === 'sparkbridge') {
    buildOne(bundleDir, CONTENT_ROOT, PUBLIC_ROOT)
  }
}

console.log('gtm content build complete')
