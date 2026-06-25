/**
 * Ad conversion tracking health check.
 *
 * Fires LIVE probe calls at all three conversion pipelines and verifies each
 * still works — this is the check that would have caught the 2026-06-15
 * meltdown (v17 sunset, wrong creds, invalid conversion ID, system_generated
 * action_source) months earlier. Dashboards and webhook logs all looked fine
 * while every pipeline silently failed; only live probes expose that.
 *
 * Probes (none create real conversions):
 *   1. Google Ads — validateOnly uploadClickConversions with a dummy gclid.
 *      Expects a gclid-decode error (= conversion action resolves), NOT a
 *      "conversion action not found" / auth error.
 *   2. Google Ads — a campaign query (confirms login-customer-id + creds, the
 *      same path the /admin/analytics dashboard uses).
 *   3. Meta CAPI — a test_event_code Lead event; expects events_received >= 1.
 *   4. GA4 Measurement Protocol — debug endpoint; expects empty validationMessages.
 *
 * On any failure: emails admin + posts to ops Slack.
 * Auth: Vercel Cron (GET Bearer) or external x-cron-key. See lib/cron-auth.
 */
const { Resend } = require('resend')
const { authorize } = require('../../../lib/cron-auth')
const { postToOps } = require('../../../lib/slack')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

async function googleAdsToken() {
  const { google } = require('googleapis')
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN })
  const { token } = await auth.getAccessToken()
  return token
}

function googleAdsHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    ...(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID && { 'login-customer-id': process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID }),
    'Content-Type': 'application/json',
  }
}

async function checkGoogleConversionAction() {
  const cid = process.env.GOOGLE_ADS_CUSTOMER_ID
  const ca = process.env.GOOGLE_ADS_CONVERSION_ID
  if (!cid || !ca) return { ok: false, error: 'GOOGLE_ADS_CUSTOMER_ID / CONVERSION_ID not set' }
  const token = await googleAdsToken()
  const r = await fetch(`https://googleads.googleapis.com/v21/customers/${cid}:uploadClickConversions`, {
    method: 'POST', headers: googleAdsHeaders(token),
    body: JSON.stringify({
      validateOnly: true, partialFailure: true,
      conversions: [{
        gclid: 'health_probe_dummy_gclid',
        conversion_action: `customers/${cid}/conversionActions/${ca}`,
        conversion_date_time: new Date().toISOString().replace('T', ' ').replace('Z', '+00:00'),
        conversion_value: 1, currency_code: 'USD',
      }],
    }),
  })
  const d = await r.json()
  const msg = JSON.stringify(d.partialFailureError || d.error || d)
  // A dummy gclid SHOULD be rejected. A missing/invalid conversion action or
  // auth failure is the real problem we are watching for.
  if (/not found|INVALID_CONVERSION_ACTION|does not exist|PERMISSION_DENIED|authentication|developer token/i.test(msg)) {
    return { ok: false, error: `conversion action unresolved/auth: ${msg.slice(0, 200)}` }
  }
  if (r.status >= 500 || /<!DOCTYPE/i.test(msg)) return { ok: false, error: `endpoint error (sunset?): HTTP ${r.status}` }
  return { ok: true }
}

async function checkGoogleDashboardRead() {
  const cid = process.env.GOOGLE_ADS_CUSTOMER_ID
  const token = await googleAdsToken()
  const r = await fetch(`https://googleads.googleapis.com/v21/customers/${cid}/googleAds:search`, {
    method: 'POST', headers: googleAdsHeaders(token),
    body: JSON.stringify({ query: 'SELECT campaign.id FROM campaign LIMIT 1' }),
  })
  const d = await r.json()
  if (d.error) return { ok: false, error: `dashboard read: ${d.error.message?.slice(0, 200)}` }
  return { ok: true }
}

async function checkMetaCapi() {
  const token = process.env.META_SYSTEM_USER_TOKEN
  const pixel = process.env.NEXT_PUBLIC_FB_PIXEL_ID || '2225826221565752'
  if (!token) return { ok: false, error: 'META_SYSTEM_USER_TOKEN not set' }
  const r = await fetch(`https://graph.facebook.com/v21.0/${pixel}/events?access_token=${token}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      test_event_code: 'HEALTHPROBE',
      data: [{
        event_name: 'Lead',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: 'https://www.greenguard-usa.com/book',
        event_id: 'health_probe',
        user_data: { client_ip_address: '8.8.8.8', client_user_agent: 'GreenGuard-HealthProbe/1.0' },
      }],
    }),
  })
  const d = await r.json()
  if (d.error) return { ok: false, error: `Meta CAPI: ${d.error.message?.slice(0, 200)}` }
  if (!(d.events_received >= 1)) return { ok: false, error: `Meta CAPI: events_received=${d.events_received}` }
  return { ok: true }
}

async function checkGa4() {
  const secret = process.env.GA4_API_SECRET
  const mid = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
  if (!secret || !mid) return { ok: false, error: 'GA4_API_SECRET / measurement id not set' }
  const r = await fetch(`https://www.google-analytics.com/debug/mp/collect?measurement_id=${mid}&api_secret=${secret}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: 'health.probe', events: [{ name: 'purchase', params: { transaction_id: 'health_probe', value: 1, currency: 'USD' } }] }),
  })
  const d = await r.json()
  const msgs = d.validationMessages || []
  if (msgs.length) return { ok: false, error: `GA4: ${JSON.stringify(msgs).slice(0, 200)}` }
  return { ok: true }
}

export default async function handler(req, res) {
  if (!authorize(req, res)) return

  const checks = {}
  for (const [name, fn] of [
    ['google_conversion_action', checkGoogleConversionAction],
    ['google_dashboard_read', checkGoogleDashboardRead],
    ['meta_capi', checkMetaCapi],
    ['ga4_measurement_protocol', checkGa4],
  ]) {
    try { checks[name] = await fn() }
    catch (e) { checks[name] = { ok: false, error: e.message?.slice(0, 200) } }
  }

  const failed = Object.entries(checks).filter(([, v]) => !v.ok)
  const status = failed.length ? 'degraded' : 'healthy'

  if (failed.length) {
    const lines = failed.map(([n, v]) => `• ${n}: ${v.error}`).join('\n')
    await postToOps(`🚨 Ad tracking health check FAILED:\n${lines}`).catch(() => {})
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: process.env.PORTAL_FROM_EMAIL || 'noreply@greenguard-usa.com',
        to: ADMIN_EMAIL,
        subject: `⚠️ Ad conversion tracking degraded — ${failed.length} pipeline(s) failing`,
        text: `One or more ad conversion pipelines are failing live probes:\n\n${lines}\n\nThese fail silently in production — fix promptly or ad spend optimizes blind.`,
      }).catch(() => {})
    }
  }

  return res.status(status === 'healthy' ? 200 : 500).json({ status, checks, at: new Date().toISOString() })
}
