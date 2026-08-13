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
const { execFile } = require('child_process')
loadEnvFile(path.join(__dirname, '..', '.env'))
loadEnvFile(path.join(__dirname, '..', '.env.local'))

const notifyQueue = require('../lib/notify-queue')
const { sendEmailDirect } = require('../lib/email')

// iMessage is the ONLY SMS channel this daemon sends through (business
// decision 2026-07-10: iMessage only, no Twilio). The macOS Automation
// permission for this daemon's node process to control Messages has been
// granted and verified end-to-end. SMS_CHANNEL is intentionally no longer
// read here — there is no Twilio branch to fall back to. The sender lives in
// scripts/imessage.js so the appointment watcher (same process, same TCC
// grant) can send too.
//
// NOTE: there is deliberately NO blanket "mirror every message to a monitor
// number" here. Customer-facing texts (appointment reminders, review asks,
// post-visit thank-yous) go ONLY to the customer. Owner alerts reach the owner
// numbers because the producer addresses them there directly (agent
// ALERT_SMS_NUMBERS, twilio webhook forward), not via a copy of every send.
const { sendViaIMessage } = require('./imessage')

// Dispatch table: job.kind -> the channel's direct sender. Add new channels
// here (and a matching sendLocalFirst({ kind: ... }) producer) to route them
// local-first too.
const SENDERS = {
  email: (job) => sendEmailDirect({ to: job.to, subject: job.subject, html: job.html, bcc: job.bcc, from: job.from }),
  sms: (job) => sendViaIMessage({ to: job.to, body: job.body }),
}

// KV budget: Upstash free tier caps at 500K requests/month. At 1s poll + 10s
// heartbeat this daemon alone burned ~2.85M/month, exhausting the cap in ~5 days
// and making every claim_*() dedup fail open (duplicate digest + duplicate
// customer texts). Idle poll is now every 15 min (~3K/month); heartbeat is every
// 5 min against an 11-min liveness TTL (survives one missed beat) so the portal
// still routes through it. Total idle usage ~12K/month, well under the cap.
// The loop still drains with no sleep while jobs are queued; the 15-min interval
// only bounds worst-case pickup latency for a job enqueued while idle (the portal
// has a synchronous Resend/Gmail backup for anything time-sensitive).
const POLL_INTERVAL_MS = 15 * 60 * 1000
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000 // must stay < heartbeat key TTL (11min)

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
    const mode = result && result.mode ? ` [${result.mode}]` : ''
    log(`sent ${kind} job ${id} to ${job.to}${mode} (${label})`)
  } catch (e) {
    // An Apple-side delivery failure means this number is unreachable by text
    // (not iMessage-registered and SMS relay couldn't take it) — the text is
    // impossible, so reach the customer by email instead when the calendar has
    // one (owner-approved swap 2026-08-10, not a double-notify). The job still
    // reports failed either way so the failure is never invisible.
    if (kind === 'sms' && /delivery failed/.test(e.message)) {
      try {
        const { findEmailByPhone, textBodyToEmail } = require('./appointment-watcher')
        const customerPhone = String(job.to).split(',')[0].trim()
        const email = await findEmailByPhone(customerPhone)
        if (email) {
          const subject = /reminder/i.test(job.body || '') ? 'Appointment reminder from GreenGuard USA' : 'A message from GreenGuard USA'
          const { html } = textBodyToEmail(subject, job.body || '')
          const { sendEmailDirect } = require('../lib/email')
          await sendEmailDirect({ to: email, subject, html })
          log(`sms job ${id} undeliverable to ${customerPhone} — content sent by EMAIL to ${email}`)
        } else {
          log(`sms job ${id} undeliverable to ${customerPhone} and no email found in calendar — admin alerted only`)
        }
      } catch (e2) {
        log(`email fallback for sms job ${id} FAILED: ${e2.message}`)
      }
    }
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
    // Create any group threads that couldn't be made while the Mac was in use
    // (customer already got a 1:1 text; this upgrades them for future sends).
    try {
      const { retryDeferredGroups } = require('./imessage')
      await retryDeferredGroups(log)
    } catch (e) {
      log('deferred group retry error:', e.message)
    }
    await maybeRenameGroups()
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
}

// End-of-day pass (Dan 2026-08-10): rename the day's daemon-created group
// threads to "GreenGuard USA". Runs once per day in the 6-11 PM window; a
// failed attempt (screen locked, focus stolen) retries on the next poll until
// the window closes. The script itself is a GUI no-op when every group is
// already named, and SMS/MMS groups are skipped — Apple only supports naming
// pure-iMessage groups. Needs the same Accessibility grant as group creation.
const RENAME_SCRIPT = path.join(__dirname, 'rename-group-threads.applescript')
let lastRenameDay = null
async function maybeRenameGroups() {
  if (process.env.GROUP_CREATE_GUI !== '1') return
  const now = new Date()
  const day = now.toLocaleDateString('en-CA')
  const hour = now.getHours()
  if (hour < 18 || hour >= 23 || lastRenameDay === day) return
  try {
    const out = await new Promise((resolve, reject) => {
      execFile('osascript', [RENAME_SCRIPT, 'GreenGuard USA'], { timeout: 600000 }, (err, stdout, stderr) => {
        if (err) return reject(new Error((stderr || err.message || '').trim()))
        resolve((stdout || '').trim())
      })
    })
    lastRenameDay = day
    if (out !== 'no-candidates') log(`group rename pass: ${out}`)
  } catch (e) {
    log(`group rename pass failed (will retry next poll): ${e.message.slice(0, 160)}`)
  }
}

async function main() {
  if (!notifyQueue.isKvConfigured()) {
    log('FATAL: KV_REST_API_URL / KV_REST_API_TOKEN not set — cannot run')
    process.exit(1)
  }
  log(`starting — polling every ${POLL_INTERVAL_MS}ms, heartbeat every ${HEARTBEAT_INTERVAL_MS}ms, SMS channel=imessage-only`)
  // Startup heartbeat is best-effort: if the KV is unreachable or over its
  // request quota, log and keep running (heartbeatLoop/pollLoop already tolerate
  // KV errors). Exiting here caused a crash-loop that hammered the KV on every
  // relaunch — the daemon must stay up and self-heal when the KV recovers.
  try {
    await notifyQueue.heartbeat()
    log('heartbeat OK — portal will now route sends through this daemon')
  } catch (e) {
    log('startup heartbeat failed (KV unavailable) — staying up, will retry:', e.message)
  }
  // Booking lifecycle notifications (assessment welcome text, inside-48h
  // reschedule notice). Runs in THIS process on purpose: Mac-first sends and
  // the existing Messages Automation grant. GCal polling, zero KV usage.
  try {
    require('./appointment-watcher').start(log)
  } catch (e) {
    log('appointment watcher failed to start (queue draining unaffected):', e.message)
  }
  await Promise.all([heartbeatLoop(), pollLoop()])
  log('stopped')
}

main().catch((e) => { console.error('[notify-daemon] fatal:', e); process.exit(1) })
