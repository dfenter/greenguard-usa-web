#!/usr/bin/env node
// Stdio MCP server for the internal GTM (MBA program) portal chat
// (chat-daemon.js /chat/gtm). Read-only by construction: docs come from two
// fixed snapshot dirs (~/.gtm-chat-docs, ~/.sparkbridge-chat-docs), targets
// come from a CSV in the gtm snapshot, and HubSpot/DB reads are scoped to the
// sparkbridge-fap-2026-09 outreach campaign only. No writes, no Bash, no
// portal credentials beyond HUBSPOT_ACCESS_TOKEN / DATABASE_URL from app/.env.

const fs = require('fs')
const path = require('path')
const os = require('os')

// launchd/claude spawn with a clean env — load repo env the same way the
// other chat MCP servers do (no dotenv dependency).
function loadEnvFile(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (!m) continue
      let v = m[2]
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (process.env[m[1]] === undefined) process.env[m[1]] = v
    }
  } catch {}
}
const APP_DIR = path.resolve(__dirname, '..')
loadEnvFile(path.join(APP_DIR, '.env'))
loadEnvFile(path.join(APP_DIR, '.env.local'))

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { z } = require('zod')

const OUTREACH_CAMPAIGN = 'sparkbridge-fap-2026-09'

const DIRS = {
  gtm: path.join(os.homedir(), '.gtm-chat-docs'),
  sparkbridge: path.join(os.homedir(), '.sparkbridge-chat-docs'),
}
const MAX_RESULT_CHARS = 12_000

// The whitelist is the directory listing itself, re-read per call so a
// snapshot refresh needs no daemon restart. Only plain .md files by simple
// name (the CSV is handled separately by list_targets/get_target).
function docNames(dir) {
  try {
    return fs.readdirSync(DIRS[dir]).filter((f) => /^[A-Za-z0-9._-]+\.md$/.test(f)).sort()
  } catch {
    return []
  }
}

function docPath(dir, name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9._-]+\.md$/.test(name)) return null
  if (!docNames(dir).includes(name)) return null
  return path.join(DIRS[dir], name)
}

// Resolve a doc name across both dirs. Explicit dir wins; otherwise prefer
// gtm and say so if it exists in both.
function resolveDoc(name, dir) {
  if (dir === 'gtm' || dir === 'sparkbridge') {
    const p = docPath(dir, name)
    return p ? { dir, path: p } : null
  }
  const inGtm = docPath('gtm', name)
  const inSb = docPath('sparkbridge', name)
  if (inGtm && inSb) return { dir: 'gtm', path: inGtm, ambiguous: true }
  if (inGtm) return { dir: 'gtm', path: inGtm }
  if (inSb) return { dir: 'sparkbridge', path: inSb }
  return null
}

const server = new McpServer({ name: 'gtm', version: '1.0.0' })

function tool(name, description, shape, run) {
  server.registerTool(name, { description, inputSchema: shape }, async (input) => {
    let out
    try {
      out = await run(input || {})
    } catch (e) {
      out = { error: String(e.message || e).slice(0, 300) }
    }
    return { content: [{ type: 'text', text: JSON.stringify(out) }] }
  })
}

// ── Docs (gtm + sparkbridge) ────────────────────────────────────────────────

