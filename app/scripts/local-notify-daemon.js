#!/usr/bin/env node
/**
 * Local-first notification daemon.
 *
 * Runs continuously on this Mac (via launchd, see the .plist in this same
 * directory). Polls the shared notify queue (Upstash Redis / Vercel KV) for
 * jobs enqueued by the portal's lib/email.js sendEmail(), sends them directly
 * from this machine's network path (same Resend-then-Gmail logic as before,
 * via lib/email.js's sendEmailDirect — NOT duplicated here), and marks them
 * done. Also heartbeats every ~10s so the portal knows to route new sends
 * through this daemon instead of sending them itself.
 *
 * If this process is not running (or its heartbeat goes stale), the portal
 * transparently falls back to sending directly — "the current method" — with
 * no code changes needed there. This script can be killed, crash, or have the
 * Mac go to sleep at any time with zero risk to notification delivery.
 *
 * Manual run (foreground, for testing):
 *   node scripts/local-notify-daemon.js
 * Managed run: see scripts/com.greenguard.notify-daemon.plist
 */

// Minimal .env loader (no dotenv dependency) — launchd doesn't source the
// shell profile, so env vars must come from this file or the plist itself.
function loadEnvFile(path) {
  const fs = require('fs')
  if (!fs.existsSync(path)) return
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!m) continue
    const key = m[1]
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

const path = require('path')
loadEnvFile(path.join(__dirname, '..', '.env'))
loadEnvFile(path.join(__dirname, '..', '.env.local'))

const { execFile } = require('child_process')
const notifyQueue = require('../lib/notify-queue')
const { sendEmailDirect } = require('../lib/email')
const { normalizePhone } = require('../lib/sms')

// iMessage is the ONLY SMS channel this daemon sends through (business
// decision 2026-07-10: iMessage only, no Twilio). The macOS Automation
// permission for this daemon's node process to control Messages has been
// granted and verified end-to-end. SMS_CHANNEL is intentionally no longer
// read here — there is no Twilio branch to fall back to.
const IMESSAGE_SCRIPT = path.join(__dirname, 'imessage-send.applescript')

// Send an iMessage via the Messages app (AppleScript). Rejects on any failure
// (permission not granted, number not iMessage-reachable, Messages offline) so
// the caller marks the job failed and the producer's backup path handles it.
//
// NOTE: there is deliberately NO blanket "mirror every message to a monitor
// number" here. Customer-facing texts (appointment reminders, review asks,
// post-visit thank-yous) go ONLY to the customer. Owner alerts reach the owner
// numbers because the producer addresses them there directly (agent
// ALERT_SMS_NUMBERS, twilio webhook forward), not via a copy of every send.
function sendViaIMessage({ to, body }) {
  const dest = normalizePhone(to) || to
  return new Promise((resolve, reject) => {
    execFile('osascript', [IMESSAGE_SCRIPT, dest, body], { timeout: 35000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`iMessage send failed: ${(stderr || err.message || '').trim()}`))
      resolve({ ok: true, channel: 'imessage', to: dest, sid: null })
    })
  })
}

// Dispatch table: job.kind -> the channel's direct sender. Add new channels
// here (and a matching sendLocalFirst({ kind: ... }) producer) to route them
// local-first too.
const SENDERS = {
  email: (job) => sendEmailDirect({ to: job.to, subject: job.subject, html: job.html, bcc: job.bcc, from: job.from }),
  sms: (job) => sendViaIMessage({ to: job.to, body: job.body }),
}

const POLL_INTERVAL_MS = 1000
const HEARTBEAT_INTERVAL_MS = 10000

function log(...args) { console.log(new Date().toISOString(), '[notify-daemon]', ...args) }

let running = true
process.on('SIGINT', () => { log('shutting down (SIGINT)'); running = false })
process.on('SIGTERM', () => { log('shutting down (SIGTERM)'); running = false })

async function heartbeatLoop() {
  while (running) {
    try {
      await notifyQueue.heartbeat()
    } catch (e) {
      log('heartbeat failed:', e.message)
    }
    await new Promise((r) => setTimeout(r, HEARTBEAT_INTERVAL_MS))
  }
}

async function processOne(id) {
  const job = await notifyQueue.getJob(id)
  if (!job) {
    log(`job ${id} vanished (expired?) — skipping`)
    return
  }
  if (job.status !== 'pending') {
    log(`job ${id} already in status ${job.status} — skipping`)
    return
  }
  const kind = job.kind || 'email'
  const sender = SENDERS[kind]
  if (!sender) {
    // Unknown kind — leave it pending so the portal's backup path handles it
    // rather than us marking it done and silently dropping it.
    log(`job ${id} has unknown kind "${kind}" — leaving for portal backup`)
    await notifyQueue.setJobStatus(id, 'pending')
    return
  }
  await notifyQueue.setJobStatus(id, 'claimed-by-local')
  try {
    const result = await sender(job)
    // Some direct senders (SMS) report failure via { ok:false } instead of
    // throwing — treat that as a failure so the portal backup retries it.
    if (result && result.ok === false) {
      throw new Error(result.error || 'sender returned ok:false')
    }
    // Store the FULL result so the producer can read result.data.id (email) or
    // result.sid (SMS) unchanged when it returns to its caller.
    await notifyQueue.setJobStatus(id, 'sent-by-local', { result })
    const label = job.subject || (job.body ? job.body.slice(0, 40) : kind)
    log(`sent ${kind} job ${id} to ${job.to} (${label})`)
  } catch (e) {
    await notifyQueue.setJobStatus(id, 'failed-by-local', { error: e.message })
    log(`FAILED ${kind} job ${id} to ${job.to}: ${e.message} (portal backup will retry)`)
  }
}

async function pollLoop() {
  while (running) {
    try {
      const id = await notifyQueue.popNext()
      if (id) {
        await processOne(id)
        continue // check for another job immediately, no sleep
      }
    } catch (e) {
      log('poll error:', e.message)
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
}

async function main() {
  if (!notifyQueue.isKvConfigured()) {
    log('FATAL: KV_REST_API_URL / KV_REST_API_TOKEN not set — cannot run')
    process.exit(1)
  }
  log(`starting — polling every ${POLL_INTERVAL_MS}ms, heartbeat every ${HEARTBEAT_INTERVAL_MS}ms, SMS channel=imessage-only`)
  await notifyQueue.heartbeat()
  log('heartbeat OK — portal will now route sends through this daemon')
  await Promise.all([heartbeatLoop(), pollLoop()])
  log('stopped')
}

main().catch((e) => { console.error('[notify-daemon] fatal:', e); process.exit(1) })
