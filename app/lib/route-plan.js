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

// Module-level cache: route plans change at most once a week (Monday optimizer run).
// 90s TTL avoids hitting the Render agent on every admin page load while staying
// fresh enough to reflect a manual re-run within 2 minutes.
let _cache = null
let _cacheTs = 0
const CACHE_TTL_MS = 90_000

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

function currentIsoWeek() {
  const now = new Date()
  // ISO week-year can differ from calendar year at year boundaries (Dec 29–31 / Jan 1–3).
  // Compute the Thursday of the current week — its calendar year IS the ISO week-year.
  const thursday = new Date(now)
  thursday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + 3)
  const isoYear = thursday.getFullYear()
  const jan4 = new Date(isoYear, 0, 4)
  const startOfWeek1 = new Date(jan4)
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7))
  const weekNum = Math.floor((now - startOfWeek1) / (7 * 86400 * 1000)) + 1
  return `${isoYear}-W${String(weekNum).padStart(2, '0')}`
}

function fetchFromDisk() {
  try {
    const dataDir = path.join(process.cwd(), 'public', 'data')
    const files = fs.readdirSync(dataDir).filter((f) => f.startsWith('route_plan_') && f.endsWith('.json'))
    if (!files.length) return { plan: null, generatedAt: null }
    const currentWeek = currentIsoWeek()
    // Prefer the current week or the most recent past week — never a future week
    const eligible = files
      .map((f) => ({ f, week: f.replace('route_plan_', '').replace('.json', '') }))
      .filter(({ week }) => week <= currentWeek)
      .sort((a, b) => b.week.localeCompare(a.week))
    // If no eligible files, fall back to the most recent file regardless of week
    // (sorts week labels lexicographically; year-prefixed format YYYY-WNN is safe across years)
    const chosen = eligible.length
      ? eligible[0].f
      : files
          .map((f) => ({ f, week: f.replace('route_plan_', '').replace('.json', '') }))
          .sort((a, b) => b.week.localeCompare(a.week))[0].f
    const fp = path.join(dataDir, chosen)
    try {
      const plan = JSON.parse(fs.readFileSync(fp, 'utf8'))
      return { plan, generatedAt: fs.statSync(fp).mtime.toISOString() }
    } catch (parseErr) {
      console.error('[route-plan] Failed to parse', chosen, parseErr.message)
      return { plan: null, generatedAt: null }
    }
  } catch {
    return { plan: null, generatedAt: null }
  }
}

async function getLatestRoutePlan() {
  const now = Date.now()
  if (_cache && (now - _cacheTs) < CACHE_TTL_MS) return _cache

  const fromWebhook = await fetchFromWebhook()
  const result = fromWebhook
    ? { plan: fromWebhook, generatedAt: fromWebhook.generated_at || null }
    : fetchFromDisk()

  _cache = result
  _cacheTs = now
  return result
}

module.exports = { getLatestRoutePlan }
