// POST /api/gtm/chat
// Body: { message, history: [{role, content}] }
//
// Internal GTM (MBA program) assistant. Local-only (Mac chat daemon): never
// calls the metered Anthropic API. If the daemon is unreachable, the reply
// says so plainly rather than falling back.

const { requireGtm } = require('../../../lib/auth')
const { tryLocalChat, STARTED_BUT_FAILED_REPLY } = require('../../../lib/chat-local')

export const config = { maxDuration: 60 }

const MAX_MESSAGE_LEN = 4000
const MAX_HISTORY = 20

export default async function handler(req, res) {
  const session = await requireGtm(req, res)
  if (!session) return

  if (req.method !== 'POST') return res.status(405).end()

  const { message, history } = req.body || {}
  if (typeof message !== 'string' || !message.trim()) return res.status(400).json({ error: 'message required' })
  if (message.length > MAX_MESSAGE_LEN) return res.status(400).json({ error: 'message too long' })

  const cleanHistory = Array.isArray(history)
    ? history.filter((m) => m && typeof m.content === 'string' && ['user', 'assistant'].includes(m.role)).slice(-MAX_HISTORY)
    : []

  try {
    const local = await tryLocalChat({ audience: 'gtm', email: session.email, message, history: cleanHistory })

    if (local === null) {
      return res.status(200).json({ reply: 'The assistant is offline right now (the office Mac is unreachable). Try again in a few minutes.' })
    }
    if (!local.ok) {
      return res.status(200).json({ reply: STARTED_BUT_FAILED_REPLY })
    }
    return res.status(200).json({ reply: local.reply })
  } catch (e) {
    console.error('gtm chat error:', e.message)
    return res.status(500).json({ error: 'Chat unavailable right now.' })
  }
}
