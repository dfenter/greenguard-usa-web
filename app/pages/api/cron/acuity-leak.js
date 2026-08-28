// Acuity-leak detector — hourly scan for Acuity-sourced bookings.
//
// Lists GCal events created in the last LOOKBACK_MIN minutes. Any whose
// description contains Acuity markers triggers an alert email to admin so
// the lingering booking source can be tracked down. Each event is claimed in
// KV for seven days so repeated scans do not resend the same alert.
//
// Ported from _scripts/acuity-leak-detector.js (formerly a GitHub Actions
// Node job) so Cloudflare Workers Cron can drive it via HTTP.

const { Resend } = require('resend')
const { authorize } = require('../../../lib/cron-auth')
const { consumeJti } = require('../../../lib/auth')
const biz = require('../../../lib/business.config')

const ALERT_EMAIL = biz.ownerEmail
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
      calendarId: biz.calendarId,
      timeMin: new Date(Date.now() - 7 * 86400 * 1000).toISOString(),
      timeMax: new Date(Date.now() + 180 * 86400 * 1000).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    })

    const cutoff = new Date(Date.now() - LOOKBACK_MIN * 60 * 1000)
    const candidates = (r.data.items || []).filter((e) => {
      const created = new Date(e.created || 0)
      return created > cutoff && isAcuityish(e.description)
    })

    const scanned = (r.data.items || []).length
    // Claim each event independently so one already-alerted event does not
    // suppress a different leak found in the same scan. Alerting wins if KV is
    // unavailable; a missed duplicate alert is safer than hiding a leak.
    const newAcuity = []
    for (const event of candidates) {
      if (!event.id) {
        console.warn('[acuity-leak] event has no id; alerting without a claim')
        newAcuity.push(event)
        continue
      }
      try {
        if (await consumeJti(`acuity-leak:${event.id}`, 7 * 24 * 60 * 60)) newAcuity.push(event)
      } catch (e) {
        console.warn(`[acuity-leak] claim failed for ${event.id}; alerting anyway:`, e.message)
        newAcuity.push(event)
      }
    }
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
      from: biz.alertsFrom,
      to: ALERT_EMAIL,
      subject: `⚠ Acuity leak: ${newAcuity.length} new booking${newAcuity.length === 1 ? '' : 's'}`,
      html: `
        <p>A new Acuity-sourced appointment landed in ${biz.email}'s calendar.
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
