// Fetches the latest weekly route plan from the Render webhook server,
// which is where weekly_route_optimizer.py persists results since the
// GitHub Actions route-optimizer workflow was retired.
//
// Falls back to the legacy on-disk app/public/data/route_plan_*.json files
// if the webhook is unreachable, so stale-but-recent plans still render
// during a Render outage.

const path = require('path')
const fs = require('fs')

const AGENT_URL = process.env.WEBHOOK_AGENT_URL || 'https://greenguard-agent-tmw2.onrender.com'

async function fetchFromWebhook() {
  const secret = process.env.CRON_SECRET
  if (!secret) return null
  try {
    const r = await fetch(`${AGENT_URL}/route-plans/latest`, {
      headers: { Authorization: `Bearer ${secret}` },
    })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

function fetchFromDisk() {
  try {
    const dataDir = path.join(process.cwd(), 'public', 'data')
    const files = fs.readdirSync(dataDir).filter((f) => f.startsWith('route_plan_') && f.endsWith('.json'))
    if (!files.length) return { plan: null, generatedAt: null }
    files.sort().reverse()
    const fp = path.join(dataDir, files[0])
    const plan = JSON.parse(fs.readFileSync(fp, 'utf8'))
    return { plan, generatedAt: fs.statSync(fp).mtime.toISOString() }
  } catch {
    return { plan: null, generatedAt: null }
  }
}

async function getLatestRoutePlan() {
  const fromWebhook = await fetchFromWebhook()
  if (fromWebhook) return { plan: fromWebhook, generatedAt: fromWebhook.generated_at || null }
  return fetchFromDisk()
}

module.exports = { getLatestRoutePlan }
