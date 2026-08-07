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

// Send an iMessage via the Messages app (AppleScript). Rejects on any failure
// (permission not granted, number not iMessage-reachable, Messages offline) so
// the caller can mark the job failed / retry.
// `to` may be a single phone, an array, or a comma-separated list — multiple
// recipients become one group iMessage (everyone sees replies).
function sendViaIMessage({ to, body }) {
  const dest = (Array.isArray(to) ? to : String(to).split(','))
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => normalizePhone(p) || p)
    .join(',')
  return new Promise((resolve, reject) => {
    execFile('osascript', [IMESSAGE_SCRIPT, dest, body], { timeout: 35000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`iMessage send failed: ${(stderr || err.message || '').trim()}`))
      resolve({ ok: true, channel: 'imessage', to: dest, sid: null })
    })
  })
}

module.exports = { sendViaIMessage }
