#!/usr/bin/env node
// GreenGuard local chat daemon — answers portal AI chat via the Claude CLI on
// this Mac (subscription-billed) instead of the metered Anthropic API.
//
//   Vercel /api/customer/chat, /api/admin/assistant
//     → POST https://<funnel-host>/chat/{customer|admin}   (Tailscale Funnel)
//     → 127.0.0.1:8787 (this daemon)
//     → claude -p  + chat-mcp-server.js (stdio MCP, audience-scoped tools)
//
// The portal treats any "not started" failure (unreachable, 401/503, timeout
// before headers) as safe to fall back to its own API path; a started-but-
// failed run returns 500 {started:true} so the portal never re-runs tools.
//
// Pattern-matches local-notify-daemon.js: env from app/.env (launchd has no
// shell profile), libs required from the checkout, launchd plist alongside.

const http = require('http')
const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const { spawn } = require('child_process')

// ── Env ──────────────────────────────────────────────────────────────────────
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

const PORT = parseInt(process.env.CHAT_DAEMON_PORT || '8787', 10)
const SECRET = process.env.CHAT_DAEMON_SECRET || ''
const CLAUDE_BIN = process.env.CLAUDE_BIN || `${os.homedir()}/.local/bin/claude`
const MCP_SERVER = path.join(__dirname, 'chat-mcp-server.js')
const STATE_PATH = path.join(__dirname, 'chat-daemon-state.json')
const SCRATCH = path.join(os.homedir(), '.gg-chat-scratch')
const TZ = process.env.CALENDAR_TIMEZONE || 'America/Chicago'

const RUN_BUDGET_MS = 50_000
const MAX_CONCURRENT = 2
const MAX_QUEUE = 3
const MAX_BODY = 8 * 1024 * 1024 // raised from 64KB for photo attachments (admin chat)
const RATE_LIMIT = 10           // requests/min/email
const SESSION_TTL_MS = 24 * 3600_000

function log(...args) {
  console.log(new Date().toISOString(), '[chat-daemon]', ...args)
}

// ── Tenants (OPS multi-tenant) ───────────────────────────────────────────────
// One daemon serves several tenants on one Mac. Callers pick one with the
// `x-ops-tenant` header (or a `tenant` body field); absent = 'greenguard', so
// every existing caller keeps working unchanged.
//
// v1.0 NOTE: the shared secret (CHAT_DAEMON_SECRET) is PER-MAC, not per-tenant.
// Anyone holding the Mac's secret can address any tenant configured on it. That
// is acceptable for v1.0 (one operator, one appliance); per-tenant secrets are
// a v1.1 concern.
const DEFAULT_TENANT = 'greenguard'
const TENANT_RE = /^[a-z0-9-]{1,32}$/
const BUSINESSES_DIR = path.join(APP_DIR, 'lib', 'businesses')

function tenantConfigPath(tenant) {
  return path.join(BUSINESSES_DIR, tenant, 'config.js')
}
function tenantExists(tenant) {
  return TENANT_RE.test(tenant) && fs.existsSync(tenantConfigPath(tenant))
}
// Resolve the tenant for a request. Returns { tenant } or { error }.
function resolveTenant(req, body) {
  const raw = String(req.headers['x-ops-tenant'] || (body && body.tenant) || '').trim().toLowerCase()
  if (!raw) return { tenant: DEFAULT_TENANT }
  if (!TENANT_RE.test(raw)) return { error: 'invalid tenant' }
  if (!tenantExists(raw)) return { error: `unknown tenant "${raw}"` }
  return { tenant: raw }
}

// Load a tenant's merged config through business.config.js (which applies the
// optional business.yaml overlay) with BUSINESS_ID temporarily pointed at it.
// The require cache is cleared around the call so each tenant resolves fresh.
const BUSINESS_CONFIG_PATH = require.resolve(path.join(APP_DIR, 'lib', 'business.config.js'))
const tenantConfigCache = new Map()
function tenantConfig(tenant) {
  if (tenantConfigCache.has(tenant)) return tenantConfigCache.get(tenant)
  const prevB = process.env.BUSINESS_ID
  const prevN = process.env.NEXT_PUBLIC_BUSINESS_ID
  let cfg
  try {
    process.env.BUSINESS_ID = tenant
    process.env.NEXT_PUBLIC_BUSINESS_ID = tenant
    delete require.cache[BUSINESS_CONFIG_PATH]
    delete require.cache[require.resolve(tenantConfigPath(tenant))]
    cfg = require(BUSINESS_CONFIG_PATH)
  } catch (e) {
    log(`tenant config load failed for ${tenant}: ${e.message}`)
    cfg = { id: tenant, name: tenant, nameShort: tenant, city: '', phone: '', industry: 'business' }
  } finally {
    if (prevB === undefined) delete process.env.BUSINESS_ID; else process.env.BUSINESS_ID = prevB
    if (prevN === undefined) delete process.env.NEXT_PUBLIC_BUSINESS_ID; else process.env.NEXT_PUBLIC_BUSINESS_ID = prevN
    delete require.cache[BUSINESS_CONFIG_PATH]
  }
  tenantConfigCache.set(tenant, cfg)
  return cfg
}

// ── System prompts ───────────────────────────────────────────────────────────
const CUSTOMER_SYSTEM = (context, biz = tenantConfig(DEFAULT_TENANT)) => `You are the ${biz.name} customer assistant. You help the signed-in customer with questions about their ${biz.serviceNoun || 'CO2 mosquito-control'} service, their plan, and their billing, and can take safe actions for them.

GROUND RULES:
1. Be warm, brief, plain-English. No marketing language. No emojis unless the customer used one first. Never use em dashes.
2. Answer from the CUSTOMER CONTEXT below and your tools. For any billing or cost question use get_my_invoices, get_my_plan, or get_service_pricing and answer directly with real numbers. Never invent amounts, dates, or details.
3. You CAN take these actions with the tools provided:
   - request_service_visit: when the customer wants someone to come out / service their trap / a tank swap.
   - request_reschedule: when they want to move their upcoming visit.
   After calling a tool, tell them plainly that the request was sent and the team will confirm.
4. You may NOT cancel service, issue refunds, or change billing yourself. For those, or any complaint, upset customer, or question you cannot confidently answer from context and tools, call escalate_to_team (pass their question verbatim as customer_message) and tell them the team has their message and will follow up.
5. Only discuss this customer's own account. Never look up or discuss anyone else.

CUSTOMER CONTEXT:
${context || '(none)'}`