tool('list_docs', 'List every documentation file available to read, from both the GTM handoff bundle and the SparkBridge product docs, with which directory each came from.', {}, async () => {
  const docs = []
  for (const dir of ['gtm', 'sparkbridge']) {
    for (const f of docNames(dir)) {
      let title = ''
      try { title = (fs.readFileSync(path.join(DIRS[dir], f), 'utf8').match(/^#\s+(.+)$/m) || [])[1] || '' } catch {}
      docs.push({ name: f, dir, title: title.slice(0, 120) })
    }
  }
  return { docs }
})

tool('search_docs', 'Case-insensitive search across all GTM and SparkBridge docs. Returns matching lines with doc name, source dir, and line number. Use short, specific terms.', {
  query: z.string().min(2).max(120),
}, async ({ query }) => {
  const q = query.toLowerCase()
  const hits = []
  for (const dir of ['gtm', 'sparkbridge']) {
    for (const f of docNames(dir)) {
      let lines
      try { lines = fs.readFileSync(path.join(DIRS[dir], f), 'utf8').split('\n') } catch { continue }
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(q)) {
          hits.push({ doc: f, dir, line: i + 1, text: lines[i].trim().slice(0, 240) })
          if (hits.length >= 60) return { hits, truncated: true }
        }
      }
    }
  }
  return { hits, truncated: false }
})

tool('read_doc', 'Read a doc, or a line range of it, from the GTM handoff bundle or the SparkBridge product docs. Prefer reading the range around a search hit rather than whole large docs.', {
  name: z.string().min(4).max(80),
  dir: z.enum(['gtm', 'sparkbridge']).optional().describe('Which snapshot to read from. If omitted and the name exists in both, gtm is preferred and the response says so.'),
  start_line: z.number().int().min(1).optional(),
  line_count: z.number().int().min(1).max(400).optional(),
}, async ({ name, dir, start_line, line_count }) => {
  const resolved = resolveDoc(name, dir)
  if (!resolved) return { error: 'unknown doc; call list_docs for the available names' }
  const lines = fs.readFileSync(resolved.path, 'utf8').split('\n')
  const start = Math.max(1, start_line || 1)
  const count = Math.min(line_count || 400, 400)
  const slice = lines.slice(start - 1, start - 1 + count).join('\n').slice(0, MAX_RESULT_CHARS)
  return {
    doc: name, dir: resolved.dir, start_line: start, total_lines: lines.length, text: slice,
    ...(resolved.ambiguous ? { note: `"${name}" exists in both gtm and sparkbridge docs; returned the gtm copy. Pass dir to pick explicitly.` } : {}),
  }
})

// ── Targets CSV ──────────────────────────────────────────────────────────────

// Minimal RFC4180 parser: handles quoted fields, embedded commas, embedded
// newlines inside quotes, and "" as an escaped quote.
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      rows.push(row); row = []
    } else {
      field += c
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  if (!rows.length) return []
  const header = rows[0]
  return rows.slice(1).filter((r) => r.some((v) => v !== '')).map((r) => {
    const obj = {}
    header.forEach((h, i) => { obj[h] = r[i] !== undefined ? r[i] : '' })
    return obj
  })
}

function loadTargets() {
  const p = path.join(DIRS.gtm, 'integrator-targets.csv')
  const text = fs.readFileSync(p, 'utf8')
  return parseCsv(text)
}

function loadOpsTargets() {
  const p = path.join(DIRS.gtm, 'ops__operator-targets.csv')
  const text = fs.readFileSync(p, 'utf8')
  return parseCsv(text)
}

function opsTargetOut(row) {
  return {
    firm: row.firm, person: row.person, email: row.email, email_confidence: row.email_confidence,
    phone: row.phone, vertical: row.vertical, size: row.size, cadence: row.cadence,
    current_stack: row.current_stack, source: row.source, status: row.status,
    approve: row.approve || '', dan_notes: row.dan_notes || '',
    s1: row.s1, s2: row.s2, s3: row.s3, s4: row.s4, s5: row.s5, s6: row.s6, s7: row.s7,
  }
}

function targetOut(row) {
  return {
    firm: row.firm, rank: row.rank, tier: row.tier, status: row.status,
    approve: row.approve || '', dan_notes: row.dan_notes || '',
    person: row.person, title: row.title, email: row.email, linkedin: row.linkedin,
    person2: row.person2, title2: row.title2, email2: row.email2,
    person3: row.person3, title3: row.title3, email3: row.email3,
    generic_email: row.generic_email, hook: row.hook, hook_url: row.hook_url,
    score: row.score, confidence: row.confidence, verified_date: row.verified_date,
  }
}

tool('list_targets', 'List integrator target firms from the GTM targets CSV. Optional case-insensitive substring filter over firm/tier/status/approve. Always includes the approve column.', {
  filter: z.string().max(120).optional(),
}, async ({ filter }) => {
  const rows = loadTargets()
  const q = (filter || '').trim().toLowerCase()
  const matched = q
    ? rows.filter((r) => [r.firm, r.tier, r.status, r.approve].some((v) => String(v || '').toLowerCase().includes(q)))
    : rows
  return { count: matched.length, targets: matched.map(targetOut) }
})

tool('get_target', 'Get one target firm\'s full row from the GTM targets CSV by firm name (exact or case-insensitive substring match).', {
  firm: z.string().min(2).max(160),
}, async ({ firm }) => {
  const rows = loadTargets()
  const q = firm.trim().toLowerCase()
  const exact = rows.find((r) => (r.firm || '').trim().toLowerCase() === q)
  const row = exact || rows.find((r) => (r.firm || '').toLowerCase().includes(q))
  if (!row) return { found: false }
  return { found: true, target: targetOut(row) }
})

