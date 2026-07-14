// Daily route email — fires at midnight CT. Pulls today's GCal bookings,
// resolves customer/tank metadata, renders an HTML route list, and emails
// bruce@ + admin@ so the tech sees the day's run before stepping out.

const { Resend } = require('resend')
const { getBookingsForDate } = require('../../../lib/gcal')
const { findContactsByEmails } = require('../../../lib/hubspot')
const { resolveByTitle, normalizeEventTitle } = require('../../../lib/sku-engine')
const { getDayForecast, formatForecastLine, isBadWeather } = require('../../../lib/weather')

const TZ = 'America/Chicago'
const SENDER = 'GreenGuard USA <admin@greenguard-usa.com>'
const RECIPIENTS = ['bruce@greenguard-usa.com', 'admin@greenguard-usa.com']

function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })
}

function todayCT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ })
}

function fmtLongDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric',
  })
}

function escapeHtml(s) {
  return String(s || '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]))
}

function renderHtml(date, stops, forecast) {
  const tankTotal = stops.reduce((s, x) => s + (x.tankCount || 0), 0)
  const forecastLine = forecast ? formatForecastLine(forecast) : null
  const bad = forecast && isBadWeather(forecast)

  const weatherBanner = bad ? `
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#3d0e0e;border:1px solid rgba(255,100,100,0.25);border-radius:8px;margin-bottom:10px">
    <tr>
      <td style="padding:12px 18px">
        <div style="color:#ffaaaa;font-size:10px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:3px">Weather Alert</div>
        <div style="color:#ffd5d5;font-size:13px">${forecast.rainProbability > 60 ? `${forecast.rainProbability}% rain` : ''}${forecast.rainProbability > 60 && forecast.windSpeedMph > 20 ? ' + ' : ''}${forecast.windSpeedMph > 20 ? `${Math.round(forecast.windSpeedMph)} mph winds` : ''}. Consider rescheduling barrier spray stops.</div>
      </td>
    </tr>
  </table>` : ''

  const rows = stops.map((s, i) => {
    const isLast = i === stops.length - 1
    const border = isLast ? '' : 'border-bottom:1px solid rgba(122,171,130,0.1);'
    return `
    <tr>
      <td style="padding:14px 8px 14px 18px;${border}vertical-align:middle;width:36px">
        <div style="width:26px;height:26px;line-height:26px;text-align:center;background:rgba(201,168,76,0.15);border:1px solid rgba(201,168,76,0.3);border-radius:6px;color:#c9a84c;font-size:12px;font-weight:900">${i + 1}</div>
      </td>
      <td style="padding:14px 12px;${border}vertical-align:middle">
        <div style="color:#ffffff;font-weight:800;font-size:14px;letter-spacing:-0.01em">${escapeHtml(s.customerName || 'Customer')}</div>
        ${s.title ? `<div style="color:#c9a84c;font-size:11px;font-weight:700;margin-top:2px;letter-spacing:0.02em">${escapeHtml(s.title)}</div>` : ''}
        ${s.address ? `<div style="margin-top:3px"><a href="https://maps.apple.com/?daddr=${encodeURIComponent(s.address)}" style="color:rgba(122,171,130,0.55);font-size:11px;text-decoration:none">${escapeHtml(s.address)}</a></div>` : ''}
        ${s.phone ? `<div style="margin-top:1px"><a href="tel:${s.phone.replace(/[^\d+]/g, '')}" style="color:rgba(122,171,130,0.45);font-size:11px;text-decoration:none">${escapeHtml(s.phone)}</a></div>` : ''}
      </td>
      <td style="padding:14px 18px 14px 8px;${border}vertical-align:middle;text-align:right;white-space:nowrap">
        <div style="color:#a8edc0;font-weight:800;font-size:13px">${fmtTime(s.startTime)}</div>
        ${s.tankCount > 0 ? `<div style="margin-top:5px"><span style="background:rgba(201,168,76,0.12);border:1px solid rgba(201,168,76,0.4);border-radius:4px;padding:3px 8px;color:#c9a84c;font-size:10px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase">${s.tankCount} Tank${s.tankCount === 1 ? '' : 's'}</span></div>` : ''}
      </td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a1a0d;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:20px 16px">

  <!-- Logo bar -->
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px">
    <tr>
      <td style="padding:0 4px">
        <span style="font-size:15px;font-weight:900;color:#ffffff;letter-spacing:-0.02em">Green<span style="color:#7dffaa">Guard</span> USA</span>
        <span style="color:rgba(122,171,130,0.4);font-size:13px;margin-left:10px">&middot; Daily Route</span>
      </td>
    </tr>
  </table>

  <!-- Hero card -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0d1a10 0%,#1a2e1f 50%,#2d4a32 100%);border:1px solid rgba(122,171,130,0.2);border-radius:12px;margin-bottom:10px">
    <tr>
      <td style="padding:22px 24px 10px">
        <div style="color:#c9a84c;font-size:10px;font-weight:800;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:8px">Today's Schedule</div>
        <div style="color:#ffffff;font-size:26px;font-weight:900;letter-spacing:-0.03em;line-height:1.1">${escapeHtml(fmtLongDate(date))}${forecastLine && !bad ? `<span style="color:rgba(122,171,130,0.5);font-size:12px;font-weight:600;letter-spacing:0;display:block;margin-top:4px">${escapeHtml(forecastLine)}</span>` : ''}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:12px 24px 20px">
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-right:8px"><span style="background:rgba(13,26,16,0.6);border:1px solid rgba(122,171,130,0.2);border-radius:6px;padding:6px 14px;color:#a8edc0;font-size:12px;font-weight:800;letter-spacing:0.04em;display:inline-block">${stops.length} Stop${stops.length === 1 ? '' : 's'}</span></td>
            <td><span style="background:rgba(13,26,16,0.6);border:1px solid rgba(122,171,130,0.2);border-radius:6px;padding:6px 14px;color:#a8edc0;font-size:12px;font-weight:800;letter-spacing:0.04em;display:inline-block">${tankTotal} Tank${tankTotal === 1 ? '' : 's'}</span></td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  ${weatherBanner}

  <!-- Stop list -->
  ${stops.length === 0
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#111c13;border:1px solid rgba(122,171,130,0.15);border-radius:12px;margin-bottom:12px"><tr><td style="padding:28px;text-align:center;color:rgba(122,171,130,0.4);font-size:14px">No appointments today.</td></tr></table>`
    : `<table width="100%" cellpadding="0" cellspacing="0" style="background:#111c13;border:1px solid rgba(122,171,130,0.15);border-radius:12px;overflow:hidden;margin-bottom:12px">${rows}</table>`
  }

  <!-- CTA -->
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
    <tr>
      <td style="text-align:center;padding:4px 0">
        <a href="https://portal.greenguard-usa.com/admin/rounds" style="display:inline-block;background:#c9a84c;color:#0a1a0d;font-weight:900;font-size:13px;padding:13px 36px;border-radius:6px;text-decoration:none;letter-spacing:0.08em;text-transform:uppercase">Open Rounds in Portal</a>
      </td>
    </tr>
  </table>

  <!-- Footer -->
  <div style="text-align:center;color:rgba(122,171,130,0.18);font-size:10px;letter-spacing:0.08em;text-transform:uppercase">GreenGuard USA &nbsp;&middot;&nbsp; 1519 Parkway, Austin TX 78703</div>
</div>
</body>
</html>`
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end()
  const { authorize } = require('../../../lib/cron-auth')
  if (!authorize(req, res)) return

  const date = req.query.date || todayCT()
  let bookings
  try {
    bookings = await getBookingsForDate(date)
  } catch (err) {
    const message = `route unavailable: ${err.message || err}`
    console.error('[daily-route] GCal error:', err)
    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: SENDER,
          to: RECIPIENTS,
          subject: `⚠️ ALERT: route unavailable — ${fmtLongDate(date)}`,
          html: `<p><strong>${escapeHtml(message)}</strong></p><p>No route email was sent because Google Calendar could not be read.</p>`,
        })
      } catch (alertErr) {
        console.error('[daily-route] alert email failed:', alertErr)
      }
    } else {
      console.error('[daily-route] alert email skipped: RESEND_API_KEY missing')
    }
    return res.status(500).json({ ok: false, error: message, date })
  }
  const forecast = await getDayForecast(date).catch(() => null)
  const sorted = bookings.sort((a, b) => new Date(a.startTime) - new Date(b.startTime))

  const emails = [...new Set(sorted.map((b) => b.email).filter(Boolean))]
  const contactMap = emails.length ? await findContactsByEmails(emails).catch(() => new Map()) : new Map()

  const stops = sorted.map((b) => {
    const resolved = resolveByTitle(normalizeEventTitle(b.title || ''))
    const contact = b.email ? contactMap.get(b.email.toLowerCase()) : null
    const p = contact?.properties || {}
    return {
      customerName: b.customerName || [p.firstname, p.lastname].filter(Boolean).join(' ') || 'Customer',
      title: b.title || '',
      address: b.address || p.address || '',
      phone: p.phone || '',
      startTime: b.startTime,
      tankCount: resolved?.tankCount || parseInt(p.tank_count || p.trap_count || '0', 10) || 0,
    }
  })

  if (!process.env.RESEND_API_KEY) return res.status(200).json({ ok: true, sent: false, reason: 'RESEND_API_KEY missing', stops: stops.length })

  const resend = new Resend(process.env.RESEND_API_KEY)
  const forecastSummary = forecast ? formatForecastLine(forecast) : null
  const weatherFlag = forecast && isBadWeather(forecast) ? ' ⚠️ weather' : ''
  try {
    await resend.emails.send({
      from: SENDER, to: RECIPIENTS,
      subject: `Today's route — ${stops.length} stop${stops.length === 1 ? '' : 's'} (${fmtLongDate(date)})${forecastSummary ? ` · ${forecastSummary}` : ''}${weatherFlag}`,
      html: renderHtml(date, stops, forecast),
    })
  } catch (err) {
    console.error('daily-route send error:', err)
    return res.status(500).json({ error: 'Failed to send route email' })
  }

  return res.status(200).json({ ok: true, sent: true, stops: stops.length, date, forecast: forecastSummary })
}