const ADMIN_SYSTEM = (biz = tenantConfig(DEFAULT_TENANT)) => `You are the ${biz.name} operations assistant for the owner and field techs. You are a full administrative assistant: you can read routes, look up customers, check tank inventory, text customers, book, reschedule and cancel appointments, take notes, and create, edit and send Stripe invoices. Be terse and direct: answer the question, surface the number, do the task. No marketing language, no emojis, no em dashes.

YOUR TOOLS, BY JOB:
- Routes: get_todays_route, get_route_for_date (stops carry eventId + calBookingUid for later mutations).
- Customers: lookup_customer (by email or name; returns upcoming appointments with event ids), get_customer_notes.
- Scheduling: book_appointment, reschedule_appointment, cancel_appointment (cancel also cleans up the visit's invoice automatically).
- Invoices: list_customer_invoices (always FIRST, to get invoiceId and line ids) -> then create_invoice_for_visit (new or top-up), add_invoice_item (SKU line on a draft), remove_invoice_line (drop a line), send_invoice (finalize + send), cancel_invoice (delete draft / void open; paid cannot be cancelled).
- Comms: send_on_my_way_sms.
- Notes: add_appointment_note, add_customer_note, add_tech_note.
- Inventory: get_tank_inventory.

RULES:
1. Use tools rather than guessing. Look up the customer or route first to get event ids and emails before mutating anything. For invoice work, list_customer_invoices first to get the invoiceId; "cancel/void/delete an invoice" = cancel_invoice.
2. Scheduling: appointments are Mon-Fri, first start 10:00am CT, last start 5:30pm CT, on the half hour. The tools enforce this; if refused, relay the reason and offer the nearest valid slot.
3. Customers are NEVER notified about reschedules or cancellations, and you never offer to notify them. Booking and calendar changes are silent by design.
4. Billing is one-time invoices only, never subscriptions. Invoices go through the guarded pipeline; if a tool reports an invoice already exists for a visit, say so instead of forcing a duplicate.
5. Notes: when the user tells you something worth keeping, save it WITHOUT being asked to "add a note", then confirm in a few words what you saved and where. Route by subject: about one appointment → add_appointment_note on the event; about a customer generally (gate code, dog, broken trap, follow-up) → add_customer_note; everything else (day log, reminders, observations) → add_tech_note.
6. Before cancelling an appointment or sending an invoice, restate what you are about to do in one line (who, when, amount) as part of doing it, so the tech sees exactly what happened.
7. If a tool errors repeatedly, say what failed and which admin page handles it (Rounds, Calendar, Invoice) instead of pretending it worked.

Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: TZ })} (Central Time).`

// ── Public SparkBridge product assistant (no auth: rate-limited, docs-only) ──
const SB_ORIGINS = new Set([
  'https://mqtt.greenguard-usa.com',
  'https://new.greenguard-usa.com',
  'https://greenguard-usa.com',
  'https://www.greenguard-usa.com',
])
const SB_SID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const GTM_MCP_SERVER = path.join(__dirname, 'gtm-mcp-server.js')

// ── SparkBridge docs-grounded public profiles (sb-ask.js) ────────────────────
// Both public audiences (sparkbridge on the product site, sparkbridge-docs on
// docs.greenguard-usa.com) answer from retrieved docs chunks with NO tools.
const sbAsk = require('./sb-ask')
const SB_DOCS_ORIGINS = new Set([
  sbAsk.DOCS_ORIGIN,
  ...(process.env.SB_ASK_DEV_ORIGINS === '1' ? ['http://localhost:4321', 'http://127.0.0.1:4321'] : []),
])
const SB_ASK_DATA_DIR = sbAsk.defaultDataDir()
const SB_ASK_INDEX_BASE = process.env.SB_ASK_INDEX_BASE || `${sbAsk.DOCS_ORIGIN}/sparkbridge/ask`
const SB_PUBLIC_MAX_BODY = 32 * 1024
const SB_PUBLIC_MAX_WAITING = 3
const SB_PUBLIC_RUN_MS = 50_000
const sbIndex = new sbAsk.IndexStore(SB_ASK_INDEX_BASE, { log: (...a) => log(...a) })
const sbState = new sbAsk.AskState(path.join(SB_ASK_DATA_DIR, 'state.json'), { log: (...a) => log(...a) })
let draining = false

// ── Internal GTM (MBA program) portal assistant ─────────────────────────────
const GTM_SYSTEM = () => `You are the MBA program assistant for GreenGuard USA's internal GTM portal, which now covers TWO products' go-to-market programs:

1. SparkBridge (default product) - the Ignition industrial software GTM sprint.
2. One Person Show (OPS, ops.greenguard-usa.com) - the OPS operator GTM program. Always call it "One Person Show" or "OPS". Never write "One Man Show".

Scope: for SparkBridge, the 90-day plan, product facts, partner terms, integrator targets, outreach, and HubSpot contacts and notes for the sparkbridge-fap-2026-09 campaign. For OPS, the OPS plan, operator targets, outreach, and pipeline. For anything outside that, say briefly that you only cover the GTM sprint.

OPS trade-neutral rule: OPS is a general one-person-service-business back office product, not a pest-control product. When writing about OPS, use trade-neutral language: consumables, field, vehicle. Never use CO2, tanks, traps, or mosquito in OPS context (those are GreenGuard's own pest-control business, not the OPS product).

Rules:
1. Prices come ONLY from the pricing facts / cheat sheet doc (SITE-FACTS.md, or the pricing cheat sheet in the relevant handoff bundle). Never state a price from memory.
2. For SparkBridge, always state honest limits when relevant: no "certified" claim, no reference customer yet, early access and pilot labels exactly as the site shows them, "certificate issuance" (not mTLS) until 3.0.0, mixed-vendor pairing is by specification, GreenGuard uses its own signing cert.
3. Never draft anything that commits the company: no pricing exceptions, no discounts beyond the ratified partner terms, no dates promised to a target or partner.
4. When asked about a target firm (SparkBridge integrator or OPS operator), state plainly whether that row is approved. Do not imply approval that is not in the approve column.
5. Ground every factual claim in the tools: run at least three searches with different terms before ever claiming something is not documented.
6. Be clear which product a question or answer concerns before mixing facts from both. Never carry a SparkBridge fact into an OPS answer or vice versa.
7. No em dashes, no emojis. Be terse and direct.
8. Include today's date in your first reply of a conversation when it is relevant (e.g. status, deadlines, pipeline).`

