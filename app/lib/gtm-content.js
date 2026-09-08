// Loads and memoizes the GTM content JSON built by scripts/build-gtm-content.js.
// Memoized PER PRODUCT (the old single-slot cache mixed products together).
const fs = require('fs')
const path = require('path')
const { resolveProduct, DEFAULT_PRODUCT } = require('./gtm-products')

const _cache = {} // product -> { pages, checklist, targets }

function cacheFor(product) {
  if (!_cache[product]) _cache[product] = { pages: null, checklist: null, targets: null }
  return _cache[product]
}

function readJson(relPath) {
  const full = path.join(process.cwd(), 'content', 'gtm', relPath)
  if (!fs.existsSync(full)) return null
  return JSON.parse(fs.readFileSync(full, 'utf8'))
}

// sparkbridge reads content/gtm/sparkbridge/<file> and falls back to the
// legacy content/gtm/<file> when the per-product file is absent.
function readProductJson(product, file) {
  const perProduct = readJson(path.join(product, file))
  if (perProduct !== null) return perProduct
  if (product === DEFAULT_PRODUCT) return readJson(file)
  return null
}

function getPages(product) {
  const p = resolveProduct(product)
  const cache = cacheFor(p)
  if (cache.pages === null) {
    cache.pages = (readProductJson(p, 'pages.json') || { pages: {} }).pages
  }
  return cache.pages
}

function getPage(pagePath, product = DEFAULT_PRODUCT) {
  const pages = getPages(product)
  return pages[pagePath] || null
}

function getChecklist(product) {
  const p = resolveProduct(product)
  const cache = cacheFor(p)
  if (cache.checklist === null) {
    cache.checklist = (readProductJson(p, 'checklist.json') || { items: [] }).items
  }
  return cache.checklist
}

function getTargets(product) {
  const p = resolveProduct(product)
  const cache = cacheFor(p)
  if (cache.targets === null) {
    cache.targets = readProductJson(p, 'targets.json') || { columns: [], rows: [] }
  }
  return cache.targets
}

function getPdfList(product) {
  const p = resolveProduct(product)
  const perProductDir = path.join(process.cwd(), 'public', 'gtm', p)
  let dir = perProductDir
  if (!fs.existsSync(dir)) {
    if (p === DEFAULT_PRODUCT) dir = path.join(process.cwd(), 'public', 'gtm')
    if (!fs.existsSync(dir)) return []
  }
  return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf'))
}

module.exports = { getPages, getPage, getChecklist, getTargets, getPdfList }
