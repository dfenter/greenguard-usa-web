/**
 * iMessage sender — the ONLY outbound SMS channel (business decision
 * 2026-07-10: iMessage only, no Twilio). Extracted from local-notify-daemon.js
 * so the appointment watcher can send too; both run inside the same daemon
 * process, which is the process holding the macOS Automation (TCC) grant to
 * control Messages. Do not call this from a different launchd job — it would
 * need its own Automation approval and time out with AppleEvent -1712.
 */
const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { normalizePhone } = require('../lib/sms')

const IMESSAGE_SCRIPT = path.join(__dirname, 'imessage-send.applescript')
const CREATE_GROUP_SCRIPT = path.join(__dirname, 'create-group-thread.applescript')

function runOsascript(args, timeout) {
  return new Promise((resolve, reject) => {
    execFile('osascript', args, { timeout }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message || '').trim()))
      resolve((stdout || '').trim())
    })
  })
}

// Send an iMessage via the Messages app (AppleScript). Rejects on any failure
// (permission not granted, number not iMessage-reachable, Messages offline) so
// the caller can mark the job failed / retry.
// `to` may be a single phone, an array, or a comma-separated list — multiple
// recipients send into the matching existing group chat (everyone sees
// replies; the thread keeps its name, e.g. "GreenGuard USA").
// When no group thread exists yet and GROUP_CREATE_GUI=1, the daemon
// GUI-creates the thread (named + GreenGuard icon) with this message as its
// first text — Messages visibly takes over the screen for ~30s and the run
// aborts safely if someone is actively typing (focus guard), in which case —
// like when the flag is off or creation fails — it falls back to individual
// 1:1 sends so nobody misses the message.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Deferred group creation (2026-08-13). GUI creation needs the Mac free; when
// it can't run, the customer still gets a 1:1 text on time and the participant
// set is parked here. retryDeferredGroups() (called by the daemon when the Mac
// is idle) creates the thread with a low-key message, after which every future
// send for that customer routes into the group.
const DEFERRED_PATH = path.join(__dirname, 'deferred-groups.json')
function readDeferred() {
  try { return JSON.parse(fs.readFileSync(DEFERRED_PATH, 'utf8')) } catch { return {} }
}
function deferGroupCreation(dest) {
  try {
    const all = readDeferred()
    if (!all[dest]) {
      all[dest] = { queuedAt: Date.now(), attempts: 0 }
      fs.writeFileSync(DEFERRED_PATH, JSON.stringify(all, null, 1))
    }
  } catch { /* best effort */ }
}

async function humanIdleSeconds() {
  try {
    const out = await new Promise((resolve, reject) => {
      execFile('/bin/sh', ['-c', "ioreg -n IOHIDSystem -r -d 1 | awk '/HIDIdleTime/ {print int($NF/1000000000); exit}'"], { timeout: 10000 },
        (err, stdout) => (err ? reject(err) : resolve(stdout)))
    })
    return parseInt(String(out).trim(), 10) || 0
  } catch { return 0 }
}

// Create any parked group threads, newest first. Only runs when the human has
// been idle for IDLE_REQUIRED_SEC so it never fights someone at the keyboard.
const IDLE_REQUIRED_SEC = 300
async function retryDeferredGroups(log) {
  const all = readDeferred()
  const pending = Object.keys(all)
  if (!pending.length) return
  if ((await humanIdleSeconds()) < IDLE_REQUIRED_SEC) return
  for (const dest of pending) {
    // Thread may already exist (a later reminder created it) — a probe send
    // with nofallback tells us without sending anything if it doesn't.
    try {
      const body = 'GreenGuard USA: this thread now includes your service techs, so you can reach us here anytime.'
      const mode = await runOsascript([CREATE_GROUP_SCRIPT, dest, body], 300000)
      log(`deferred group created for ${dest} [${mode}]`)
      delete all[dest]
    } catch (e) {
      all[dest].attempts = (all[dest].attempts || 0) + 1
      log(`deferred group creation failed for ${dest} (attempt ${all[dest].attempts}): ${e.message.slice(0, 120)}`)
      if (all[dest].attempts >= 10) {
        delete all[dest]
        log(`giving up on deferred group for ${dest} — create it by hand in Messages`)
      }
      break // Mac likely busy again; try the rest on the next pass
    }
  }
  try { fs.writeFileSync(DEFERRED_PATH, JSON.stringify(all, null, 1)) } catch { /* best effort */ }
}

// Post-send delivery verification (2026-08-10). AppleScript "success" only
// means Messages ACCEPTED the text — Apple-side failures (number not
// iMessage-registered, SMS relay down) are visible solely in chat.db's
// is_sent/error columns. Requires Full Disk Access for /usr/local/bin/node
// (granted via TCC.db insert 2026-08-10); on any sqlite error we log and
// treat the send as unverified rather than failed. Discovered the hard way:
// ~8 customers silently got NO texts for a month (error 22) because Text
// Message Forwarding was off and nothing ever read these flags.
const CHAT_DB = path.join(process.env.HOME || '/Users/lucille', 'Library/Messages/chat.db')
function queryChatDb(sql) {
  return new Promise((resolve, reject) => {
    execFile('sqlite3', ['-readonly', CHAT_DB, sql], { timeout: 15000 }, (err, stdout) => {
      if (err) return reject(err)
      resolve((stdout || '').trim().split('\n').filter(Boolean).map((l) => l.split('|')))
    })
  })
}