// ── Session state ────────────────────────────────────────────────────────────
let state = { sessions: {} }
try { state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) } catch {}
if (!state.sessions) state.sessions = {}
function saveState() {
  try { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 1)) } catch (e) { log('state save failed:', e.message) }
}
// Session keys are tenant-scoped so two tenants never resume each other's
// Claude session. Legacy (pre-tenant) keys were `${audience}:${email}`; the
// greenguard tenant reads those too so live sessions survive this upgrade.
function sessionKey(tenant, audience, email) {
  return `${tenant}:${audience}:${email}`
}
function sessionFor(tenant, audience, email) {
  const keys = [sessionKey(tenant, audience, email)]
  if (tenant === DEFAULT_TENANT) keys.push(`${audience}:${email}`)
  for (const key of keys) {
    const s = state.sessions[key]
    if (s && Date.now() - (s.updatedAt || 0) < SESSION_TTL_MS) return s.sessionId
  }
  return null
}
function rememberSession(tenant, audience, email, sessionId) {
  state.sessions[sessionKey(tenant, audience, email)] = { sessionId, updatedAt: Date.now() }
  // prune expired
  for (const [k, v] of Object.entries(state.sessions)) {
    if (Date.now() - (v.updatedAt || 0) > SESSION_TTL_MS) delete state.sessions[k]
  }
  saveState()
}
function forgetSession(tenant, audience, email) {
  delete state.sessions[sessionKey(tenant, audience, email)]
  if (tenant === DEFAULT_TENANT) delete state.sessions[`${audience}:${email}`]
  saveState()
}

// ── Claude run ───────────────────────────────────────────────────────────────
function runClaude({ tenant = DEFAULT_TENANT, audience, email, message, history, context, images, deadlineMs }) {
  return new Promise((resolve) => {
    const reqId = crypto.randomUUID()
    const actionsFile = path.join(SCRATCH, `actions-${reqId}.jsonl`)
    const mcpConfigFile = path.join(SCRATCH, `mcp-${reqId}.json`)

    // Photo attachments: written to scratch, viewed by the CLI via a Read
    // permission scoped to the scratch dir only (nothing else is readable).
    const imageFiles = []
    for (const [n, img] of (images || []).entries()) {
      const ext = img.media_type === 'image/png' ? 'png' : img.media_type === 'image/webp' ? 'webp' : 'jpg'
      const f = path.join(SCRATCH, `img-${reqId}-${n}.${ext}`)
      try {
        fs.writeFileSync(f, Buffer.from(img.data, 'base64'), { mode: 0o600 })
        imageFiles.push(f)
      } catch {}
    }
    const childEnv = {
      ...process.env,
      // app/.env carries ANTHROPIC_API_KEY for the portal's API fallback. The
      // CLI must NOT see it or it bills the (empty) API account instead of the
      // subscription login.
      ANTHROPIC_API_KEY: undefined,
      ANTHROPIC_AUTH_TOKEN: undefined,
      PATH: `${process.env.PATH || ''}:${os.homedir()}/.local/bin:/usr/local/bin:/usr/bin:/bin`,
      HOME: os.homedir(),
      // Tenant selection for business.config.js and every lib the MCP server
      // requires. Both names are set: server code reads BUSINESS_ID, shared
      // client/server code reads NEXT_PUBLIC_BUSINESS_ID.
      BUSINESS_ID: tenant,
      NEXT_PUBLIC_BUSINESS_ID: tenant,
      GG_CHAT_AUDIENCE: audience,
      GG_CHAT_USER_EMAIL: email,
      GG_CHAT_CONTEXT_JSON: JSON.stringify(context && typeof context === 'object' ? context : {}),
      GG_ACTIONS_FILE: actionsFile,
    }
    // Env is baked into the MCP config too — belt and braces in case the CLI
    // does not pass its full environment down to stdio servers.
    fs.writeFileSync(mcpConfigFile, JSON.stringify(audience === 'gtm'
      ? { mcpServers: { gtm: { command: process.execPath, args: [GTM_MCP_SERVER], env: { GG_CHAT_USER_EMAIL: email } } } }
      : {
          mcpServers: {
            gg: {
              command: process.execPath,
              args: [MCP_SERVER],
              env: {
                BUSINESS_ID: tenant,
                NEXT_PUBLIC_BUSINESS_ID: tenant,
                GG_CHAT_AUDIENCE: audience,
                GG_CHAT_USER_EMAIL: email,
                GG_CHAT_CONTEXT_JSON: childEnv.GG_CHAT_CONTEXT_JSON,
                GG_ACTIONS_FILE: actionsFile,
              },
            },
          },
        }))

    const contextText = typeof context === 'string' ? context : (context?.text || '')
    const biz = tenantConfig(tenant)
    const system = audience === 'admin' ? ADMIN_SYSTEM(biz)
        : audience === 'gtm' ? GTM_SYSTEM()
        : CUSTOMER_SYSTEM(contextText, biz)

    const resumeId = sessionFor(tenant, audience, email)
    const newSessionId = crypto.randomUUID()
    // Resumed sessions already hold the conversation; fresh ones get the
    // portal-side history (last 10 turns) prepended so context carries over.
    let prompt = message
    if (!resumeId && Array.isArray(history) && history.length) {
      const h = history
        .filter((m) => m && typeof m.content === 'string' && ['user', 'assistant'].includes(m.role))
        .slice(-10)
        .map((m) => `${m.role === 'user' ? (audience === 'admin' ? 'Tech' : audience === 'gtm' ? 'MBA' : 'Customer') : 'Assistant'}: ${m.content}`)
        .join('\n')
      if (h) prompt = `Earlier in this conversation:\n${h}\n\nNew message: ${message}`
    }
    if (imageFiles.length) {
      prompt += `\n\n[${imageFiles.length === 1 ? 'A photo is' : imageFiles.length + ' photos are'} attached to this message, saved at:\n${imageFiles.join('\n')}\nView ${imageFiles.length === 1 ? 'it' : 'them'} with the Read tool before answering.]`
    }

    const args = [
      '-p',
      '--output-format', 'json',
      '--system-prompt', system,
      '--mcp-config', mcpConfigFile,
      '--strict-mcp-config',
      // Read is allowed ONLY inside the scratch dir (attached photos); the
      // gitignore-style `//` prefix makes the rule an absolute filesystem path.
      '--allowedTools', audience === 'gtm' ? 'mcp__gtm' : `mcp__gg,Read(/${SCRATCH}/**)`,
      '--disallowedTools', audience === 'gtm'
        ? 'Bash,Write,Edit,Read,Glob,Grep,WebFetch,WebSearch,Task,NotebookEdit,TodoWrite,KillShell,BashOutput'
        : 'Bash,Write,Edit,Glob,Grep,WebFetch,WebSearch,Task,NotebookEdit,TodoWrite,KillShell,BashOutput',
      '--max-turns', audience === 'gtm' ? '12' : '12',
      // Public product Q&A runs on opus at low effort (Dan's call 2026-08-14):
      // stronger grounding and synthesis than haiku, effort capped for latency
      // and subscription spend. Portal tiers keep the default model.
      // All tiers run Opus at low effort (Dan's call 2026-08-27).
      '--model', 'opus', '--effort', 'low',
      ...(resumeId ? ['--resume', resumeId] : ['--session-id', newSessionId]),
    ]

    const child = spawn(CLAUDE_BIN, args, { cwd: SCRATCH, env: childEnv })
    let stdout = '', stderr = ''
    let killed = false
    const timer = setTimeout(() => {
      killed = true
      child.kill('SIGTERM')
      setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, 5000)
    }, Math.max(1000, deadlineMs - Date.now()))

    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    child.stdin.write(prompt)
    child.stdin.end()

    child.on('close', (code) => {
      clearTimeout(timer)
      // Collect tool markers + escalation flags from the actions file. Each
      // side-effecting tool writes phase:'started' BEFORE it runs and
      // phase:'ended' after; read-only tools write a single 'ended'. A
      // 'started' with no matching 'ended' means the process died mid-mutation.
      let actions = []
      let escalated = false
      let escalateReason = null
      let mutationStarted = false
      try {
        for (const line of fs.readFileSync(actionsFile, 'utf8').split('\n')) {
          if (!line.trim()) continue
          try {
            const a = JSON.parse(line)
            if (a.phase === 'started') { mutationStarted = true; continue }
            actions.push({ name: a.name, summary: a.resultSummary })
            if (a.escalated) { escalated = true; escalateReason = a.escalateReason || null }
          } catch {}
        }
      } catch {}
      try { fs.unlinkSync(actionsFile) } catch {}
      try { fs.unlinkSync(mcpConfigFile) } catch {}
      for (const f of imageFiles) { try { fs.unlinkSync(f) } catch {} }

      let parsed = null
      try { parsed = JSON.parse(stdout) } catch {}

      // `started` is true if ANY tool ran OR a mutation began (even if killed
      // before it could finish). This gates the fresh-session retry so a
      // partially-applied mutation is never re-run.
      const started = actions.length > 0 || mutationStarted

      if (killed) {
        return resolve({ ok: false, started, error: 'budget exceeded', actions, escalated, escalateReason })
      }
      if (code !== 0 || !parsed || parsed.is_error || typeof parsed.result !== 'string') {
        const errText = (parsed?.result || stderr || stdout || '').slice(0, 400)
        return resolve({ ok: false, started, error: `claude exit ${code}: ${errText}`, resumeFailed: !!resumeId, actions, escalated, escalateReason })
      }
      rememberSession(tenant, audience, email, parsed.session_id || newSessionId)
      resolve({ ok: true, reply: parsed.result, actions, escalated, escalateReason })
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      try { fs.unlinkSync(actionsFile) } catch {}
      try { fs.unlinkSync(mcpConfigFile) } catch {}
      for (const f of imageFiles) { try { fs.unlinkSync(f) } catch {} }
      resolve({ ok: false, started: false, error: `spawn failed: ${e.message}` })
    })
  })
}

