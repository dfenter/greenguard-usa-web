// Tool-less Claude completion via the office Mac chat-daemon (`claude -p`,
// subscription-billed, Opus at low effort). Same relay as chat-local.js.
// Returns { text } or null when the Mac is unreachable/declines (callers
// fall back to their previous provider so nothing breaks when the Mac is down).

const TIMEOUT_MS = 55_000

async function localComplete({ system, prompt, images = [], json = false, model = 'opus', effort = 'low', timeoutMs = TIMEOUT_MS }) {
  const base = (process.env.CHAT_DAEMON_URL || '').replace(/\/$/, '')
  const secret = process.env.CHAT_DAEMON_SECRET
  if (!base || !secret) return null
  let resp
  try {
    resp = await fetch(`${base}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-gg-chat-secret': secret },
      body: JSON.stringify({ system, prompt, images, json, model, effort }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    console.log(`claude-local: daemon unreachable (${e.name}: ${e.message})`)
    return null
  }
  let data = {}
  try { data = await resp.json() } catch {}
  if (resp.ok && data.ok && typeof data.text === 'string') return { text: data.text, usage: data.usage || null }
  console.log(`claude-local: daemon declined (${resp.status}: ${data.error || 'unknown'})`)
  return null
}

// Fetch an image URL into the daemon's { media_type, data } shape (jpeg/png/webp only).
async function imageFromUrl(imageUrl) {
  const r = await fetch(imageUrl)
  if (!r.ok) throw new Error(`image fetch ${r.status}`)
  const media_type = (r.headers.get('content-type') || 'image/jpeg').split(';')[0]
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(media_type)) return null
  const data = Buffer.from(await r.arrayBuffer()).toString('base64')
  if (data.length > 2_500_000) return null
  return { media_type, data }
}

module.exports = { localComplete, imageFromUrl }
