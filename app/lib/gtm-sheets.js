// Google Sheets write-back for the GTM targets sheet.
// Best-effort only: sheet failures must never fail the request that
// triggered them. The DB (gtm_targets_state / gtm_scores) is authoritative.
const { getSheets } = require('./gsheets')
const { q } = require('./db')

const SHEET_ID = '1-Fm2-s7BJkM6HGokTDFOHnVUw4I0mbW-YqkYiuvywBI'
const CACHE_MS = 5 * 60 * 1000

let _headerCache = null   // { map: {name->colLetter}, at: ms }
let _firmRowCache = null  // { map: {firm->rowNumber}, at: ms }

function colLetter(n) {
  // 1 -> A, 26 -> Z, 27 -> AA, 28 -> AB
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

async function getHeaderMap() {
  if (_headerCache && Date.now() - _headerCache.at < CACHE_MS) return _headerCache.map
  const sheets = getSheets()
  if (!sheets) throw new Error('Sheets not configured')
  const res = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties.title' })
  const sheetName = res.data.sheets?.[0]?.properties?.title
  if (!sheetName) throw new Error('No sheets found')
  const hdr = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${sheetName}!1:1` })
  const headers = hdr.data.values?.[0] || []
  const map = {}
  headers.forEach((h, i) => { if (h) map[h] = colLetter(i + 1) })
  _headerCache = { map, at: Date.now(), sheetName }
  return map
}

async function getSheetName() {
  await getHeaderMap()
  return _headerCache.sheetName
}

async function getFirmRowMap() {
  if (_firmRowCache && Date.now() - _firmRowCache.at < CACHE_MS) return _firmRowCache.map
  const sheets = getSheets()
  if (!sheets) throw new Error('Sheets not configured')
  const sheetName = await getSheetName()
  const headerMap = await getHeaderMap()
  const firmCol = headerMap['firm']
  if (!firmCol) throw new Error('firm column not found in sheet header')
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${sheetName}!${firmCol}2:${firmCol}10000` })
  const values = res.data.values || []
  const map = {}
  values.forEach((row, i) => {
    const firm = row[0]
    if (firm) map[firm] = i + 2 // row 1 is header
  })
  _firmRowCache = { map, at: Date.now() }
  return map
}

// Write a set of {colName: value} cells for one firm's row, batching into
// as few calls as possible. Never rewrites the whole sheet, never touches
// other rows, never adds rows.
async function writeTargetCells(firm, fields) {
  try {
    const sheets = getSheets()
    if (!sheets) return { ok: false, reason: 'sheets not configured' }
    const sheetName = await getSheetName()
    const headerMap = await getHeaderMap()
    const rowMap = await getFirmRowMap()
    const row = rowMap[firm]
    if (!row) return { ok: false, reason: 'firm not in sheet' }

    const data = []
    for (const [colName, value] of Object.entries(fields)) {
      const col = headerMap[colName]
      if (!col) continue
      data.push({ range: `${sheetName}!${col}${row}`, values: [[value === null || value === undefined ? '' : value]] })
    }
    if (data.length === 0) return { ok: false, reason: 'no matching columns' }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data },
    })
    return { ok: true }
  } catch (e) {
    console.error('gtm-sheets writeTargetCells failed:', e.message)
    return { ok: false, reason: e.message }
  }
}

// Reads firm + approve + dan_notes from the sheet and upserts into
// gtm_targets_state. DB is the record on conflict, so this is an explicit
// user-triggered action, never automatic.
async function pullApprovals() {
  const sheets = getSheets()
  if (!sheets) return { ok: false, reason: 'sheets not configured' }
  const sheetName = await getSheetName()
  const headerMap = await getHeaderMap()
  const firmCol = headerMap['firm']
  const approveCol = headerMap['approve']
  const notesCol = headerMap['dan_notes']
  if (!firmCol || !approveCol || !notesCol) return { ok: false, reason: 'missing columns in sheet' }

  // One contiguous range, indexed by column offset, so a blank interior firm
  // cell cannot desynchronize the columns against each other. Separate ranges
  // would each drop their own trailing blanks and misalign the rows, which
  // would attach one firm's approval to another firm.
  const idx = (L) => { let n = 0; for (const c of L) n = n * 26 + (c.charCodeAt(0) - 64); return n }
  const nums = [idx(firmCol), idx(approveCol), idx(notesCol)]
  const lo = Math.min(...nums), hi = Math.max(...nums)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!${colLetter(lo)}2:${colLetter(hi)}10000`,
  })
  const rows = res.data.values || []
  const off = (L) => idx(L) - lo

  let updated = 0
  for (const row of rows) {
    const firm = row[off(firmCol)]
    if (!firm || !String(firm).trim()) continue
    const approveRaw = row[off(approveCol)]
    const approved = /^(y|yes|true|1)$/i.test(String(approveRaw || '').trim())
    const notes = row[off(notesCol)] || null
    await q(
      `INSERT INTO gtm_targets_state (firm, approved, dan_notes, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (firm) DO UPDATE SET approved = $2, dan_notes = $3, updated_at = now()`,
      [firm, approved, notes]
    )
    updated++
  }
  return { ok: true, updated }
}

module.exports = { SHEET_ID, colLetter, getHeaderMap, writeTargetCells, pullApprovals }