// ── Per-user serialization (finding #5) ──────────────────────────────────────
// Two concurrent turns for the same audience:email would resume ONE Claude

// ── Generic completion (no MCP tools) ───────────────────────────────────────
// Used by the Gmail agent (drafts, property assessment, win-back) and any
// other server job that used to call the metered Messages API. Single-turn,
// no session, no tools except Read scoped to scratch for attached images.
// Body: { system, prompt, images?:[{media_type,data}], json?:true, model?, effort? }
function runComplete({ tenant = DEFAULT_TENANT, system, prompt, images, json, model, effort, deadlineMs }) {
  return new Promise((resolve) => {
    const reqId = crypto.randomUUID()
    const imageFiles = []
    for (const [n, img] of (images || []).entries()) {
      const ext = img.media_type === 'image/png' ? 'png' : img.media_type === 'image/webp' ? 'webp' : 'jpg'
      const f = path.join(SCRATCH, `cimg-${reqId}-${n}.${ext}`)
      try { fs.writeFileSync(f, Buffer.from(img.data, 'base64'), { mode: 0o600 }); imageFiles.push(f) } catch {}
    }
    const childEnv = {
      ...process.env,
      ANTHROPIC_API_KEY: undefined,
      ANTHROPIC_AUTH_TOKEN: undefined,
      PATH: `${process.env.PATH || ''}:${os.homedir()}/.local/bin:/usr/local/bin:/usr/bin:/bin`,
      HOME: os.homedir(),
      BUSINESS_ID: tenant,
      NEXT_PUBLIC_BUSINESS_ID: tenant,
    }
    let sys = String(system || '')
    if (json) sys += '\n\nRespond with VALID JSON only — no prose, no markdown fences. Start with { and end with }.'
    let p = String(prompt || '')
    if (imageFiles.length) {
      p += `\n\n[${imageFiles.length} image(s) attached, saved at:\n${imageFiles.join('\n')}\nView them with the Read tool before answering.]`
    }
    const mcpConfigFile = path.join(SCRATCH, `mcp-${reqId}.json`)
    fs.writeFileSync(mcpConfigFile, JSON.stringify({ mcpServers: {} }))
    const args = [
      '-p', '--output-format', 'json',
      '--system-prompt', sys,
      '--mcp-config', mcpConfigFile, '--strict-mcp-config',
      '--allowedTools', imageFiles.length ? `Read(/${SCRATCH}/**)` : '',
      '--disallowedTools', 'Bash,Write,Edit,Glob,Grep,WebFetch,WebSearch,Task,NotebookEdit,TodoWrite,KillShell,BashOutput' + (imageFiles.length ? '' : ',Read'),
      '--max-turns', imageFiles.length ? '4' : '1',
      '--model', ['haiku', 'sonnet', 'opus'].includes(model) ? model : 'opus',
      '--effort', ['low', 'medium', 'high'].includes(effort) ? effort : 'low',
      '--session-id', crypto.randomUUID(),
    ]
    const child = spawn(CLAUDE_BIN, args, { cwd: SCRATCH, env: childEnv })
    let stdout = '', stderr = '', killed = false
    const timer = setTimeout(() => { killed = true; child.kill('SIGTERM'); setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, 5000) }, Math.max(1000, deadlineMs - Date.now()))
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    child.stdin.write(p); child.stdin.end()
    const cleanup = () => { try { fs.unlinkSync(mcpConfigFile) } catch {}; for (const f of imageFiles) { try { fs.unlinkSync(f) } catch {} } }
    child.on('close', (code) => {
      clearTimeout(timer); cleanup()
      let parsed = null
      try { parsed = JSON.parse(stdout) } catch {}
      if (killed) return resolve({ ok: false, error: 'budget exceeded' })
      if (code !== 0 || !parsed || parsed.is_error || typeof parsed.result !== 'string') {
        return resolve({ ok: false, error: `claude exit ${code}: ${(parsed?.result || stderr || stdout || '').slice(0, 400)}` })
      }
      let text = parsed.result.trim()
      if (json) {
        const cleaned = text.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim()
        const a = cleaned.indexOf('{'), b = cleaned.lastIndexOf('}')
        const candidate = a >= 0 && b > a ? cleaned.slice(a, b + 1) : cleaned
        try { JSON.parse(candidate); text = candidate } catch { return resolve({ ok: false, error: 'non-JSON reply', text }) }
      }
      resolve({ ok: true, text, usage: parsed.usage || null })
    })
    child.on('error', (e) => { clearTimeout(timer); cleanup(); resolve({ ok: false, error: `spawn failed: ${e.message}` }) })
  })
}

