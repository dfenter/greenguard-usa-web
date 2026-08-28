// Monthly close-package cron + on-demand. Triggered by:
//   POST /api/cron/books-close (CRON_SECRET) — closes prior calendar month
//   POST /api/cron/books-close?month=2026-05 — closes any month
//
// Generates the close HTML, emails it to admin@ via Resend, returns the
// computed numbers so /admin/books/close can render the same data.

const { buildClosePackage } = require('../../../lib/books-close')
const { Resend } = require('resend')
const biz = require('../../../lib/business.config')

function priorMonth() {
  const d = new Date()
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1)
  return d.toISOString().slice(0, 7)
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end()
  const { authorize } = require('../../../lib/cron-auth')
  if (!authorize(req, res)) return

  const month = req.query.month || priorMonth()
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month must be YYYY-MM' })

  try {
    const pkg = await buildClosePackage(month)
    // Email admin
    let emailSent = false
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: `GreenGuard Books <${biz.email}>`,
        to: biz.email,
        subject: `📘 Monthly Close — ${pkg.label} · Net $${(pkg.pnl.net / 100).toFixed(2)}`,
        html: pkg.html,
      })
      emailSent = true
    }
    // Strip the giant html from the response payload
    const { html, ...summary } = pkg
    return res.status(200).json({ ok: true, emailSent, ...summary })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
