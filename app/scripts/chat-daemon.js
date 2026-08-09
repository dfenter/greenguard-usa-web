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
const MAX_BODY = 64 * 1024
const RATE_LIMIT = 10           // requests/min/email
const SESSION_TTL_MS = 24 * 3600_000

function log(...args) {
  console.log(new Date().toISOString(), '[chat-daemon]', ...args)
}

// ── System prompts ───────────────────────────────────────────────────────────
const CUSTOMER_SYSTEM = (context) => `You are the GreenGuard USA customer assistant. You help the signed-in customer with questions about their CO2 mosquito-control service, their plan, and their billing, and can take safe actions for them.

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

const ADMIN_SYSTEM = () => `You are the GreenGuard USA operations assistant for the owner and field techs. You are a full administrative assistant: you can read routes, look up customers, check tank inventory, text customers, book, reschedule and cancel appointments, add appointment notes, and create, edit and send Stripe invoices. Be terse and direct: answer the question, surface the number, do the task. No marketing language, no emojis, no em dashes.

RULES:
1. Use tools rather than guessing. Look up the customer or route first to get event ids and emails before mutating anything.
2. Scheduling: appointments are Mon-Fri, first start 10:00am CT, last start 5:30pm CT, on the half hour. The tools enforce this; if refused, relay the reason and offer the nearest valid slot.
3. Customers are NEVER notified about reschedules or cancellations, and you never offer to notify them. Booking and calendar changes are silent by design.
4. Billing is one-time invoices only, never subscriptions. Invoices go through the guarded pipeline; if a tool reports an invoice already exists for a visit, say so instead of forcing a duplicate.
5. Appointment notes go on the calendar event (add_appointment_note), never anywhere else.
6. Before cancelling an appointment or sending an invoice, restate what you are about to do in one line (who, when, amount) as part of doing it, so the tech sees exactly what happened.
7. If a tool errors repeatedly, say what failed and which admin page handles it (Rounds, Calendar, Invoice) instead of pretending it worked.

Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: TZ })} (Central Time).`

// ── Session state ────────────────────────────────────────────────────────────
let state = { sessions: {} }
try { state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) } catch {}
if (!state.sessions) state.sessions = {}
function saveState() {
  try { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 1)) } catch (e) { log('state save failed:', e.message) }
}
function sessionFor(audience, email) {
  const key = `${audience}:${email}`
  const s = state.sessions[key]
  if (s && Date.now() - (s.updatedAt || 0) < SESSION_TTL_MS) return s.sessionId
  return null
}
function rememberSession(audience, email, sessionId) {
  state.sessions[`${audience}:${email}`] = { sessionId, updatedAt: Date.now() }
  // prune expired
  for (const [k, v] of Object.entries(state.sessions)) {
    if (Date.now() - (v.updatedAt || 0) > SESSION_TTL_MS) delete state.sessions[k]
  }
  saveState()
}
function forgetSession(audience, email) {
  delete state.sessions[`${audience}:${email}`]
  saveState()
}

// ── Claude run ───────────────────────────────────────────────────────────────
function runClaude({ audience, email, message, history, context, deadlineMs }) {
  return new Promise((resolve) => {
    const reqId = crypto.randomUUID()
    const actionsFile = path.join(SCRATCH, `actions-${reqId}.jsonl`)
    const mcpConfigFile = path.join(SCRATCH, `mcp-${reqId}.json`)
    const childEnv = {
      ...process.env,
      // app/.env carries ANTHROPIC_API_KEY for the portal's API fallback. The
      // CLI must NOT see it or it bills the (empty) API account instead of the
      // subscription login.
      ANTHROPIC_API_KEY: undefined,
      ANTHROPIC_AUTH_TOKEN: undefined,
      PATH: `${process.env.PATH || ''}:${os.homedir()}/.local/bin:/usr/local/bin:/usr/bin:/bin`,
      HOME: os.homedir(),
      GG_CHAT_AUDIENCE: audience,
      GG_CHAT_USER_EMAIL: email,
      GG_CHAT_CONTEXT_JSON: JSON.stringify(context && typeof context === 'object' ? context : {}),
      GG_ACTIONS_FILE: actionsFile,
    }
    // Env is baked into the MCP config too — belt and braces in case the CLI
    // does not pass its full environment down to stdio servers.
    fs.writeFileSync(mcpConfigFile, JSON.stringify({
      mcpServers: {
        gg: {
          command: process.execPath,
          args: [MCP_SERVER],
          env: {
            GG_CHAT_AUDIENCE: audience,
            GG_CHAT_USER_EMAIL: email,
            GG_CHAT_CONTEXT_JSON: childEnv.GG_CHAT_CONTEXT_JSON,
            GG_ACTIONS_FILE: actionsFile,
          },
        },
      },
    }))

    const contextText = typeof context === 'string' ? context : (context?.text || '')
    const system = audience === 'admin' ? ADMIN_SYSTEM() : CUSTOMER_SYSTEM(contextText)

    const resumeId = sessionFor(audience, email)
    const newSessionId = crypto.randomUUID()
    // Resumed sessions already hold the conversation; fresh ones get the
    // portal-side history (last 10 turns) prepended so context carries over.
    let prompt = message
    if (!resumeId && Array.isArray(history) && history.length) {
      const h = history
        .filter((m) => m && typeof m.content === 'string' && ['user', 'assistant'].includes(m.role))
        .slice(-10)
        .map((m) => `${m.role === 'user' ? (audience === 'admin' ? 'Tech' : 'Customer') : 'Assistant'}: ${m.content}`)
        .join('\n')
      if (h) prompt = `Earlier in this conversation:\n${h}\n\nNew message: ${message}`
    }

    const args = [
      '-p',
      '--output-format', 'json',
      '--system-prompt', system,
      '--mcp-config', mcpConfigFile,
      '--strict-mcp-config',
      '--allowedTools', 'mcp__gg',
      '--disallowedTools', 'Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch,Task,NotebookEdit,TodoWrite,KillShell,BashOutput',
      '--max-turns', '12',
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
      // Collect executed tools + escalation flags from the actions file.
      let actions = []
      let escalated = false
      let escalateReason = null
      try {
        for (const line of fs.readFileSync(actionsFile, 'utf8').split('\n')) {
          if (!line.trim()) continue
          try {
            const a = JSON.parse(line)
            actions.push({ name: a.name, summary: a.resultSummary })
            if (a.escalated) { escalated = true; escalateReason = a.escalateReason || null }
          } catch {}
        }
      } catch {}
      try { fs.unlinkSync(actionsFile) } catch {}
      try { fs.unlinkSync(mcpConfigFile) } catch {}

      let parsed = null
      try { parsed = JSON.parse(stdout) } catch {}

      if (killed) {
        return resolve({ ok: false, started: actions.length > 0, error: 'budget exceeded', actions, escalated, escalateReason })
      }
      if (code !== 0 || !parsed || parsed.is_error || typeof parsed.result !== 'string') {
        const errText = (parsed?.result || stderr || stdout || '').slice(0, 400)
        return resolve({ ok: false, started: actions.length > 0, error: `claude exit ${code}: ${errText}`, resumeFailed: !!resumeId, actions, escalated, escalateReason })
      }
      rememberSession(audience, email, parsed.session_id || newSessionId)
      resolve({ ok: true, reply: parsed.result, actions, escalated, escalateReason })
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ ok: false, started: false, error: `spawn failed: ${e.message}` })
    })
  })
}

// ── Queue ────────────────────────────────────────────────────────────────────
let running = 0
const queue = []
function pump() {
  while (running < MAX_CONCURRENT && queue.length) {
    const job = queue.shift()
    if (Date.now() > job.enqueueDeadline) { job.reject503('queued too long'); continue }
    running++
    job.run().finally(() => { running--; pump() })
  }
}

// ── Rate limit ───────────────────────────────────────────────────────────────
const rateBuckets = new Map()
function rateLimited(email) {
  const now = Date.now()
  const bucket = (rateBuckets.get(email) || []).filter((t) => now - t < 60_000)
  bucket.push(now)
  rateBuckets.set(email, bucket)
  return bucket.length > RATE_LIMIT
}

// ── HTTP server ──────────────────────────────────────────────────────────────
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    return sendJson(res, 200, { ok: true, running, queued: queue.length })
  }
  const m = req.url.match(/^\/chat\/(customer|admin)$/)
  if (req.method !== 'POST' || !m) return sendJson(res, 404, { error: 'not found' })
  const audience = m[1]

  // Timing-safe shared-secret check — the Funnel URL is public internet.
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
    const { email, message, history, context } = body || {}
    if (!email || typeof email !== 'string' || !message || typeof message !== 'string') {
      return sendJson(res, 400, { error: 'email and message required' })
    }
    if (message.length > 2000) return sendJson(res, 400, { error: 'message too long' })
    if (rateLimited(email.toLowerCase())) return sendJson(res, 429, { ok: false, started: false, error: 'rate limited' })
    if (queue.length >= MAX_QUEUE) return sendJson(res, 503, { ok: false, started: false, error: 'busy' })

    const deadlineMs = Date.now() + RUN_BUDGET_MS
    const job = {
      enqueueDeadline: Date.now() + 10_000, // if it cannot START within 10s, bail so the portal falls back
      reject503: (why) => sendJson(res, 503, { ok: false, started: false, error: why }),
      run: async () => {
        const t0 = Date.now()
        log(`run ${audience} ${email}: "${message.slice(0, 80)}"`)
        let out = await runClaude({ audience, email: email.toLowerCase(), message, history, context, deadlineMs })
        // A dead/expired --resume session self-heals: forget and retry fresh once.
        if (!out.ok && out.resumeFailed && !out.started && Date.now() < deadlineMs - 15_000) {
          log(`resume failed for ${audience}:${email}, retrying fresh`)
          forgetSession(audience, email.toLowerCase())
          out = await runClaude({ audience, email: email.toLowerCase(), message, history, context, deadlineMs })
        }
        log(`done ${audience} ${email}: ok=${out.ok} started=${out.started !== false} ${Date.now() - t0}ms actions=${(out.actions || []).length}${out.ok ? '' : ' err=' + out.error}`)
        if (out.ok) {
          sendJson(res, 200, { ok: true, reply: out.reply, actions: out.actions, escalated: out.escalated, escalateReason: out.escalateReason })
        } else if (out.started === false) {
          sendJson(res, 503, { ok: false, started: false, error: out.error })
        } else {
          sendJson(res, 500, { ok: false, started: true, error: out.error, actions: out.actions })
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
  fs.mkdirSync(SCRATCH, { recursive: true })
  server.listen(PORT, '127.0.0.1', () => log(`listening on 127.0.0.1:${PORT} (claude: ${CLAUDE_BIN})`))
}

process.on('SIGTERM', () => { log('SIGTERM'); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000) })
process.on('SIGINT', () => process.exit(0))

main()