// session simultaneously — interleaved context and racing mutations. Chain
// same-key runs so a user's turns execute strictly one at a time. Different
// users still run concurrently up to MAX_CONCURRENT.
const userLocks = new Map() // key → tail promise of the in-flight chain
function withUserLock(key, fn) {
  const prev = userLocks.get(key) || Promise.resolve()
  const run = prev.then(fn, fn)          // run after prior turn settles (either way)
  const tail = run.catch(() => {})       // swallow so the chain never rejects
  userLocks.set(key, tail)
  // Drop the entry once THIS is the last link, keeping the map bounded.
  tail.then(() => { if (userLocks.get(key) === tail) userLocks.delete(key) })
  return run
}

// ── Queue ────────────────────────────────────────────────────────────────────
let running = 0
let sbRunning = 0
const queue = []
function pump() {
  // At most ONE public sparkbridge job runs at a time, so anonymous site
  // traffic can never occupy both slots and starve the portal tiers.
  let i = 0
  while (running < MAX_CONCURRENT && i < queue.length) {
    const job = queue[i]
    if (Date.now() > job.enqueueDeadline) { queue.splice(i, 1); job.reject503('queued too long'); continue }
    if (job.isSparkbridge && sbRunning >= 1) { i++; continue }
    queue.splice(i, 1)
    running++
    if (job.isSparkbridge) sbRunning++
    job.run().finally(() => { running--; if (job.isSparkbridge) sbRunning--; pump() })
  }
  // Public jobs learn how many jobs are ahead of them (SSE `queue` events).
  let ahead = sbRunning
  for (const j of queue) {
    if (!j.isSparkbridge) continue
    if (j.onPosition) j.onPosition(ahead)
    ahead++
  }
}

// ── Rate limit (per email + global, finding #11) ─────────────────────────────
// Email is attacker-controlled on the public endpoint, so per-email limiting
// alone is bypassable by rotating the field. A global ceiling caps total spend
// regardless, and the bucket map is pruned so it can't grow unbounded.
const rateBuckets = new Map()
const globalHits = []
const MAX_RATE_KEYS = 5000
const GLOBAL_RATE_LIMIT = 60 // requests/min across all callers
function rateLimited(email) {
  const now = Date.now()
  for (let i = globalHits.length - 1; i >= 0 && now - globalHits[i] >= 60_000; i--) globalHits.pop()
  // prune stale email buckets opportunistically
  if (rateBuckets.size > MAX_RATE_KEYS) {
    for (const [k, v] of rateBuckets) { if (!v.length || now - v[v.length - 1] > 60_000) rateBuckets.delete(k) }
  }
  const bucket = (rateBuckets.get(email) || []).filter((t) => now - t < 60_000)
  bucket.push(now)
  rateBuckets.set(email, bucket)
  globalHits.unshift(now)
  return bucket.length > RATE_LIMIT || globalHits.length > GLOBAL_RATE_LIMIT
}

// ── Public SparkBridge docs-grounded runs (no tools, stream-json) ────────────
// Every built-in tool is disabled (--tools ""), MCP is an empty strict config,
// user/project settings (hooks, CLAUDE.md) are not loaded, and the deny list
// stays as a second layer. The prompt carries everything the model may use.
function runDocsClaude({ system, prompt, deadlineMs, onText }) {
  const reqId = crypto.randomUUID()
  const mcpConfigFile = path.join(SCRATCH, `mcp-${reqId}.json`)
  fs.writeFileSync(mcpConfigFile, JSON.stringify({ mcpServers: {} }))
  const childEnv = {
    ...process.env,
    // Same as runClaude: never let the CLI bill the API key account.
    ANTHROPIC_API_KEY: undefined,
    ANTHROPIC_AUTH_TOKEN: undefined,
    PATH: `${process.env.PATH || ''}:${os.homedir()}/.local/bin:/usr/local/bin:/usr/bin:/bin`,
    HOME: os.homedir(),
  }
  const args = [
    '-p',
    '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--system-prompt', system,
    '--tools', '',
    '--mcp-config', mcpConfigFile, '--strict-mcp-config',
    '--setting-sources', '',
    '--disallowedTools', 'Bash,Write,Edit,Read,Glob,Grep,WebFetch,WebSearch,Task,NotebookEdit,TodoWrite,KillShell,BashOutput',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--max-turns', '1',
    '--model', 'opus', '--effort', 'low',
  ]
  let child
  const done = new Promise((resolve) => {
    child = spawn(CLAUDE_BIN, args, { cwd: SCRATCH, env: childEnv })
    let lineBuf = '', stderr = '', streamed = '', result = null, killed = false
    const timer = setTimeout(() => {
      killed = true
      child.kill('SIGTERM')
      setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, 5000)
    }, Math.max(1000, deadlineMs - Date.now()))
    const onLine = (line) => {
      if (!line.trim()) return
      let ev
      try { ev = JSON.parse(line) } catch { return }
      if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta' && ev.event.delta?.type === 'text_delta') {
        const t = String(ev.event.delta.text || '')
        streamed += t
        if (t && onText) onText(t)
      } else if (ev.type === 'result') {
        result = ev
      }
    }
    child.stdout.on('data', (d) => {
      lineBuf += d
      let i
      while ((i = lineBuf.indexOf('\n')) >= 0) { onLine(lineBuf.slice(0, i)); lineBuf = lineBuf.slice(i + 1) }
    })
    child.stderr.on('data', (d) => { if (stderr.length < 4000) stderr += d })
    child.stdin.write(prompt)
    child.stdin.end()
    const cleanup = () => { clearTimeout(timer); try { fs.unlinkSync(mcpConfigFile) } catch {} }
    child.on('close', (code) => {
      cleanup()
      if (lineBuf) onLine(lineBuf)
      if (killed) return resolve({ ok: false, error: 'timeout' })
      if (!result || result.is_error || code !== 0) {
        return resolve({ ok: false, error: 'model_error', detail: `exit ${code}: ${String(result?.result || stderr).slice(0, 300)}` })
      }
      resolve({ ok: true, text: typeof result.result === 'string' && result.result ? result.result : streamed })
    })
    child.on('error', (e) => { cleanup(); resolve({ ok: false, error: 'model_error', detail: `spawn failed: ${e.message}` }) })
  })
  return { done, kill: () => { try { child.kill('SIGTERM') } catch {} } }
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim().slice(0, 64)
}

