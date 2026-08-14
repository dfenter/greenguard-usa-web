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

const ADMIN_SYSTEM = () => `You are the GreenGuard USA operations assistant for the owner and field techs. You are a full administrative assistant: you can read routes, look up customers, check tank inventory, text customers, book, reschedule and cancel appointments, take notes, and create, edit and send Stripe invoices. Be terse and direct: answer the question, surface the number, do the task. No marketing language, no emojis, no em dashes.

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
function runClaude({ audience, email, message, history, context, images, deadlineMs }) {
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
      '--allowedTools', `mcp__gg,Read(/${SCRATCH}/**)`,
      '--disallowedTools', 'Bash,Write,Edit,Glob,Grep,WebFetch,WebSearch,Task,NotebookEdit,TodoWrite,KillShell,BashOutput',
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
      rememberSession(audience, email, parsed.session_id || newSessionId)
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
const queue = []
function pump() {
  while (running < MAX_CONCURRENT && queue.length) {
    const job = queue.shift()
    if (Date.now() > job.enqueueDeadline) { job.reject503('queued too long'); continue }
    running++
    job.run().finally(() => { running--; pump() })
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
    const { email, message, history, context, images } = body || {}
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
    if (rateLimited(email.toLowerCase())) return sendJson(res, 429, { ok: false, started: false, error: 'rate limited' })
    if (queue.length >= MAX_QUEUE) return sendJson(res, 503, { ok: false, started: false, error: 'busy' })

    const deadlineMs = Date.now() + RUN_BUDGET_MS
    const job = {
      enqueueDeadline: Date.now() + 10_000, // if it cannot START within 10s, bail so the portal falls back
      reject503: (why) => sendJson(res, 503, { ok: false, started: false, error: why }),
      run: async () => {
        const t0 = Date.now()
        const lc = email.toLowerCase()
        log(`run ${audience} ${email}: "${message.slice(0, 80)}"`)
        // Serialize per user so concurrent turns don't share one resume session.
        let out = await withUserLock(`${audience}:${lc}`, async () => {
          let r = await runClaude({ audience, email: lc, message, history: capHistory, context: capContext, images: capImages, deadlineMs })
          // A dead/expired --resume session self-heals: forget and retry fresh
          // once — ONLY when nothing started (guards against re-running a
          // partially-applied mutation, finding #1).
          if (!r.ok && r.resumeFailed && !r.started && Date.now() < deadlineMs - 15_000) {
            log(`resume failed for ${audience}:${email}, retrying fresh`)
            forgetSession(audience, lc)
            r = await runClaude({ audience, email: lc, message, history: capHistory, context: capContext, images: capImages, deadlineMs })
          }
          return r
        })
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
  fs.mkdirSync(SCRATCH, { recursive: true, mode: 0o700 })
  try { fs.chmodSync(SCRATCH, 0o700) } catch {}
  // Slowloris/idle-socket defense (finding #11): drop connections that don't
  // send headers+body promptly and cap how long the funnel proxy may hold one.
  server.headersTimeout = 10_000
  server.requestTimeout = 15_000
  server.setTimeout(70_000)
  server.listen(PORT, '127.0.0.1', () => log(`listening on 127.0.0.1:${PORT} (claude: ${CLAUDE_BIN})`))
}

process.on('SIGTERM', () => { log('SIGTERM'); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000) })
process.on('SIGINT', () => process.exit(0))

main()