// Returns { failed: [chat_identifier,...], checked: n }. Matches outbound
// rows since `sinceEpochSec` whose text starts with the sent body's first
// 40 chars (single quotes doubled for SQL).
async function checkDelivery(body, sinceEpochSec) {
  const prefix = String(body).slice(0, 40).replace(/'/g, "''").replace(/[%_]/g, '')
  const rows = await queryChatDb(
    `SELECT c.chat_identifier, m.is_sent, m.error FROM message m ` +
    `JOIN chat_message_join cmj ON cmj.message_id=m.ROWID ` +
    `JOIN chat c ON c.ROWID=cmj.chat_id ` +
    `WHERE m.is_from_me=1 AND m.date/1000000000+978307200 >= ${Math.floor(sinceEpochSec)} ` +
    `AND m.text LIKE '${prefix}%'`
  )
  return {
    checked: rows.length,
    failed: rows.filter(([, isSent, error]) => isSent !== '1' || error !== '0').map(([chat]) => chat),
  }
}

async function alertAdmin(text) {
  const admin = normalizePhone(process.env.ADMIN_SMS_NUMBER)
  if (!admin) return
  await runOsascript([IMESSAGE_SCRIPT, admin, text], 60000).catch(() => {})
}

// Wait, then verify a just-sent message against chat.db. Throws on confirmed
// failure (caller marks the job failed) after alerting the admin. Set
// VERIFY_DELIVERY=0 to disable.
async function verifyOrThrow({ body, sentAtSec, dest }) {
  if (process.env.VERIFY_DELIVERY === '0') return
  await sleep(30000)
  let result
  try {
    result = await checkDelivery(body, sentAtSec - 10)
  } catch (e) {
    console.warn(`[imessage] delivery verification unavailable (${e.message.slice(0, 80)}) — send assumed OK`)
    return
  }
  if (result.checked === 0) {
    console.warn('[imessage] delivery verification found no matching message row — send assumed OK')
    return
  }
  if (result.failed.length === 0) return
  const detail = `text to ${dest} FAILED Apple-side delivery (chat: ${result.failed.join(', ')}). Body: "${String(body).slice(0, 80)}"`
  await alertAdmin(`GreenGuard alert: ${detail}`)
  throw new Error(`delivery failed: ${detail}`)
}

async function sendViaIMessage({ to, body }) {
  const dest = (Array.isArray(to) ? to : String(to).split(','))
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => normalizePhone(p) || p)
    .join(',')
  const isGroup = dest.includes(',')
  const wantCreate = isGroup && process.env.GROUP_CREATE_GUI === '1'
  const sentAtSec = Date.now() / 1000
  const verified = async (mode) => {
    await verifyOrThrow({ body, sentAtSec, dest })
    return { ok: true, channel: 'imessage', to: dest, sid: null, mode: mode || null }
  }
  try {
    const mode = await runOsascript(
      wantCreate ? [IMESSAGE_SCRIPT, dest, body, 'nofallback'] : [IMESSAGE_SCRIPT, dest, body],
      60000
    )
    return await verified(mode)
  } catch (e) {
    if (!(wantCreate && /NO_GROUP_THREAD/.test(e.message))) {
      throw new Error(`iMessage send failed: ${e.message}`)
    }
  }
  try {
    const mode = await runOsascript([CREATE_GROUP_SCRIPT, dest, body], 300000)
    return await verified(mode)
  } catch (e) {
    if (/delivery failed/.test(e.message)) throw e
    // Creation failed (screen busy, Messages not ready, UI changed). Before
    // falling back, check whether the GUI script already delivered the body —
    // it types and sends BEFORE the steps that most often fail, so a blind
    // retry double-texts the customer (seen 8/10-8/12). Only send individually
    // when chat.db shows the body never went out.
    let alreadySent = false
    try {
      const { checked, failed } = await checkDelivery(body, sentAtSec - 10)
      alreadySent = checked > 0 && failed.length === 0
    } catch {
      // chat.db unreadable: fall through and send (a duplicate beats a miss).
    }
    if (alreadySent) {
      return { ok: true, channel: 'imessage', to: dest, sid: null, mode: `sent-group (creation reported "${e.message.slice(0, 60)}" but message was delivered)` }
    }
    // GUI creation needs an idle Mac (keystrokes go to the frontmost app, so
    // assertFront aborts when someone is working — Donald Schrader 8/13, and
    // reminders fire during business hours when the Mac is usually in use).
    // The customer still gets their reminder now via 1:1; remember the group
    // so an idle-time pass can create the thread later, after which every
    // future send for them is a group text.
    if (/focus stolen|MESSAGES_NOT_READY/.test(e.message)) deferGroupCreation(dest)
    // Never drop the message: individual sends.
    const mode = await runOsascript([IMESSAGE_SCRIPT, dest, body], 60000).catch((e2) => {
      throw new Error(`iMessage send failed: ${e2.message}`)
    })
    return await verified(`${mode} (group create failed: ${e.message.slice(0, 120)})`)
  }
}

module.exports = { sendViaIMessage, retryDeferredGroups }