// One request = one `ask-req` log line (no raw IP, no salt, no text).
function logAsk(f) {
  log('ask-req', JSON.stringify({
    t: new Date().toISOString(), audience: f.audience, origin: f.origin || '', iphash: f.iphash,
    sid: String(f.sid || '').slice(0, 8), version: f.version || '', status: f.status,
    qlen: f.qlen || 0, alen: f.alen || 0, sources: f.sources || 0, answered: f.answered ?? null, ms: f.ms || 0,
  }))
}

function handlePublic(req, res, audience) {
  const t0 = Date.now()
  const isDocs = audience === 'sparkbridge-docs'
  const origin = String(req.headers.origin || '')
  const allowed = isDocs ? SB_DOCS_ORIGINS.has(origin) : SB_ORIGINS.has(origin)
  const cors = allowed ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : { 'Vary': 'Origin' }
  const ip = clientIp(req)
  const iphash = sbState.ipHash(ip)
  const lg = { audience, origin, iphash, sid: '', version: '', qlen: 0 }
  const send = (code, obj) => {
    for (const [k, v] of Object.entries(cors)) res.setHeader(k, v)
    sendJson(res, code, obj)
    logAsk({ ...lg, status: code, ms: Date.now() - t0 })
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(allowed ? 204 : 403, {
      ...cors,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
      'Access-Control-Max-Age': '86400',
    })
    return res.end()
  }
  if (req.method !== 'POST') return sendJson(res, 404, { error: 'not found' })
  // Docs audience: foreign or missing Origin is refused outright. The product
  // tier keeps its old behavior (served, but without a CORS grant).
  if (isDocs && !allowed) return send(403, { error: 'origin' })

  let size = 0
  const chunks = []
  req.on('data', (d) => {
    const was = size
    size += d.length
    if (size <= SB_PUBLIC_MAX_BODY) return chunks.push(d)
    // Over 32 KB: answer once, drop the rest, close the connection after.
    if (was <= SB_PUBLIC_MAX_BODY) { res.setHeader('Connection', 'close'); send(400, isDocs ? { error: 'bad_request' } : { error: 'too large' }) }
  })
  req.on('end', () => {
    if (size > SB_PUBLIC_MAX_BODY) return
    const bad = () => send(400, isDocs ? { error: 'bad_request' } : { error: 'sid (uuid) and message required' })
    let body
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return bad() }
    const sid = String(body?.sid || '').toLowerCase()
    const message = typeof body?.message === 'string' ? body.message.trim() : ''
    lg.sid = sid
    lg.qlen = message.length
    if (!SB_SID_RE.test(sid) || !message) return bad()
    if (message.length > (isDocs ? 1000 : 1500)) return send(400, isDocs ? { error: 'bad_request' } : { error: 'message too long' })
    let version = body?.version
    if (version === undefined || version === null || version === '') version = '8.1'
    if (!sbAsk.VERSIONS.includes(version)) {
      if (isDocs) return bad()
      version = '8.1'
    }
    lg.version = version
    const page = typeof body?.page === 'string' ? body.page.slice(0, 300) : ''
    const history = sbAsk.capHistory(body?.history)

    if (!isDocs) {
      // Product tier keeps its per-minute limits on top of the hourly ones.
      const key = `sb:${sid}`
      const sidBucket = (rateBuckets.get(key) || []).filter((t) => Date.now() - t < 60_000)
      if (sidBucket.length >= 6 || rateLimited(`sbip:${ip}`)) return send(429, { ok: false, error: 'rate limited', retryAfter: 60 })
      sidBucket.push(Date.now())
      rateBuckets.set(key, sidBucket)
    }
    if (draining || queue.filter((j) => j.isSparkbridge).length >= SB_PUBLIC_MAX_WAITING) {
      return send(503, isDocs ? { error: 'busy', handoff: true } : { ok: false, started: false, error: 'busy' })
    }
    const lim = sbState.check(ip, sid)
    if (!lim.ok) {
      return send(429, isDocs
        ? { error: 'rate_limited', retryAfter: lim.retryAfter, handoff: true }
        : { ok: false, error: 'rate limited', retryAfter: lim.retryAfter })
    }

    const sse = isDocs && /text\/event-stream/.test(String(req.headers.accept || ''))
    let closed = false
    let proc = null
    let keepalive = null
    const event = (name, data) => { if (!closed) res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`) }
    if (sse) {
      res.writeHead(200, {
        ...cors,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      })
      keepalive = setInterval(() => { if (!closed) res.write(': ping\n\n') }, 15_000)
    }
    const finish = (status, extra) => {
      if (keepalive) clearInterval(keepalive)
      logAsk({ ...lg, status, ms: Date.now() - t0, ...extra })
    }
    const fail = (code, httpCode, detail) => {
      if (detail) log(`sb-ask ${audience} ${sid.slice(0, 8)} ${code}: ${detail}`)
      if (sse) { event('error', { error: code, handoff: true }); res.end() }
      else {
        for (const [k, v] of Object.entries(cors)) res.setHeader(k, v)
        sendJson(res, httpCode, isDocs ? { ok: false, error: code, handoff: true } : { ok: false, started: code !== 'busy', error: code })
      }
      finish(sse ? `sse:${code}` : httpCode)
    }

    let lastPos = -1
    const job = {
      isSparkbridge: true,
      // SSE clients see queue events and may wait ~60 s; JSON callers (product
      // widget, 75 s client timeout) wait at most 25 s.
      enqueueDeadline: Date.now() + (sse || isDocs ? 60_000 : 25_000),
      onPosition: (n) => { if (sse && n !== lastPos) { lastPos = n; event('queue', { position: n }) } },
      reject503: () => fail('busy', 503),
      run: async () => {
        if (closed) return finish('client_closed')
        const idx = await sbIndex.get(version)
        if (!idx) return fail('index_unavailable', 503, `no index for ${version}`)
        const passed = sbAsk.searchChunks(idx, message, history)
        const prompt = sbAsk.buildUserTurn({ version, chunks: passed, history, question: message })
        const stripper = new sbAsk.SentinelStripper()
        if (sse) event('start', {})
        proc = runDocsClaude({
          system: sbAsk.systemPrompt(!isDocs),
          prompt,
          deadlineMs: Date.now() + SB_PUBLIC_RUN_MS,
          onText: sse ? (t) => { const out = stripper.feed(t); if (out) event('text', { t: out }) } : null,
        })
        const out = await proc.done
        if (sse) { const tail = stripper.end(); if (tail) event('text', { t: tail }) }
        if (closed) return finish('client_closed')
        if (!out.ok) return fail(out.error, out.error === 'timeout' ? 504 : 500, out.detail)
        const fin = sbAsk.finalizeAnswer(out.text, passed)
        const ms = Date.now() - t0
        try {
          sbAsk.appendTranscript(SB_ASK_DATA_DIR, sid, {
            ts: new Date().toISOString(), audience, version, page, iphash,
            q: message, a: fin.text, sources: fin.sources, answered: fin.answered, ms,
          })
        } catch (e) { log(`sb-ask transcript write failed: ${e.message}`) }
        if (sse) {
          event('done', { answered: fin.answered, text: fin.text, sources: fin.sources, ms })
          res.end()
        } else {
          for (const [k, v] of Object.entries(cors)) res.setHeader(k, v)
          sendJson(res, 200, isDocs
            ? { ok: true, answered: fin.answered, text: fin.text, sources: fin.sources, ms }
            : { ok: true, reply: fin.text, sources: fin.sources, answered: fin.answered, ms, actions: [], escalated: false, escalateReason: null })
        }
        finish(200, { alen: fin.text.length, sources: fin.sources.length, answered: fin.answered })
      },
    }
    res.on('close', () => {
      if (res.writableFinished) return
      closed = true
      if (keepalive) clearInterval(keepalive)
      const i = queue.indexOf(job)
      if (i >= 0) { queue.splice(i, 1); finish('client_closed'); pump() }
      if (proc) proc.kill()
    })
    queue.push(job)
    pump()
  })
}

// ── HTTP server ──────────────────────────────────────────────────────────────
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    return sendJson(res, 200, { ok: true, running, queued: queue.length, sbAskIndexes: sbIndex.status() })
  }

  if (req.url === '/complete') {
    if (req.method !== 'POST') return sendJson(res, 404, { error: 'not found' })
    const given = String(req.headers['x-gg-chat-secret'] || '')
    const a = Buffer.from(given), b = Buffer.from(SECRET)
    if (!SECRET || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return sendJson(res, 401, { error: 'unauthorized' })
    let size = 0; const chunks = []
    req.on('data', (d) => { size += d.length; if (size > MAX_BODY) { req.destroy(); try { sendJson(res, 413, { error: 'too large' }) } catch {} } else chunks.push(d) })
    req.on('end', () => {
      if (size > MAX_BODY) return
      let body
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return sendJson(res, 400, { error: 'bad json' }) }
      const t = resolveTenant(req, body)
      if (t.error) return sendJson(res, 400, { error: t.error })
      const tenant = t.tenant
      const { system, prompt, images, json, model, effort } = body || {}
      if (!prompt || typeof prompt !== 'string') return sendJson(res, 400, { error: 'prompt required' })
      if (prompt.length > 60_000 || String(system || '').length > 20_000) return sendJson(res, 400, { error: 'prompt too long' })
      const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
      const capImages = Array.isArray(images) ? images.slice(0, 3).flatMap((i) => {
        if (!i || !IMAGE_TYPES.has(i.media_type)) return []
        const data = String(i.data || '')
        if (!data || data.length > 2_500_000 || !/^[A-Za-z0-9+/=]+$/.test(data)) return []
        return [{ media_type: i.media_type, data }]
      }) : []
      if (queue.length >= MAX_QUEUE) return sendJson(res, 503, { ok: false, error: 'busy' })
      const deadlineMs = Date.now() + RUN_BUDGET_MS
      queue.push({
        enqueueDeadline: Date.now() + 20_000,
        reject503: (why) => sendJson(res, 503, { ok: false, error: why }),
        run: async () => {
          const t0 = Date.now()
          log(`complete [${tenant}]: "${prompt.slice(0, 60).replace(/\n/g, ' ')}" json=${!!json} imgs=${capImages.length}`)
          const out = await runComplete({ tenant, system, prompt, images: capImages, json: !!json, model, effort, deadlineMs })
          log(`complete done [${tenant}] ok=${out.ok} ${Date.now() - t0}ms${out.ok ? '' : ' err=' + out.error}`)
          sendJson(res, out.ok ? 200 : 500, out)
        },
      })
      pump()
    })
    return
  }
  const pm = req.url.match(/^\/chat\/(sparkbridge|sparkbridge-docs)$/)
  if (pm) return handlePublic(req, res, pm[1])
  const m = req.url.match(/^\/chat\/(customer|admin|gtm)$/)
  if (!m) return sendJson(res, 404, { error: 'not found' })
  const audience = m[1]

  if (req.method !== 'POST') return sendJson(res, 404, { error: 'not found' })
  // Timing-safe shared-secret check: the Funnel URL is public internet.
  const given = String(req.headers['x-gg-chat-secret'] || '')
  const a = Buffer.from(given), b = Buffer.from(SECRET)
  if (!SECRET || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return sendJson(res, 401, { error: 'unauthorized' })
  }

  let size = 0
  const chunks = []
  req.on('data', (d) => {
    size += d.length
    if (size > MAX_BODY) { req.destroy(); try { sendJson(res, 413, { error: 'too large' }) } catch {} }
    else chunks.push(d)
  })
  req.on('end', () => {
    if (size > MAX_BODY) return
    let body
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return sendJson(res, 400, { error: 'bad json' }) }
    const t = resolveTenant(req, body)
    if (t.error) return sendJson(res, 400, { error: t.error })
    const tenant = t.tenant
    let { email, message, history, context, images } = body || {}
    if (!email || typeof email !== 'string' || !message || typeof message !== 'string') {
      return sendJson(res, 400, { error: 'email and message required' })
    }
    if (message.length > 2000) return sendJson(res, 400, { error: 'message too long' })
    if (email.length > 320) return sendJson(res, 400, { error: 'email too long' })
    // Cap history + context so a caller can't force an unbounded prompt/spend
    // (finding #12). History is trimmed to the last 10 turns downstream anyway.
    const capHistory = Array.isArray(history) ? history.slice(-12).map((m) => ({
      role: m?.role, content: typeof m?.content === 'string' ? m.content.slice(0, 4000) : '',
    })) : []
    let capContext = context
    if (typeof context === 'string') capContext = context.slice(0, 8000)
    else if (context && typeof context === 'object') {
      capContext = { text: String(context.text || '').slice(0, 8000), name: context.name, address: context.address, nextVisit: context.nextVisit }
    }
    // Photo attachments: admin chat only (the endpoint is public internet
    // behind the shared secret; customers have no image use case). Max 2,
    // ~1.8MB binary each, known image types only.
    const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
    const capImages = audience === 'admin' && Array.isArray(images)
      ? images.slice(0, 2).flatMap((i) => {
          if (!i || !IMAGE_TYPES.has(i.media_type)) return []
          const data = String(i.data || '')
          if (!data || data.length > 2_500_000 || !/^[A-Za-z0-9+/=]+$/.test(data)) return []
          return [{ media_type: i.media_type, data }]
        })
      : []
    if (rateLimited(`${tenant}:${email.toLowerCase()}`)) return sendJson(res, 429, { ok: false, started: false, error: 'rate limited' })
    // Only portal jobs count here: queued public jobs must not push the portal
    // into its busy/fallback path.
    if (queue.filter((j) => !j.isSparkbridge).length >= MAX_QUEUE) {
      return sendJson(res, 503, { ok: false, started: false, error: 'busy' })
    }

    const deadlineMs = Date.now() + RUN_BUDGET_MS
    const job = {
      // Portal tiers bail fast so the Vercel side can fall back to the API path.
      enqueueDeadline: Date.now() + 10_000,
      reject503: (why) => sendJson(res, 503, { ok: false, started: false, error: why }),
      run: async () => {
        const t0 = Date.now()
        const lc = email.toLowerCase()
        log(`run [${tenant}] ${audience} ${email}: "${message.slice(0, 80)}"`)
        // Serialize per user so concurrent turns don't share one resume session.
        // Tenant-scoped: the same email at two tenants is two independent users.
        let out = await withUserLock(`${tenant}:${audience}:${lc}`, async () => {
          let r = await runClaude({ tenant, audience, email: lc, message, history: capHistory, context: capContext, images: capImages, deadlineMs })
          // A dead/expired --resume session self-heals: forget and retry fresh
          // once — ONLY when nothing started (guards against re-running a
          // partially-applied mutation, finding #1).
          if (!r.ok && r.resumeFailed && !r.started && Date.now() < deadlineMs - 15_000) {
            log(`resume failed for ${tenant}:${audience}:${email}, retrying fresh`)
            forgetSession(tenant, audience, lc)
            r = await runClaude({ tenant, audience, email: lc, message, history: capHistory, context: capContext, images: capImages, deadlineMs })
          }
          return r
        })
        log(`done [${tenant}] ${audience} ${email}: ok=${out.ok} started=${out.started !== false} ${Date.now() - t0}ms actions=${(out.actions || []).length}${out.ok ? '' : ' err=' + out.error}`)
        const respond = (code, obj) => sendJson(res, code, obj)
        if (out.ok) {
          respond(200, { ok: true, reply: out.reply, actions: out.actions, escalated: out.escalated, escalateReason: out.escalateReason })
        } else if (out.started === false) {
          respond(503, { ok: false, started: false, error: out.error })
        } else {
          respond(500, { ok: false, started: true, error: out.error, actions: out.actions })
        }
      },
    }
    queue.push(job)
    pump()
  })
})

function main() {
  if (!SECRET) { console.error('CHAT_DAEMON_SECRET not set in app/.env — refusing to start'); process.exit(1) }
  if (!fs.existsSync(CLAUDE_BIN)) { console.error(`claude binary not found at ${CLAUDE_BIN}`); process.exit(1) }
  fs.mkdirSync(SCRATCH, { recursive: true, mode: 0o700 })
  try { fs.chmodSync(SCRATCH, 0o700) } catch {}
  fs.mkdirSync(SB_ASK_DATA_DIR, { recursive: true, mode: 0o700 })
  try { fs.chmodSync(SB_ASK_DATA_DIR, 0o700) } catch {}
  const prune = () => {
    try { const r = sbAsk.pruneTranscripts(SB_ASK_DATA_DIR); if (r.length) log(`sb-ask pruned transcripts: ${r.join(',')}`) } catch (e) { log(`sb-ask prune failed: ${e.message}`) }
  }
  prune()
  setInterval(prune, 6 * 3600_000).unref()
  for (const v of sbAsk.VERSIONS) sbIndex.get(v).catch(() => {})
  // Slowloris/idle-socket defense (finding #11): drop connections that don't
  // send headers+body promptly and cap how long the funnel proxy may hold one.
  server.headersTimeout = 10_000
  server.requestTimeout = 15_000
  server.setTimeout(70_000)
  server.listen(PORT, '127.0.0.1', () => log(`listening on 127.0.0.1:${PORT} (claude: ${CLAUDE_BIN})`))
}

process.on('SIGTERM', () => { log('SIGTERM'); draining = true; sbState.flush(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000) })
process.on('SIGINT', () => process.exit(0))

main()
