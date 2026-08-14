// Local-first AI chat: try the chat daemon on the office Mac (Claude CLI via
// Tailscale Funnel) before falling back to the metered API path. Mirrors the
// local-first philosophy of notify-queue.js: when the Mac is unreachable the
// portal behaves exactly as it did before this feature existed.
//
// Return contract:
//   { ok:true, reply, actions, escalated, escalateReason }  → use it
//   null                                                    → nothing ran on the
//     Mac (unreachable / busy / unauthorized / not configured): SAFE to fall
//     back to the API assistant.
//   { ok:false, started:true }                              → the Mac RUN STARTED
//     and may have executed tools before failing: do NOT fall back (a second
//     run could re-execute mutations); apologize instead.

const TIMEOUT_MS = 52_000

async function tryLocalChat({ audience, email, message, history, context, images, timeoutMs = TIMEOUT_MS }) {
  const base = (process.env.CHAT_DAEMON_URL || '').replace(/\/$/, '')
  const secret = process.env.CHAT_DAEMON_SECRET
  if (!base || !secret) return null

  let resp
  try {
    resp = await fetch(`${base}/chat/${audience}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-gg-chat-secret': secret },
      body: JSON.stringify({ email, message, history, context, images }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    // Network error or timeout before a response. A timeout here is ambiguous
    // (the run may have started), but daemon-side the run budget (50s) is
    // shorter than our timeout, so a healthy daemon always answers first; a
    // pre-response abort overwhelmingly means unreachable. Fall back.
    console.log(`chat-local: daemon unreachable (${e.name}: ${e.message}) — using API path`)
    return null
  }

  let data
  try { data = await resp.json() } catch { data = {} }

  if (resp.ok && data.ok && typeof data.reply === 'string') {
    return { ok: true, reply: data.reply, actions: data.actions || [], escalated: !!data.escalated, escalateReason: data.escalateReason || null }
  }
  if (data.started) {
    console.error(`chat-local: daemon run started but failed (${resp.status}): ${data.error || 'unknown'}`)
    return { ok: false, started: true }
  }
  // 401/429/503/malformed with nothing started — safe fallback.
  console.log(`chat-local: daemon declined (${resp.status}: ${data.error || 'unknown'}) — using API path`)
  return null
}

const STARTED_BUT_FAILED_REPLY = 'Sorry, I hit a snag finishing that. Please try again in a moment.'

module.exports = { tryLocalChat, STARTED_BUT_FAILED_REPLY }
