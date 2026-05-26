// CSV statement parser. Handles Amex / Chase / Capital One / generic export
// formats — sniffs the header row to map columns. Designed forgiving:
// dollar signs, parentheses for negatives, dates in MM/DD/YYYY or YYYY-MM-DD.

const HEADER_ALIASES = {
  date:        ['date', 'transaction date', 'posted date', 'post date'],
  description: ['description', 'merchant', 'payee', 'name', 'memo'],
  amount:      ['amount', 'debit', 'transaction amount'],
  credit:      ['credit', 'deposit'],
  debit:       ['debit', 'withdrawal'],
}

function detectColumns(header) {
  const norm = header.map((h) => h.toLowerCase().trim())
  const map = {}
  for (const [k, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = norm.findIndex((h) => aliases.includes(h))
    if (idx >= 0) map[k] = idx
  }
  return map
}

function parseAmount(raw) {
  if (raw == null || raw === '') return 0
  let s = String(raw).trim()
  // (123.45) → negative
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  s = s.replace(/[$,\s]/g, '')
  const n = parseFloat(s)
  if (!Number.isFinite(n)) return 0
  return neg ? -n : n
}

function parseDate(raw) {
  if (!raw) return null
  const s = String(raw).trim()
  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toISOString()
  // MM/DD/YYYY or M/D/YY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) {
    let year = +m[3]; if (year < 100) year += 2000
    return new Date(Date.UTC(year, +m[1] - 1, +m[2])).toISOString()
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function splitCsvLine(line) {
  // Tiny CSV reader — handles quoted commas. Sufficient for issuer exports.
  const out = []
  let cur = '', inQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else inQuote = false
      } else cur += c
    } else {
      if (c === ',') { out.push(cur); cur = '' }
      else if (c === '"') inQuote = true
      else cur += c
    }
  }
  out.push(cur)
  return out
}

/**
 * @param {string} text - raw CSV text
 * @returns {{ rows: Array<{occurred_at, amount_cents, description, source}>, errors: string[] }}
 */
function parseCsvStatement(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim())
  if (lines.length < 2) return { rows: [], errors: ['CSV had no data rows'] }

  // Some issuers prepend blank/title lines before the header. Find the first
  // line that looks like a header.
  let headerIdx = 0
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const row = splitCsvLine(lines[i]).map((c) => c.toLowerCase())
    if (row.some((c) => /date/.test(c)) && row.some((c) => /amount|debit|credit/.test(c))) {
      headerIdx = i; break
    }
  }
  const header = splitCsvLine(lines[headerIdx])
  const cols = detectColumns(header)
  if (cols.date == null) return { rows: [], errors: ['Could not find a Date column'] }

  const rows = []
  const errors = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i])
    if (cells.length < 2) continue
    const date = parseDate(cells[cols.date])
    if (!date) { errors.push(`Row ${i}: unparseable date "${cells[cols.date]}"`); continue }

    // Amount may be split into Credit/Debit columns instead of a signed Amount
    let dollars = 0
    if (cols.amount != null && cells[cols.amount] !== '') {
      dollars = parseAmount(cells[cols.amount])
    } else if (cols.credit != null || cols.debit != null) {
      dollars = parseAmount(cells[cols.credit] || 0) - parseAmount(cells[cols.debit] || 0)
    }
    if (!dollars) continue

    const description = (cells[cols.description] || '').trim() || '(no description)'

    rows.push({
      occurred_at: date,
      amount_cents: Math.round(dollars * 100),
      description,
      source: 'csv',
    })
  }
  return { rows, errors }
}

module.exports = { parseCsvStatement }
