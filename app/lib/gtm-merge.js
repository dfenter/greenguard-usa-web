// Merge-field substitution for outreach templates. Plain text only (goes
// into a textarea / clipboard) — never escape into HTML. Unresolved
// {{...}} placeholders are never silently dropped: callers should render
// them highlighted using the `unresolved` list this returns.
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_ ]+?)\s*\}\}/g

function mergeTemplate(template, fields) {
  const unresolved = []
  const text = String(template || '').replace(PLACEHOLDER_RE, (match, rawKey) => {
    const key = rawKey.trim()
    const normalized = key.toLowerCase().replace(/\s+/g, '_')
    const value = fields[key] ?? fields[normalized]
    if (value === undefined || value === null) {
      unresolved.push(key)
      return match
    }
    return String(value)
  })
  return { text, unresolved }
}

module.exports = { mergeTemplate }
