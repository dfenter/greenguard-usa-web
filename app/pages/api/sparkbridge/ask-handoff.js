// POST { sid, version, page, email?, note?, transcript } -> 200 { ok: true }
// "Ask an Engineer" handoff from the SparkBridge docs widget: emails the thread to
// admin@ with Reply-To set to the visitor when they gave a valid address. Never emails
// the visitor. Public (no session); CORS pinned to the docs site.
// Throttles: 3 per sid per hour, 10 per IP per day (KV incr+expire, in-memory fallback).
const { sendEmail } = require('../../../lib/email')

const ADMIN_TO = 'admin@greenguard-usa.com'
const DOCS_ORIGIN = 'https://docs.greenguard-usa.com'
const DEV_ORIGINS = ['http://localhost:4321', 'http://127.0.0.1:4321']
const SOURCE_PREFIX = `${DOCS_ORIGIN}/sparkbridge/`
const SID_WINDOW_SECONDS = 60 * 60
const SID_MAX = 3
const IP_WINDOW_SECONDS = 24 * 60 * 60
const IP_MAX = 10
const MAX_TURNS = 12
const MAX_CONTENT = 4000
const MAX_NOTE = 1000
const EMAIL_RE = /^[^\s@<>()",;:\\]+@[^\s@<>()",;:\\]+\.[^\s@<>()",;:\\]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const config = { api: { bodyParser: { sizeLimit: '32kb' } } }

let _kv = null
function getKV() {
  if (_kv !== null) return _kv
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) { _kv = false; return _kv }
  try { _kv = require('@vercel/kv').kv } catch (_) { _kv = false }
  return _kv
}

const memory = new Map() // key -> { count, resetAt }
function prune(now) {
  for (const [k, e] of memory) if (e.resetAt <= now) memory.delete(k)
}

/** True while `key` is within `max` requests in its window (counts this one). */
async function claim(key, max, windowSeconds) {
  const kv = getKV()
  if (kv) {
    try {
      const n = await kv.incr(key)
      if (n === 1) await kv.expire(key, windowSeconds)
      return n <= max
    } catch (e) {
      console.error('[sparkbridge-ask-handoff] KV throttle failed, using memory:', e.message)
    }
  }
  const now = Date.now()
  prune(now)
  const e = memory.get(key)
  if (!e || e.resetAt <= now) { memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 }); return true }
  e.count++
  return e.count <= max
}

function clientIp(req) {
  const xff = req.headers?.['x-forwarded-for']
  const first = String(Array.isArray(xff) ? xff[0] : (xff || '')).split(',')[0].trim()
  return first || req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown'
}

function allowedOrigin(origin) {
  if (origin === DOCS_ORIGIN) return true
  return process.env.VERCEL_ENV !== 'production' && DEV_ORIGINS.includes(origin)
}

