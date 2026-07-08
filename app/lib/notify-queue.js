/**
 * Shared job queue for local-first notification sending, backed by the same
 * Upstash Redis (Vercel KV) instance both the Vercel portal and the local
 * notify daemon can reach over plain REST — no VPC/network requirement.
 *
 * Keys:
 *   notify:daemon:heartbeat   last-seen timestamp (ms), TTL 30s, set by the
 *                             local daemon every ~10s. Vercel checks this
 *                             BEFORE doing anything else — if stale/missing,
 *                             it skips the whole local-first dance and sends
 *                             directly (today's behavior, zero added latency).
 *   notify:queue              LIST of pending job ids (LPUSH by producer,
 *                             RPOP by the local daemon only).
 *   notify:job:<id>           JSON blob of the job + status, TTL 1h.
 *
 * Job statuses: pending -> claimed-by-local -> sent-by-local | failed-by-local
 *               pending -> sent-by-backup (Vercel did it itself)
 */

const HEARTBEAT_KEY = 'notify:daemon:heartbeat'
const HEARTBEAT_TTL_SEC = 30
const QUEUE_KEY = 'notify:queue'
const JOB_TTL_SEC = 3600

function kvUrl() {
  const url = process.env.KV_REST_API_URL
  if (!url) throw new Error('KV_REST_API_URL is not set')
  return url
}
function kvToken() {
  const token = process.env.KV_REST_API_TOKEN
  if (!token) throw new Error('KV_REST_API_TOKEN is not set')
  return token
}

// Raw Upstash Redis REST command call — POST an array like ["SET","key","val"].
// Using the raw command endpoint (not the path-shorthand one) so options like
// NX/EX/GET are expressible without fighting URL-encoding edge cases.
async function kv(command) {
  const r = await fetch(kvUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  })
  const j = await r.json()
  if (j.error) throw new Error(`KV error for ${JSON.stringify(command)}: ${j.error}`)
  return j.result
}

function isKvConfigured() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

/** True if the local daemon has heartbeated recently. Never throws — treats
 *  any error (KV unset, network blip) as "daemon not available". */
async function isDaemonAlive() {
  if (!isKvConfigured()) return false
  try {
    const val = await kv(['GET', HEARTBEAT_KEY])
    return !!val
  } catch {
    return false
  }
}

/** Called by the daemon every ~10s to announce it's alive. */
async function heartbeat() {
  await kv(['SET', HEARTBEAT_KEY, String(Date.now()), 'EX', String(HEARTBEAT_TTL_SEC)])
}

/** Enqueue a send job. Returns the job id. */
async function enqueue(payload) {
  const id = require('crypto').randomUUID()
  const job = { id, status: 'pending', createdAt: Date.now(), ...payload }
  await kv(['SET', `notify:job:${id}`, JSON.stringify(job), 'EX', String(JOB_TTL_SEC)])
  await kv(['LPUSH', QUEUE_KEY, id])
  return id
}

async function getJob(id) {
  const raw = await kv(['GET', `notify:job:${id}`])
  return raw ? JSON.parse(raw) : null
}

async function setJobStatus(id, status, extra = {}) {
  const job = await getJob(id)
  if (!job) return
  const updated = { ...job, ...extra, status }
  await kv(['SET', `notify:job:${id}`, JSON.stringify(updated), 'EX', String(JOB_TTL_SEC)])
}

/** Daemon-side: pop the next pending job id, or null if the queue is empty. */
async function popNext() {
  return kv(['RPOP', QUEUE_KEY])
}

/** Vercel-backup-side: try to exclusively remove a specific job id from the
 *  queue so the daemon can no longer pop (and duplicate-send) it. Returns
 *  true if this call actually removed it (i.e. the daemon hadn't popped it
 *  yet), false if it was already gone (daemon already has it). */
async function claimForBackup(id) {
  const removed = await kv(['LREM', QUEUE_KEY, '1', id])
  return removed === 1
}

const LOCAL_GRACE_MS = 5000
const LOCAL_POLL_MS = 300

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

/**
 * Generic local-first send orchestration, shared by every notification channel
 * (email via lib/email.js, SMS via lib/sms.js, ...).
 *
 * `payload` MUST include a `kind` field ('email' | 'sms' | ...) so the local
 * daemon knows which direct-sender to dispatch to. `directFn` is that same
 * channel's original direct sender — "the current method" — used verbatim as
 * the backup path.
 *
 * Behavior:
 *  - Daemon not alive (or KV unset) → call directFn immediately. ZERO added
 *    latency, byte-for-byte the pre-local-first behavior.
 *  - Daemon alive → enqueue, poll up to 5s for the daemon to send it locally.
 *    On success, return the daemon's stored send result with `sentBy:'local'`
 *    grafted on (so callers reading result.data.id / result.sid still work).
 *    On daemon-reported failure or timeout, atomically claim the job away from
 *    the queue (so the daemon can't also send it) and fall through to directFn.
 */
async function sendLocalFirst(payload, directFn) {
  if (!isKvConfigured() || !(await isDaemonAlive())) {
    return directFn(payload)
  }

  let id
  try {
    id = await enqueue(payload)
  } catch (e) {
    console.warn('notify-queue enqueue failed (%s) — sending directly', e.message)
    return directFn(payload)
  }

  const deadline = Date.now() + LOCAL_GRACE_MS
  while (Date.now() < deadline) {
    await sleep(LOCAL_POLL_MS)
    let job
    try {
      job = await getJob(id)
    } catch {
      break // KV hiccup mid-wait — fall through to backup below
    }
    if (job?.status === 'sent-by-local') {
      return { ...(job.result || {}), sentBy: 'local' }
    }
    if (job?.status === 'failed-by-local') {
      console.warn('local daemon failed %s job %s (%s) — sending via backup now', payload.kind, id, job.error)
      break // fail fast to backup rather than waiting out the grace window
    }
  }

  // Backup path: claim the job away from the queue (in case the daemon is just
  // slow, not dead) so it can't also send it, then send via the current method.
  try {
    await claimForBackup(id)
    const finalCheck = await getJob(id)
    if (finalCheck?.status === 'sent-by-local') {
      return { ...(finalCheck.result || {}), sentBy: 'local' }
    }
  } catch (e) {
    console.warn('notify-queue backup claim failed (%s) — sending anyway', e.message)
  }

  const result = await directFn(payload)
  setJobStatus(id, 'sent-by-backup').catch(() => {})
  return result
}

module.exports = {
  isKvConfigured, isDaemonAlive, heartbeat, enqueue, getJob, setJobStatus, popNext, claimForBackup,
  sendLocalFirst,
}
