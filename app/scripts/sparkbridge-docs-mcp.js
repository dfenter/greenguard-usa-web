#!/usr/bin/env node
// Stdio MCP server for the PUBLIC SparkBridge site chat (chat-daemon.js
// /chat/sparkbridge). Read-only by construction: it serves exactly the files in
// ~/.sparkbridge-chat-docs (a snapshot maintained by sparkbridge-docs-refresh.sh)
// and nothing else. No portal credentials are loaded, no env identity, no
// side-effecting tools — this endpoint faces the open internet, so the blast
// radius of a prompt-injected or abusive conversation must be zero.

const fs = require('fs')
const path = require('path')
const os = require('os')

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { z } = require('zod')

const DOCS_DIR = path.join(os.homedir(), '.sparkbridge-chat-docs')
const MAX_RESULT_CHARS = 12_000

// The whitelist is the directory listing itself, re-read per call so a snapshot
// refresh needs no daemon restart. Only plain .md files by simple name.
function docNames() {
  try {
    return fs.readdirSync(DOCS_DIR).filter((f) => /^[A-Za-z0-9._-]+\.md$/.test(f)).sort()
  } catch {
    return []
  }
}

function docPath(name) {
  // Basename-only: no separators, no traversal, and it must be in the listing.
  if (typeof name !== 'string' || !/^[A-Za-z0-9._-]+\.md$/.test(name)) return null
  if (!docNames().includes(name)) return null
  return path.join(DOCS_DIR, name)
}

const server = new McpServer({ name: 'sbdocs', version: '1.0.0' })

function tool(name, description, shape, run) {
  server.registerTool(name, { description, inputSchema: shape }, async (input) => {
    let out
    try {
      out = await run(input || {})
    } catch (e) {
      out = { error: String(e.message || e).slice(0, 200) }
    }
    return { content: [{ type: 'text', text: JSON.stringify(out) }] }
  })
}

tool('list_docs', 'List the SparkBridge documentation files available to read, with their sizes and first heading.', {}, async () => {
  const docs = docNames().map((f) => {
    let title = ''
    try { title = (fs.readFileSync(path.join(DOCS_DIR, f), 'utf8').match(/^#\s+(.+)$/m) || [])[1] || '' } catch {}
    return { name: f, title: title.slice(0, 120) }
  })
  return { docs }
})

tool('search_docs', 'Case-insensitive search across all SparkBridge docs. Returns matching lines with doc name and line number. Use short, specific terms (a property name, a feature, an error message).', {
  query: z.string().min(2).max(120),
}, async ({ query }) => {
  const q = query.toLowerCase()
  const hits = []
  for (const f of docNames()) {
    let lines
    try { lines = fs.readFileSync(path.join(DOCS_DIR, f), 'utf8').split('\n') } catch { continue }
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(q)) {
        hits.push({ doc: f, line: i + 1, text: lines[i].trim().slice(0, 240) })
        if (hits.length >= 60) return { hits, truncated: true }
      }
    }
  }
  return { hits, truncated: false }
})

tool('read_doc', 'Read a SparkBridge doc, or a line range of it. Prefer reading the range around a search hit rather than whole large docs.', {
  name: z.string().min(4).max(60),
  start_line: z.number().int().min(1).optional(),
  line_count: z.number().int().min(1).max(400).optional(),
}, async ({ name, start_line, line_count }) => {
  const p = docPath(name)
  if (!p) return { error: 'unknown doc; call list_docs for the available names' }
  const lines = fs.readFileSync(p, 'utf8').split('\n')
  const start = Math.max(1, start_line || 1)
  const count = Math.min(line_count || 400, 400)
  const slice = lines.slice(start - 1, start - 1 + count).join('\n').slice(0, MAX_RESULT_CHARS)
  return { doc: name, start_line: start, total_lines: lines.length, text: slice }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
main().catch((e) => { console.error(e); process.exit(1) })
