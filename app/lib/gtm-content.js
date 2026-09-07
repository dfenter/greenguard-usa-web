// Loads and memoizes the GTM content JSON built by scripts/build-gtm-content.js.
const fs = require('fs')
const path = require('path')

let _pages = null
let _checklist = null
let _targets = null

function readJson(relPath) {
  const full = path.join(process.cwd(), 'content', 'gtm', relPath)
  if (!fs.existsSync(full)) return null
  return JSON.parse(fs.readFileSync(full, 'utf8'))
}

function getPages() {
  if (_pages === null) _pages = (readJson('pages.json') || { pages: {} }).pages
  return _pages
}

function getPage(pagePath) {
  const pages = getPages()
  return pages[pagePath] || null
}

function getChecklist() {
  if (_checklist === null) _checklist = (readJson('checklist.json') || { items: [] }).items
  return _checklist
}

function getTargets() {
  if (_targets === null) _targets = readJson('targets.json') || { columns: [], rows: [] }
  return _targets
}

function getPdfList() {
  const dir = path.join(process.cwd(), 'public', 'gtm')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf'))
}

module.exports = { getPages, getPage, getChecklist, getTargets, getPdfList }
