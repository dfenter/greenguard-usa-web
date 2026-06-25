// Acuity-leak detector — hourly scan for Acuity-sourced bookings.
//
// Lists GCal events created in the last LOOKBACK_MIN minutes. Any whose
// description contains Acuity markers triggers an alert email to admin so
// the lingering booking source can be tracked down. Idempotent via the
// natural lookback window — duplicates would have to be created twice
// within ~70 minutes.
//
// Ported from _scripts/acuity-leak-detector.js (formerly a GitHub Actions
// Node job) so Cloudflare Workers Cron can drive it via HTTP.

const { Resend } = require('resend')
const { authorize } = require('../../../lib/cron-auth')

const ALERT_EMAIL = 'admin@greenguard-usa.com'
const LOOKBACK_MIN = 70

function isAcuityish(description) {
  if (!description) return false
  const d = description.toLowerCase()
  return (
    d.includes('acuityid=') ||
    d.includes('acuityscheduling.com') ||
    d.includes('acuity scheduling') ||
    /squarespace\.com\/[^\s]*appointments\/view\//i.test(description) ||
    d.includes('swordfish-triangle')
  )
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end()
  if (!authorize(req, res)) return

  try {
    // Lazy-load gcal so a misconfigured env (missing OAuth) returns a clean
    // JSON 500 instead of crashing module init.
    const { getCalendar } = require('../../../lib/gcal')
    const cal = getCalendar()

    const r = await cal.events.list({
      calendarId: 'admin@greenguard-usa.com',
      timeMin: new Date(Date.now() - 7 * 86400 * 1000).toISOString(),
      timeMax: new Date(Date.now() + 180 * 86400 * 1000).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    })

    const cutoff = new Date(Date.now() - LOOKBACK_MIN * 60 * 1000)
    const newAcuity = (r.data.items || []).filter((e) => {
      const created = new Date(e.created || 0)
      return created > cutoff && isAcuityish(e.description)
    })

    const scanned = (r.data.items || []).length
    if (newAcuity.length === 0) return res.status(200).json({ scanned, alerts: 0 })

    const lines = newAcuity.map((e) => {
      const start = e.start?.dateTime || e.start?.date
      return `<li><strong>${escapeHtml(e.summary || '(no title)')}</strong><br>
        start: ${escapeHtml(start)}<br>
        created: ${escapeHtml(e.created)}<br>
        event: <a href="${e.htmlLink}">open in GCal</a></li>`
    })

    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: 'GreenGuard Alerts <admin@greenguard-usa.com>',
      to: ALERT_EMAIL,
      subject: `⚠ Acuity leak: ${newAcuity.length} new booking${newAcuity.length === 1 ? '' : 's'}`,
      html: `
        <p>A new Acuity-sourced appointment landed in admin@greenguard-usa.com's calendar.
        The old Squarespace/Acuity link is still picking up customers somewhere.</p>
        <ul>${lines.join('')}</ul>
        <p>Track the source: check Google Ads final URLs, GMB booking link, social bios,
        and confirm <a href="https://swordfish-triangle-c6yr.squarespace.com/">the old
        Squarespace site</a> is redirected or unpublished.</p>
      `,
    })

    return res.status(200).json({ scanned, alerts: newAcuity.length })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
