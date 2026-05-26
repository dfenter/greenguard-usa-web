// Daily 7am brief — emails admin@ with cash + A/R + anomalies + churn risk.

const { buildDailyBrief } = require('../../../lib/books-daily')
const { Resend } = require('resend')

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (req.headers['x-cron-key'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    const brief = await buildDailyBrief()
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'GreenGuard Books <noreply@greenguard-usa.com>',
        to: 'admin@greenguard-usa.com',
        subject: `☀ Morning brief · ${(brief.bal.available / 100).toFixed(2)} avail · ${brief.ar.length} aged · ${brief.anomalies.length} anomalies`,
        html: brief.html,
      })
    }
    const { html, ...summary } = brief
    return res.status(200).json({ ok: true, ...summary })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
