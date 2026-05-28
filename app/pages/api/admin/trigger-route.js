// Triggers the weekly route optimizer on the Render agent
// (greenguard-agent-tmw2.onrender.com /cron/route-optimizer). Replaces the
// retired GitHub Actions workflow dispatch. The agent runs the optimizer in
// the background and persists the plan, which /admin/route reads back via
// lib/route-plan.js → /route-plans/latest.

const { requireOwner } = require('../../../lib/auth')

const AGENT_URL = process.env.WEBHOOK_AGENT_URL || 'https://greenguard-agent-tmw2.onrender.com'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await requireOwner(req, res)
  if (!session) return

  const secret = process.env.CRON_SECRET
  if (!secret) return res.status(500).json({ error: 'CRON_SECRET not configured in Vercel' })

  try {
    const resp = await fetch(`${AGENT_URL}/cron/route-optimizer`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
    })
    if (resp.ok) {
      return res.status(200).json({ ok: true, queued: true, note: 'Optimizer running on agent — plan refreshes in ~1-2 min.' })
    }
    const text = await resp.text()
    return res.status(502).json({ error: `Agent returned ${resp.status}: ${text.slice(0, 200)}` })
  } catch (e) {
    return res.status(502).json({ error: `Could not reach route agent: ${e.message}` })
  }
}
