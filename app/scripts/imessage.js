/**
 * iMessage sender — the ONLY outbound SMS channel (business decision
 * 2026-07-10: iMessage only, no Twilio). Extracted from local-notify-daemon.js
 * so the appointment watcher can send too; both run inside the same daemon
 * process, which is the process holding the macOS Automation (TCC) grant to
 * control Messages. Do not call this from a different launchd job — it would
 * need its own Automation approval and time out with AppleEvent -1712.
 */
const path = require('path')
const { execFile } = require('child_process')
const { normalizePhone } = require('../lib/sms')

const IMESSAGE_SCRIPT = path.join(__dirname, 'imessage-send.applescript')
const CREATE_GROUP_SCRIPT = path.join(__dirname, 'create-group-thread.applescript')
const GROUP_NAME = 'GreenGuard USA'

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
async function sendViaIMessage({ to, body }) {
  const dest = (Array.isArray(to) ? to : String(to).split(','))
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => normalizePhone(p) || p)
    .join(',')
  const isGroup = dest.includes(',')
  const wantCreate = isGroup && process.env.GROUP_CREATE_GUI === '1'
  try {
    const mode = await runOsascript(
      wantCreate ? [IMESSAGE_SCRIPT, dest, body, 'nofallback'] : [IMESSAGE_SCRIPT, dest, body],
      60000
    )
    return { ok: true, channel: 'imessage', to: dest, sid: null, mode: mode || null }
  } catch (e) {
    if (!(wantCreate && /NO_GROUP_THREAD/.test(e.message))) {
      throw new Error(`iMessage send failed: ${e.message}`)
    }
  }
  try {
    const mode = await runOsascript([CREATE_GROUP_SCRIPT, dest, body, GROUP_NAME], 240000)
    return { ok: true, channel: 'imessage', to: dest, sid: null, mode }
  } catch (e) {
    // Creation failed (screen busy, no Accessibility, UI changed) — never drop
    // the message: individual sends.
    const mode = await runOsascript([IMESSAGE_SCRIPT, dest, body], 60000).catch((e2) => {
      throw new Error(`iMessage send failed: ${e2.message}`)
    })
    return { ok: true, channel: 'imessage', to: dest, sid: null, mode: `${mode} (group create failed: ${e.message.slice(0, 120)})` }
  }
}

module.exports = { sendViaIMessage }
