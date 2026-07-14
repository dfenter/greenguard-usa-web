/**
 * GET /api/health
 * Checks every critical dependency. Called by cron, uptime monitors, and the admin dashboard.
 * Returns 200 if all systems healthy, 503 if any are degraded.
 */
const { stripe } = require('../../lib/stripe')
const { Client } = require('@hubspot/api-client')
const { getTrafficOverview } = require('../../lib/ga4')
const { getSessionFromRequest, isAdminEmail } = require('../../lib/auth')
const { authorize } = require('../../lib/cron-auth')

const REQUIRED_ENV = [
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
  'HUBSPOT_ACCESS_TOKEN',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN',
  'JWT_SECRET', 'RESEND_API_KEY',
  'NEXT_PUBLIC_APP_URL',
]

function withTimeout(promise, timeoutMs = 8000) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Health check timed out after ${timeoutMs}ms`)), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

async function checkStripe() {
  const start = Date.now()
  try {
    await withTimeout(stripe.customers.list({ limit: 1 }))
    return { ok: true, latency: Date.now() - start }
  } catch (e) {
    return { ok: false, error: e.message, latency: Date.now() - start }
  }
}

async function checkHubSpot() {
  const start = Date.now()
  try {
    const client = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN })
    await withTimeout(client.crm.contacts.basicApi.getPage(1))
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
    await withTimeout(cal.calendarList.list({ maxResults: 1 }))
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

async function checkMetaToken() {
  const token = process.env.META_SYSTEM_USER_TOKEN
  if (!token) return { ok: true, warning: 'META_SYSTEM_USER_TOKEN not set — ads attribution disabled' }
  const start = Date.now()
  try {
    const r = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${token}`, { signal: AbortSignal.timeout(8000) })
    const d = await r.json()
    if (d.error) return { ok: false, error: `Meta token invalid: ${d.error.message}`, latency: Date.now() - start }
    return { ok: true, latency: Date.now() - start }
  } catch (e) {
    return { ok: false, error: e.message, latency: Date.now() - start }
  }
}

async function checkCalcom() {
  const key = process.env.CALCOM_API_KEY
  if (!key) return { ok: false, error: 'CALCOM_API_KEY not set' }
  const start = Date.now()
  try {
    const r = await fetch('https://api.cal.com/v2/event-types', {
      headers: { Authorization: `Bearer ${key}`, 'cal-api-version': '2024-06-14' },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return { ok: false, error: `Cal.com API returned ${r.status}`, latency: Date.now() - start }
    return { ok: true, latency: Date.now() - start }
  } catch (e) {
    return { ok: false, error: e.message, latency: Date.now() - start }
  }
}

async function checkGA4() {
  const configured = !!(process.env.GOOGLE_ANALYTICS_PROPERTY_ID)
  if (!configured) return { ok: true, warning: 'GA4 property ID not set — Traffic tab disabled' }
  const start = Date.now()
  try {
    await withTimeout(getTrafficOverview())
    return { ok: true, latency: Date.now() - start }
  } catch (e) {
    return { ok: false, error: e.message, latency: Date.now() - start }
  }
}

async function checkPageSSR() {
  // Smoke-test the data fetches that dashboard getServerSideProps runs.
  // Catches broken imports, bad destructuring, and missing function exports
  // before real users hit them.
  const start = Date.now()
  try {
    const { getSubscriptions, getInvoices, getCustomer } = require('../../lib/stripe')
    const { getUpcomingBookingsForEmail, getPastBookingsForEmail } = require('../../lib/gcal')
    const { findContactByEmail } = require('../../lib/hubspot')

    // Verify all functions are callable (not undefined)
    const fns = { getSubscriptions, getInvoices, getCustomer, getUpcomingBookingsForEmail, getPastBookingsForEmail, findContactByEmail }
    const missing = Object.entries(fns).filter(([, f]) => typeof f !== 'function').map(([k]) => k)
    if (missing.length) return { ok: false, error: `Missing exports: ${missing.join(', ')}` }

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

  if (req.query.deep !== '1') {
    res.setHeader('Cache-Control', 'public, max-age=60')
    return res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString(), version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local' })
  }

  const session = await getSessionFromRequest(req, res)
  if (!session || !isAdminEmail(session.email)) {
    if (!authorize(req, res)) return
  }

  const t = Date.now()
  const env = checkEnvVars()

  // Run all checks in parallel
  const [stripeResult, hubspotResult, calResult, resendResult, ga4Result, ssrResult, metaResult, calcomResult] = await Promise.all([
    checkStripe().catch((e) => ({ ok: false, error: e.message })),
    checkHubSpot().catch((e) => ({ ok: false, error: e.message })),
    checkGoogleCalendar().catch((e) => ({ ok: false, error: e.message })),
    checkResend(),
    checkGA4().catch((e) => ({ ok: false, error: e.message })),
    checkPageSSR().catch((e) => ({ ok: false, error: e.message })),
    checkMetaToken().catch((e) => ({ ok: false, error: e.message })),
    checkCalcom().catch((e) => ({ ok: false, error: e.message })),
  ])

  // GA4 is non-critical — traffic tab degrades gracefully, mark as warning not failure
  const ga4Warning = !ga4Result.ok
    ? { ok: true, warning: `GA4 degraded (non-critical): ${ga4Result.error} — enable Google Analytics Data API in Cloud Console` }
    : ga4Result

  const checks = {
    env,
    page_ssr: ssrResult,
    stripe: stripeResult,
    hubspot: hubspotResult,
    google_calendar: calResult,
    resend: resendResult,
    ga4: ga4Warning,
    meta_token: metaResult,
    calcom: calcomResult,
  }

  // Critical checks only (GA4 and Meta excluded — they degrade gracefully)
  const criticalChecks = { env, page_ssr: ssrResult, stripe: stripeResult, hubspot: hubspotResult, google_calendar: calResult, resend: resendResult, calcom: calcomResult }
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
