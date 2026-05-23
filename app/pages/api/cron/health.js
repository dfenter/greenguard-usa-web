/**
 * GET /api/cron/health
 * Called by Vercel Cron every 5 minutes.
 * If any check fails, emails admin@greenguard-usa.com.
 * Protected: only Vercel's cron runner can call this (Authorization header check).
 */
const { Resend } = require('resend')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.greenguard-usa.com'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  // Vercel sets this header on cron invocations — reject all other callers
  const authHeader = req.headers.authorization
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Call the health endpoint internally
  const healthUrl = `${APP_URL}/api/health`
  let result
  try {
    const resp = await fetch(healthUrl, { headers: { 'User-Agent': 'GreenGuard-HealthCron/1.0' } })
    result = await resp.json()
  } catch (e) {
    result = { status: 'degraded', error: e.message, checks: {} }
  }

  if (result.status !== 'healthy') {
    const failedChecks = Object.entries(result.checks || {})
      .filter(([, v]) => !v.ok)
      .map(([name, v]) => `• ${name}: ${v.error || v.errors?.join(', ') || 'failed'}`)
      .join('\n')

    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: process.env.PORTAL_FROM_EMAIL || 'noreply@greenguard-usa.com',
        to: ADMIN_EMAIL,
        subject: `🔴 GreenGuard Portal Health Alert — ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/Chicago' })} CT`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;padding:24px;background:#fff;">
            <h2 style="color:#c0392b;margin:0 0 12px;">Portal Health Alert</h2>
            <p style="color:#555;margin:0 0 16px;">One or more services are degraded at <strong>${new Date().toISOString()}</strong>.</p>
            <pre style="background:#f5f5f5;padding:14px;border-radius:6px;font-size:0.85rem;white-space:pre-wrap;">${failedChecks}</pre>
            <a href="${APP_URL}/admin/health" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#0d1a10;color:#7dffaa;border-radius:6px;text-decoration:none;font-weight:700;">
              View Health Dashboard →
            </a>
            <p style="color:#aaa;font-size:0.75rem;margin-top:16px;">This alert fires automatically every time a health check fails. It will stop when services recover.</p>
          </div>`,
      }).catch(console.error)
    }
  }

  res.status(200).json({ checked: true, status: result.status, timestamp: new Date().toISOString() })
}