function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }
  return String(str ?? '').replace(/[&<>"']/g, (c) => map[c])
}

const isStr = (v) => typeof v === 'string'

/** Returns the normalised payload, or null when the body is invalid. */
function validate(body) {
  if (!body || typeof body !== 'object') return null
  const { sid, version, page, email, note, transcript } = body
  if (!isStr(sid) || !UUID_RE.test(sid)) return null
  if (version !== '8.1' && version !== '8.3') return null
  if (!isStr(page) || !page.startsWith('/sparkbridge/') || page.length > 300 || /[\s<>"]/.test(page)) return null
  if (note != null && (!isStr(note) || note.length > MAX_NOTE)) return null
  if (!Array.isArray(transcript) || transcript.length < 1 || transcript.length > MAX_TURNS) return null
  const turns = []
  for (const t of transcript) {
    if (!t || typeof t !== 'object') return null
    if (t.role !== 'user' && t.role !== 'assistant') return null
    if (!isStr(t.content) || t.content.length > MAX_CONTENT) return null
    const sources = []
    if (t.sources != null) {
      if (!Array.isArray(t.sources)) return null
      for (const s of t.sources) {
        if (!s || typeof s !== 'object' || !isStr(s.url) || !s.url.startsWith(SOURCE_PREFIX)) return null
        if (s.title != null && !isStr(s.title)) return null
        sources.push({ title: String(s.title || '').slice(0, 200), url: s.url.slice(0, 500) })
      }
    }
    turns.push({ role: t.role, content: t.content, sources })
  }
  const firstUser = turns.find((t) => t.role === 'user')
  if (!firstUser) return null
  const em = isStr(email) ? email.trim() : ''
  const validEmail = em && em.length <= 254 && EMAIL_RE.test(em) ? em : null
  return { sid, version, page, email: validEmail, note: isStr(note) ? note.trim() : '', turns, firstUser }
}

function buildMessage(p) {
  const question = p.firstUser.content.replace(/\s+/g, ' ').trim().slice(0, 80)
  const subject = `Ask an Engineer: ${question}`
  const pageUrl = `${DOCS_ORIGIN}${p.page}`
  const cited = []
  const seen = new Set()
  for (const t of p.turns) for (const s of t.sources) {
    if (seen.has(s.url)) continue
    seen.add(s.url)
    cited.push(s)
  }
  const label = (role) => (role === 'user' ? 'Visitor:' : 'Assistant:')
  const text = [
    `Page: ${pageUrl}`,
    `Ignition: ${p.version}`,
    `Visitor email: ${p.email || 'none given'}`,
    `Note: ${p.note || 'none'}`,
    '',
    'Transcript',
    '',
    ...p.turns.map((t) => `${label(t.role)}\n${t.content}\n`),
    'Cited pages',
    ...(cited.length ? cited.map((s) => `- ${s.title ? `${s.title}: ` : ''}${s.url}`) : ['none']),
  ].join('\n')
  const html = [
    '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111">',
    `<p><strong>Page:</strong> <a href="${escapeHtml(pageUrl)}">${escapeHtml(pageUrl)}</a><br>`,
    `<strong>Ignition:</strong> ${escapeHtml(p.version)}<br>`,
    `<strong>Visitor email:</strong> ${escapeHtml(p.email || 'none given')}<br>`,
    `<strong>Note:</strong> ${escapeHtml(p.note || 'none')}</p>`,
    '<h3>Transcript</h3>',
    ...p.turns.map((t) => `<p><strong>${label(t.role)}</strong><br><span style="white-space:pre-wrap">${escapeHtml(t.content)}</span></p>`),
    '<h3>Cited pages</h3>',
    cited.length
      ? `<ul>${cited.map((s) => `<li><a href="${escapeHtml(s.url)}">${escapeHtml(s.title || s.url)}</a></li>`).join('')}</ul>`
      : '<p>none</p>',
    '</div>',
  ].join('\n')
  return { subject, text, html }
}

export default async function handler(req, res) {
  const origin = req.headers?.origin
  res.setHeader('Vary', 'Origin')
  if (!isStr(origin) || !allowedOrigin(origin)) return res.status(403).json({ error: 'origin' })
  res.setHeader('Access-Control-Allow-Origin', origin)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Max-Age', '600')
    return res.status(204).end()
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const p = validate(req.body)
  if (!p) return res.status(400).json({ error: 'bad_request' })

  if (!(await claim(`sbask-handoff-sid:${p.sid.toLowerCase()}`, SID_MAX, SID_WINDOW_SECONDS))) return res.status(429).json({ error: 'rate_limited' })
  if (!(await claim(`sbask-handoff-ip:${clientIp(req)}`, IP_MAX, IP_WINDOW_SECONDS))) return res.status(429).json({ error: 'rate_limited' })

  const msg = buildMessage(p)
  try {
    await sendEmail({ to: ADMIN_TO, subject: msg.subject, html: msg.html, ...(p.email ? { replyTo: p.email } : {}) })
  } catch (e) {
    console.error('[sparkbridge-ask-handoff] send failed:', e.message)
    return res.status(502).json({ error: 'send_failed' })
  }
  console.log(`[sparkbridge-ask-handoff] thread for ${p.page} (${p.version}) sent to admin, reply-to ${p.email ? 'set' : 'none'}`)
  return res.status(200).json({ ok: true })
}

handler.buildMessage = buildMessage
handler.validate = validate
