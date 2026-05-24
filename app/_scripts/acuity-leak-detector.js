#!/usr/bin/env node
// Acuity-leak detector.
//
// Lists GCal events created in the last hour. If any contain Acuity markers
// (description references squarespace.com appointments URL, AcuityID=, or
// "Acuity Scheduling"), emails admin@greenguard-usa.com so the source can
// be tracked down. Idempotent — the alert email itself reports the new ones;
// it doesn't try to mark events as "seen" (the hour-window naturally bounds
// duplicates).
//
// Run hourly via .github/workflows/cron-acuity-leak-detector.yml
//
// Env:
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN
//   RESEND_API_KEY
//   ALERT_EMAIL (default admin@greenguard-usa.com)

const { google } = require('googleapis')
const { Resend } = require('resend')

const ALERT_EMAIL = process.env.ALERT_EMAIL || 'admin@greenguard-usa.com'
const LOOKBACK_MIN = parseInt(process.env.LOOKBACK_MIN || '70', 10)  // 70 min so an hourly cron doesn't miss anything at the edges

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

async function main() {
  const oauth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  oauth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  const cal = google.calendar({ version: 'v3', auth: oauth })

  // Scan the next 180 days, since Acuity creates events for future dates
  const res = await cal.events.list({
    calendarId: 'admin@greenguard-usa.com',
    timeMin: new Date(Date.now() - 7 * 86400 * 1000).toISOString(),
    timeMax: new Date(Date.now() + 180 * 86400 * 1000).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
  })

  const cutoff = new Date(Date.now() - LOOKBACK_MIN * 60 * 1000)
  const newAcuity = (res.data.items || []).filter((e) => {
    const created = new Date(e.created || 0)
    return created > cutoff && isAcuityish(e.description)
  })

  console.log(`scanned: ${(res.data.items || []).length} events, new Acuity within ${LOOKBACK_MIN}min: ${newAcuity.length}`)

  if (newAcuity.length === 0) return

  const lines = newAcuity.map((e) => {
    const start = e.start?.dateTime || e.start?.date
    const created = e.created
    return `<li><strong>${escape(e.summary || '(no title)')}</strong><br>
      start: ${escape(start)}<br>
      created: ${escape(created)}<br>
      event: <a href="${e.htmlLink}">open in GCal</a></li>`
  })

  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: 'GreenGuard Alerts <noreply@greenguard-usa.com>',
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
  console.log('alert sent to', ALERT_EMAIL)
}

function escape(s) {
  return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
}

main().catch((e) => {
  console.error('detector failed:', e.message)
  process.exit(1)
})
