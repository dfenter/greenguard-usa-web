// Daily route email — fires at midnight CT. Pulls today's GCal bookings,
// resolves customer/tank metadata, renders an HTML route list, and emails
// bruce@ + admin@ so the tech sees the day's run before stepping out.

const { Resend } = require('resend')
const { getBookingsForDate } = require('../../../lib/gcal')
const { findContactsByEmails } = require('../../../lib/hubspot')
const { resolveByTitle, normalizeEventTitle } = require('../../../lib/sku-engine')

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

function renderHtml(date, stops) {
  const tankTotal = stops.reduce((s, x) => s + (x.tankCount || 0), 0)
  const rows = stops.map((s, i) => `
    <tr style="border-top:1px solid #e7e7e7">
      <td style="padding:10px 8px;vertical-align:top;color:#666;font-size:12px;width:38px">${i + 1}</td>
      <td style="padding:10px 8px;vertical-align:top">
        <div style="font-weight:700;color:#1a2e1f">${escapeHtml(s.customerName || 'Customer')}</div>
        <div style="color:#666;font-size:13px">${escapeHtml(s.title || '')}</div>
        ${s.address ? `<div style="color:#888;font-size:12px;margin-top:2px"><a href="https://maps.apple.com/?daddr=${encodeURIComponent(s.address)}" style="color:#3d7a4a;text-decoration:none">${escapeHtml(s.address)}</a></div>` : ''}
        ${s.phone ? `<div style="color:#888;font-size:12px"><a href="tel:${s.phone.replace(/[^\d+]/g, '')}" style="color:#3d7a4a;text-decoration:none">${escapeHtml(s.phone)}</a></div>` : ''}
      </td>
      <td style="padding:10px 8px;vertical-align:top;text-align:right;white-space:nowrap;color:#1a2e1f;font-weight:700;font-size:14px">${fmtTime(s.startTime)}</td>
      <td style="padding:10px 8px;vertical-align:top;text-align:right;white-space:nowrap;color:${s.tankCount > 0 ? '#0d8a3c' : '#bbb'};font-weight:700">${s.tankCount > 0 ? `${s.tankCount} tank${s.tankCount === 1 ? '' : 's'}` : '—'}</td>
    </tr>`).join('')

  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:640px;margin:0 auto;color:#1a2e1f">
    <div style="background:#0d1a10;color:#7dffaa;padding:14px 18px;border-radius:8px 8px 0 0">
      <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700">GreenGuard USA · Route</div>
      <div style="font-size:20px;font-weight:900;margin-top:2px;color:#fff">${escapeHtml(fmtLongDate(date))}</div>
    </div>
    <div style="border:1px solid #ddd;border-top:none;padding:18px;background:#fff">
      <div style="display:flex;gap:18px;font-size:13px;color:#555;margin-bottom:14px;flex-wrap:wrap">
        <span><strong>${stops.length}</strong> stop${stops.length === 1 ? '' : 's'}</span>
        <span><strong>${tankTotal}</strong> tank${tankTotal === 1 ? '' : 's'} needed</span>
      </div>
      ${stops.length === 0
        ? '<div style="padding:20px;text-align:center;color:#888">No appointments today.</div>'
        : `<table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="color:#888;text-transform:uppercase;letter-spacing:.06em;font-size:10px"><th style="padding:6px 8px;text-align:left">#</th><th style="padding:6px 8px;text-align:left">Customer</th><th style="padding:6px 8px;text-align:right">Time</th><th style="padding:6px 8px;text-align:right">Tanks</th></tr></thead><tbody>${rows}</tbody></table>`}
      <p style="margin:18px 0 0;font-size:11px;color:#aaa">Open the full route on portal.greenguard-usa.com/admin/rounds for check-in + photos.</p>
    </div>
  </div>`
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end()
  if (req.headers['x-cron-key'] !== process.env.CRON_SECRET && req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const date = req.query.date || todayCT()
  const bookings = await getBookingsForDate(date)
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
      tankCount: resolved?.tankCount || 0,
    }
  })

  if (!process.env.RESEND_API_KEY) return res.status(200).json({ ok: true, sent: false, reason: 'RESEND_API_KEY missing', stops: stops.length })

  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: SENDER, to: RECIPIENTS,
    subject: `Today's route — ${stops.length} stop${stops.length === 1 ? '' : 's'} (${fmtLongDate(date)})`,
    html: renderHtml(date, stops),
  })

  return res.status(200).json({ ok: true, sent: true, stops: stops.length, date })
}
