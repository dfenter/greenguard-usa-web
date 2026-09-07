// Shared CSV helpers: proper quoting + CSV-injection prevention.
// A leading =, +, -, @, tab, or CR gets a single-quote prefix so
// spreadsheet apps never interpret the cell as a formula.
const INJECTION_LEADERS = ['=', '+', '-', '@', '\t', '\r']

function csvSafeField(value) {
  let s = value === null || value === undefined ? '' : String(value)
  if (INJECTION_LEADERS.some((c) => s.startsWith(c))) {
    s = "'" + s
  }
  if (/[",\n\r]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function toCsvRow(fields) {
  return fields.map(csvSafeField).join(',')
}

module.exports = { csvSafeField, toCsvRow }
