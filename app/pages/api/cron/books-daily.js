// Daily 7am brief — emails admin@ with cash + A/R + anomalies + churn risk.

const { buildDailyBrief } = require('../../../lib/books-daily')
const { Resend } = require('resend')
const biz = require('../../../lib/business.config')

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end()
  const { authorize } = require('../../../lib/cron-auth')
  if (!authorize(req, res)) return
  try {
    const brief = await buildDailyBrief()
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: `GreenGuard Books <${biz.email}>`,
        to: biz.email,
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