tool('list_ops_targets', 'List One Person Show (OPS) operator target firms from the OPS targets CSV. Optional case-insensitive substring filter over firm/vertical/status/approve. Always includes the approve column.', {
  filter: z.string().max(120).optional(),
}, async ({ filter }) => {
  const rows = loadOpsTargets()
  const q = (filter || '').trim().toLowerCase()
  const matched = q
    ? rows.filter((r) => [r.firm, r.vertical, r.status, r.approve].some((v) => String(v || '').toLowerCase().includes(q)))
    : rows
  return { count: matched.length, targets: matched.map(opsTargetOut) }
})

tool('get_ops_target', 'Get one OPS (One Person Show) operator target firm\'s full row from the OPS targets CSV by firm name (exact or case-insensitive substring match).', {
  firm: z.string().min(2).max(160),
}, async ({ firm }) => {
  const rows = loadOpsTargets()
  const q = firm.trim().toLowerCase()
  const exact = rows.find((r) => (r.firm || '').trim().toLowerCase() === q)
  const row = exact || rows.find((r) => (r.firm || '').toLowerCase().includes(q))
  if (!row) return { found: false }
  return { found: true, target: opsTargetOut(row) }
})

// ── HubSpot (outreach-campaign-scoped, read only) ───────────────────────────

async function campaignContact(email) {
  const { findContactByEmail } = require('../lib/hubspot')
  const c = await findContactByEmail(email).catch(() => null)
  if (!c) return null
  if ((c.properties?.outreach_campaign || '') !== OUTREACH_CAMPAIGN) return null
  return c
}

tool('hubspot_find_contacts', `Find HubSpot contacts by firm name or email. Restricted to contacts tagged with outreach_campaign = ${OUTREACH_CAMPAIGN}; anyone outside that campaign is not returned. Read only.`, {
  firm_or_email: z.string().min(2).max(160),
}, async ({ firm_or_email }) => {
  const q = firm_or_email.trim()
  const isEmail = q.includes('@')
  if (isEmail) {
    const c = await campaignContact(q.toLowerCase())
    if (!c) return { count: 0, contacts: [], note: 'No matching contact in the sparkbridge-fap-2026-09 outreach campaign.' }
    const p = c.properties || {}
    return { count: 1, contacts: [{ id: c.id, name: [p.firstname, p.lastname].filter(Boolean).join(' '), email: p.email, company: p.company || null }] }
  }
  const { getAllContacts } = require('../lib/hubspot')
  const all = await getAllContacts(200).catch(() => [])
  const ql = q.toLowerCase()
  const matched = all.filter((c) => (c.properties?.outreach_campaign || '') === OUTREACH_CAMPAIGN
    && (c.properties?.company || '').toLowerCase().includes(ql))
  return {
    count: matched.length,
    contacts: matched.map((c) => ({ id: c.id, name: [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(' '), email: c.properties?.email, company: c.properties?.company || null })),
  }
})

tool('hubspot_contact_notes', `Read the most recent HubSpot notes for a contact by email. Restricted to contacts tagged with outreach_campaign = ${OUTREACH_CAMPAIGN}; a non-matching contact's notes are refused. Read only.`, {
  email: z.string().min(3).max(160),
}, async ({ email }) => {
  const c = await campaignContact(email.trim().toLowerCase())
  if (!c) return { found: false, note: 'Contact not found in the sparkbridge-fap-2026-09 outreach campaign; notes refused.' }
  const { getContactNotes } = require('../lib/hubspot')
  const notes = await getContactNotes(c.id, 10).catch(() => [])
  return { found: true, notes: notes.map((n) => ({ body: n.body, timestamp: n.timestamp || null })) }
})

// ── Pipeline (read-only, parameterized SQL) ─────────────────────────────────

tool('gtm_pipeline', 'Read-only snapshot of the GTM deal pipeline: every gtm_deals row plus the latest gtm_call_reports row per firm. Scoped to one product; defaults to sparkbridge.', {
  product: z.enum(['sparkbridge', 'ops']).optional().describe('Which product pipeline to read. Defaults to sparkbridge.'),
}, async ({ product }) => {
  const { isValidProduct, DEFAULT_PRODUCT } = require('../lib/gtm-products')
  const p = isValidProduct(product) ? product : DEFAULT_PRODUCT
  const { q } = require('../lib/db')
  const deals = await q('SELECT firm, stage, next_action, next_date, blockers, target_date, owner, updated_at FROM gtm_deals WHERE product = $1 ORDER BY updated_at DESC', [p])
  const reports = await q(
    `SELECT DISTINCT ON (firm) firm, email, contact_email, payload, created_at
     FROM gtm_call_reports
     WHERE product = $1
     ORDER BY firm, created_at DESC`,
    [p]
  )
  return {
    product: p,
    deals: deals.rows,
    latestCallReportsByFirm: reports.rows,
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
main().catch((e) => { console.error(e); process.exit(1) })
