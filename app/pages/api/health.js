/**
 * GET /api/health
 * Checks every critical dependency. Called by cron, uptime monitors, and the admin dashboard.
 * Returns 200 if all systems healthy, 503 if any are degraded.
 */
const { stripe } = require('../../lib/stripe')
const { Client } = require('@hubspot/api-client')
const { getTrafficOverview } = require('../../lib/ga4')

const REQUIRED_ENV = [
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
  'HUBSPOT_ACCESS_TOKEN',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN',
  'JWT_SECRET', 'RESEND_API_KEY',
  'NEXT_PUBLIC_APP_URL',
]

async function checkStripe() {
  const start = Date.now()
  try {
    await stripe.customers.list({ limit: 1 })
    return { ok: true, latency: Date.now() - start }
  } catch (e) {
    return { ok: false, error: e.message, latency: Date.now() - start }
  }
}

async function checkHubSpot() {
  const start = Date.now()
  try {
    const client = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN })
    await client.crm.contacts.basicApi.getPage(1)
    return { ok: true, latency: Date.now() - start }
  } catch (e) {
    return { ok: false, error: e.message, latency: Date.now() - start }
  }
}

async function checkGoogleCalendar() {
  const start = Date.now()
  try {
    const { google } = require('googleapis')
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const cal = google.calendar({ version: 'v3', auth })
    await cal.calendarList.list({ maxResults: 1 })
    return { ok: true, latency: Date.now() - start }
  } catch (e) {
    return { ok: false, error: e.message, latency: Date.now() - start }
  }
}

async function checkResend() {
  // Validate API key format — we don't send a real email
  const key = process.env.RESEND_API_KEY || ''
  const ok = key.startsWith('re_') && key.length > 10
  return { ok, error: ok ? undefined : 'RESEND_API_KEY missing or malformed' }
}

async function checkGA4() {
  const configured = !!(process.env.GOOGLE_ANALYTICS_PROPERTY_ID)
  if (!configured) return { ok: true, warning: 'GA4 property ID not set — Traffic tab disabled' }
  const start = Date.now()
  try {
    await getTrafficOverview()
    return { ok: true, latency: Date.now() - start }
  } catch (e) {
    return { ok: false, error: e.message, latency: Date.now() - start }
  }
}

function checkEnvVars() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k])
  const jwtOk = (process.env.JWT_SECRET || '').length >= 32
  const errors = [
    ...missing.map((k) => `${k} not set`),
    ...(!jwtOk ? ['JWT_SECRET must be at least 32 chars'] : []),
  ]
  return { ok: errors.length === 0, errors }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const t = Date.now()
  const env = checkEnvVars()

  // Run all checks in parallel
  const [stripeResult, hubspotResult, calResult, resendResult, ga4Result] = await Promise.all([
    checkStripe().catch((e) => ({ ok: false, error: e.message })),
    checkHubSpot().catch((e) => ({ ok: false, error: e.message })),
    checkGoogleCalendar().catch((e) => ({ ok: false, error: e.message })),
    checkResend(),
    checkGA4().catch((e) => ({ ok: false, error: e.message })),
  ])

  // GA4 is non-critical — traffic tab degrades gracefully, mark as warning not failure
  const ga4Warning = !ga4Result.ok
    ? { ok: true, warning: `GA4 degraded (non-critical): ${ga4Result.error} — enable Google Analytics Data API in Cloud Console` }
    : ga4Result

  const checks = {
    env,
    stripe: stripeResult,
    hubspot: hubspotResult,
    google_calendar: calResult,
    resend: resendResult,
    ga4: ga4Warning,
  }

  // Critical checks only (GA4 excluded — it's optional)
  const criticalChecks = { env, stripe: stripeResult, hubspot: hubspotResult, google_calendar: calResult, resend: resendResult }
  const allOk = Object.values(criticalChecks).every((c) => c.ok)
  const degraded = Object.values(criticalChecks).some((c) => !c.ok)

  const status = degraded ? 'degraded' : 'healthy'
  const httpStatus = allOk ? 200 : 503

  res.setHeader('Cache-Control', 'no-store')
  res.status(httpStatus).json({
    status,
    timestamp: new Date().toISOString(),
    totalMs: Date.now() - t,
    checks,
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local',
  })
}
